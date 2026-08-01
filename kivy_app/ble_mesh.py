"""
MeshNet-AI -- ble_mesh.py
=========================
Serverless BLE GATT Dual-Role Mesh Controller.

Architecture
------------
Every device is simultaneously:
  - A GATT Server  : advertises the MeshNet service UUID so other nodes can
                     discover and connect to this device.
  - A GATT Client  : scans for remote GATT servers advertising the same UUID,
                     connects to them, and exchanges node identity / GPS payloads.

This forms a fully decentralised, infrastructure-free multi-hop chain.  No TCP,
no UDP, no HTTP server, no port binding of any kind.

All Android Java API calls are made via pyjnius autoclass / JavaProxy.  The
module is guarded so that importing it on a desktop (for unit-testing) does not
raise ImportError -- all Android-specific code is contained within
_AndroidBLEBackend which is only instantiated when platform == "android".

Thread safety
-------------
Android BLE callbacks arrive on the Android Binder thread pool, completely
outside Kivy's main thread.  Every mutation of shared state is protected by a
threading.Lock.  All user-facing callbacks are dispatched onto the Kivy main
thread via kivy.clock.Clock.schedule_once so the UI layer never needs to worry
about thread safety.

Public entry point
------------------
    from ble_mesh import BLEMeshController

    def on_connected(node_id, gps, rssi):
        map_widget.add_node(node_id, gps, rssi)

    def on_disconnected(node_id):
        map_widget.remove_node(node_id)

    def on_data(node_id, payload_bytes):
        messaging_engine.ingest(node_id, payload_bytes)

    ctrl = BLEMeshController(
        on_node_connected    = on_connected,
        on_node_disconnected = on_disconnected,
        on_data_received     = on_data,
    )
    ctrl.start()   # idempotent
    ...
    ctrl.stop()    # graceful teardown
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Callable, Dict, Optional, Tuple

from kivy.clock import Clock
from kivy.utils import platform

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MeshNet service / characteristic UUIDs
# All devices in the mesh must share these identifiers exactly.
# ---------------------------------------------------------------------------

# Primary service UUID -- identifies this app's BLE mesh service.
MESHNET_SERVICE_UUID      = "0000FEED-0000-1000-8000-00805F9B34FB"

# Characteristic used to exchange node identity + GPS JSON payload.
MESHNET_CHAR_IDENTITY_UUID = "0000FEE1-0000-1000-8000-00805F9B34FB"

# Characteristic used to exchange arbitrary message payloads.
MESHNET_CHAR_MSG_UUID      = "0000FEE2-0000-1000-8000-00805F9B34FB"

# CCCD descriptor UUID (standard BLE Client Characteristic Configuration)
CCCD_UUID                  = "00002902-0000-1000-8000-00805F9B34FB"

# Maximum peers we keep simultaneous GATT connections to (resource budget).
MAX_CONCURRENT_PEERS = 6

# Scan window: restart scan every N seconds to catch newly appearing nodes.
SCAN_RESTART_INTERVAL_S = 15.0

# Seconds to wait after a failed connect before retrying the same device.
RECONNECT_BACKOFF_S = 8.0

# Payload version byte prepended to every identity advertisement.
PAYLOAD_VERSION = 0x01

# ---------------------------------------------------------------------------
# GPS coordinate type alias
# ---------------------------------------------------------------------------
GpsCoords = Tuple[float, float]   # (latitude, longitude)


# ---------------------------------------------------------------------------
# PeerNode -- internal bookkeeping per discovered remote peer
# ---------------------------------------------------------------------------

class PeerNode:
    """
    Represents one discovered remote BLE peer.

    Attributes
    ----------
    address          : BLE MAC address string (or pseudo-UUID on API >= 33)
    node_id          : application-level identifier extracted from identity payload
    gps              : (lat, lon) received from the peer's identity payload
    rssi             : last measured signal strength in dBm
    gatt             : live android.bluetooth.BluetoothGatt JNI proxy (or None)
    connected        : True while a GATT connection is established
    last_seen        : monotonic timestamp of last activity
    connect_attempts : count of consecutive failed connection attempts
    """

    __slots__ = (
        "address", "node_id", "gps", "rssi",
        "gatt", "connected", "last_seen", "connect_attempts",
    )

    def __init__(self, address: str) -> None:
        self.address          = address
        self.node_id          = address        # overwritten when identity arrives
        self.gps              : GpsCoords = (0.0, 0.0)
        self.rssi             : int = -127
        self.gatt             = None           # BluetoothGatt JNI object
        self.connected        : bool = False
        self.last_seen        : float = time.monotonic()
        self.connect_attempts : int = 0


# ---------------------------------------------------------------------------
# BLEMeshController -- public facade
# ---------------------------------------------------------------------------

class BLEMeshController:
    """
    High-level serverless BLE mesh controller.

    Instantiate once, call start() on app launch and stop() on app exit.
    Subscribe to the three callbacks to receive topology events.

    Parameters
    ----------
    on_node_connected    : called when a peer GATT connection is established and
                           the identity payload has been exchanged.
                           Signature: (node_id: str, gps: GpsCoords, rssi: int)
    on_node_disconnected : called when a peer disconnects or is evicted.
                           Signature: (node_id: str)
    on_data_received     : called when a message payload arrives from a peer.
                           Signature: (node_id: str, data: bytes)
    local_gps_provider   : optional callable returning the current device's
                           (lat, lon) as a tuple of floats.  If None the identity
                           payload advertises (0.0, 0.0).
    """

    def __init__(
        self,
        on_node_connected    : Optional[Callable[[str, GpsCoords, int], None]] = None,
        on_node_disconnected : Optional[Callable[[str], None]] = None,
        on_data_received     : Optional[Callable[[str, bytes], None]] = None,
        local_gps_provider   : Optional[Callable[[], GpsCoords]] = None,
    ) -> None:
        self._cb_connected    = on_node_connected
        self._cb_disconnected = on_node_disconnected
        self._cb_data         = on_data_received
        self._gps_provider    = local_gps_provider

        self._running  = False
        self._backend  : Optional[_AndroidBLEBackend] = None

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def start(self) -> None:
        """
        Enable Bluetooth (silently), start GATT server, begin scanning.
        Safe to call multiple times -- idempotent via _running guard.
        """
        if self._running:
            logger.debug("[BLE-CTRL] start() called but already running.")
            return

        self._running = True
        logger.info("[BLE-CTRL] Starting BLE mesh controller.")

        if platform == "android":
            self._backend = _AndroidBLEBackend(
                cb_connected    = self._fire_connected,
                cb_disconnected = self._fire_disconnected,
                cb_data         = self._fire_data,
                gps_provider    = self._gps_provider,
            )
            self._backend.start()
        else:
            # Non-Android: run the desktop stub so Kivy development works.
            logger.info("[BLE-CTRL] Non-Android platform -- running stub backend.")
            self._backend = _StubBLEBackend(
                cb_connected    = self._fire_connected,
                cb_disconnected = self._fire_disconnected,
                cb_data         = self._fire_data,
            )
            self._backend.start()

    def stop(self) -> None:
        """Gracefully shut down GATT server, scanner, and all connections."""
        if not self._running:
            return
        self._running = False
        if self._backend is not None:
            self._backend.stop()
            self._backend = None
        logger.info("[BLE-CTRL] BLE mesh controller stopped.")

    def broadcast_message(self, data: bytes) -> None:
        """
        Write *data* to the message characteristic of every connected peer.
        Call from any thread -- the backend serialises the writes.
        """
        if self._backend is not None:
            self._backend.broadcast_message(data)

    @property
    def connected_peers(self) -> Dict[str, PeerNode]:
        """Return a snapshot dict of currently connected peers keyed by node_id."""
        if self._backend is not None:
            return self._backend.snapshot_peers()
        return {}

    # -----------------------------------------------------------------------
    # Internal Kivy-thread-safe callback dispatchers
    # -----------------------------------------------------------------------

    def _fire_connected(self, node_id: str, gps: GpsCoords, rssi: int) -> None:
        """Schedule on_node_connected on the Kivy main thread."""
        if self._cb_connected is not None:
            Clock.schedule_once(
                lambda dt: self._cb_connected(node_id, gps, rssi), 0
            )

    def _fire_disconnected(self, node_id: str) -> None:
        """Schedule on_node_disconnected on the Kivy main thread."""
        if self._cb_disconnected is not None:
            Clock.schedule_once(
                lambda dt: self._cb_disconnected(node_id), 0
            )

    def _fire_data(self, node_id: str, data: bytes) -> None:
        """Schedule on_data_received on the Kivy main thread."""
        if self._cb_data is not None:
            Clock.schedule_once(
                lambda dt: self._cb_data(node_id, data), 0
            )


# ---------------------------------------------------------------------------
# _AndroidBLEBackend -- all pyjnius / Android API interaction lives here
# ---------------------------------------------------------------------------

class _AndroidBLEBackend:
    """
    Concrete Android BLE backend.

    Responsibilities
    ----------------
    1. Force-enable BluetoothAdapter if needed.
    2. Build and start a BluetoothLeAdvertiser (GATT server advertisement).
    3. Open a BluetoothGattServer to accept inbound connections.
    4. Run a BluetoothLeScanner that discovers peers advertising MESHNET_SERVICE_UUID.
    5. For each discovered peer, open a BluetoothGatt client connection.
    6. Handle all GattCallback events; parse identity payloads; fire app callbacks.
    7. Manage a reconnect scheduler for dropped peers.
    """

    def __init__(
        self,
        cb_connected    : Callable,
        cb_disconnected : Callable,
        cb_data         : Callable,
        gps_provider    : Optional[Callable[[], GpsCoords]],
    ) -> None:
        self._cb_connected    = cb_connected
        self._cb_disconnected = cb_disconnected
        self._cb_data         = cb_data
        self._gps_provider    = gps_provider

        # Peer registry: BLE address -> PeerNode
        self._peers     : Dict[str, PeerNode] = {}
        self._peers_lock = threading.Lock()

        # Set of addresses we are currently attempting to connect to (prevents
        # duplicate parallel connection attempts to the same device).
        self._connecting : set[str] = set()

        self._running   = False

        # Android JNI object references (populated in start())
        self._bt_adapter       = None
        self._bt_manager       = None
        self._le_advertiser    = None
        self._le_scanner       = None
        self._gatt_server      = None
        self._activity         = None

        # Java UUID / class references cached after first resolution
        self._UUID_cls         = None
        self._ParcelUuid_cls   = None

        # Background threads
        self._scan_thread      : Optional[threading.Thread] = None
        self._reconnect_thread : Optional[threading.Thread] = None

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    def start(self) -> None:
        """Initialise Android BLE stack and begin advertising + scanning."""
        self._running = True
        try:
            self._resolve_java_classes()
            self._acquire_bluetooth_adapter()
            self._force_enable_bluetooth()
            self._start_gatt_server()
            self._start_advertising()
        except Exception as exc:
            logger.error("[BLE-AND] Fatal init error: %s", exc, exc_info=True)
            self._running = False
            return

        # Scanning runs in a Python thread so we can restart it periodically.
        self._scan_thread = threading.Thread(
            target=self._scan_loop,
            daemon=False,  # Changed to non-daemon for proper shutdown
            name="ble-scan",
        )
        self._scan_thread.start()

        # Reconnect scheduler thread handles dropped peers with backoff.
        self._reconnect_thread = threading.Thread(
            target=self._reconnect_loop,
            daemon=False,  # Changed to non-daemon for proper shutdown
            name="ble-reconnect",
        )
        self._reconnect_thread.start()
        logger.info("[BLE-AND] Backend started successfully.")

    def stop(self) -> None:
        """Shut down advertising, scanner, GATT server, and all client connections."""
        self._running = False

        # Stop advertiser
        try:
            if self._le_advertiser is not None:
                self._le_advertiser.stopAdvertising(self._adv_callback)
        except Exception as exc:
            logger.debug("[BLE-AND] Stop advertising error (non-fatal): %s", exc)

        # Stop scanner
        try:
            if self._le_scanner is not None:
                self._le_scanner.stopScan(self._scan_callback)
        except Exception as exc:
            logger.debug("[BLE-AND] Stop scan error (non-fatal): %s", exc)

        # Wait for background threads to finish before accessing locks
        if self._scan_thread is not None and self._scan_thread.is_alive():
            self._scan_thread.join(timeout=5.0)
        if self._reconnect_thread is not None and self._reconnect_thread.is_alive():
            self._reconnect_thread.join(timeout=5.0)

        # Small delay to ensure threads have fully cleaned up
        import time
        time.sleep(0.1)

        # Close all client GATT connections
        with self._peers_lock:
            for peer in list(self._peers.values()):
                self._close_gatt(peer)

        # Close GATT server
        try:
            if self._gatt_server is not None:
                self._gatt_server.close()
        except Exception as exc:
            logger.debug("[BLE-AND] GATT server close error (non-fatal): %s", exc)

        logger.info("[BLE-AND] Backend stopped.")

    # -----------------------------------------------------------------------
    # Public helpers called by BLEMeshController
    # -----------------------------------------------------------------------

    def broadcast_message(self, data: bytes) -> None:
        """Write *data* to the message characteristic of all connected peers."""
        with self._peers_lock:
            targets = [p for p in self._peers.values() if p.connected and p.gatt]

        for peer in targets:
            try:
                self._write_characteristic(
                    peer.gatt,
                    MESHNET_SERVICE_UUID,
                    MESHNET_CHAR_MSG_UUID,
                    data,
                )
            except Exception as exc:
                logger.warning(
                    "[BLE-AND] broadcast_message to %s failed: %s", peer.node_id, exc
                )

    def snapshot_peers(self) -> Dict[str, PeerNode]:
        """Return a shallow copy of the connected peer dict."""
        with self._peers_lock:
            return {
                nid: p for nid, p in self._peers.items() if p.connected
            }

    # -----------------------------------------------------------------------
    # Step 1 -- resolve Java class references (cached)
    # -----------------------------------------------------------------------

    def _resolve_java_classes(self) -> None:
        from jnius import autoclass   # type: ignore

        # Core BLE classes
        self._BluetoothAdapter      = autoclass("android.bluetooth.BluetoothAdapter")
        self._BluetoothManager      = autoclass("android.bluetooth.BluetoothManager")
        self._BluetoothDevice       = autoclass("android.bluetooth.BluetoothDevice")
        self._BluetoothGatt         = autoclass("android.bluetooth.BluetoothGatt")
        self._BluetoothGattCallback = autoclass("android.bluetooth.BluetoothGattCallback")
        self._BluetoothGattServer   = autoclass("android.bluetooth.BluetoothGattServer")
        self._BluetoothGattServerCallback = autoclass(
            "android.bluetooth.BluetoothGattServerCallback"
        )
        self._BluetoothGattService  = autoclass("android.bluetooth.BluetoothGattService")
        self._BluetoothGattChar     = autoclass(
            "android.bluetooth.BluetoothGattCharacteristic"
        )
        self._BluetoothGattDesc     = autoclass(
            "android.bluetooth.BluetoothGattDescriptor"
        )

        # LE Advertiser / Scanner
        self._AdvertiseCallback     = autoclass(
            "android.bluetooth.le.AdvertiseCallback"
        )
        self._AdvertiseData         = autoclass("android.bluetooth.le.AdvertiseData")
        self._AdvertiseSettings     = autoclass(
            "android.bluetooth.le.AdvertiseSettings"
        )
        self._ScanCallback          = autoclass("android.bluetooth.le.ScanCallback")
        self._ScanFilter            = autoclass("android.bluetooth.le.ScanFilter")
        self._ScanSettings          = autoclass("android.bluetooth.le.ScanSettings")

        # Android utility classes
        self._UUID_cls              = autoclass("java.util.UUID")
        self._ParcelUuid_cls        = autoclass("android.os.ParcelUuid")
        self._ArrayList_cls         = autoclass("java.util.ArrayList")
        self._Context               = autoclass("android.content.Context")
        self._PythonActivity        = autoclass("org.kivy.android.PythonActivity")

        self._activity = self._PythonActivity.mActivity
        logger.debug("[BLE-AND] Java classes resolved.")

    # -----------------------------------------------------------------------
    # Step 2 -- acquire BluetoothAdapter
    # -----------------------------------------------------------------------

    def _acquire_bluetooth_adapter(self) -> None:
        self._bt_manager = self._activity.getSystemService(
            self._Context.BLUETOOTH_SERVICE
        )
        if self._bt_manager is None:
            raise RuntimeError("BluetoothManager unavailable on this device.")

        self._bt_adapter = self._bt_manager.getAdapter()
        if self._bt_adapter is None:
            raise RuntimeError(
                "BluetoothAdapter is None -- device has no BLE hardware."
            )
        logger.info("[BLE-AND] BluetoothAdapter acquired.")

    # -----------------------------------------------------------------------
    # Step 3 -- force-enable Bluetooth without user interaction
    #
    # On API >= 33, apps targeting SDK 33 cannot silently call enable().
    # The method is still callable if BLUETOOTH_CONNECT is granted AND the
    # app holds MANAGE_BLUETOOTH (system/priv-app permission).  Since this
    # app is sideloaded / device-owner-granted, we attempt the call and log
    # the result.  If it fails, we fall through -- the rest of the BLE stack
    # still starts once Bluetooth is manually turned on.
    # -----------------------------------------------------------------------

    def _force_enable_bluetooth(self) -> None:
        try:
            if not self._bt_adapter.isEnabled():
                result = self._bt_adapter.enable()
                if result:
                    logger.info("[BLE-AND] Bluetooth silently enabled via adapter.enable().")
                    # Give the adapter a moment to finish powering on.
                    time.sleep(2.0)
                else:
                    logger.warning(
                        "[BLE-AND] adapter.enable() returned false -- "
                        "Bluetooth may require manual activation on this API level."
                    )
            else:
                logger.info("[BLE-AND] Bluetooth already enabled.")
        except Exception as exc:
            logger.warning(
                "[BLE-AND] Silent BT enable failed (non-fatal): %s", exc
            )

    # -----------------------------------------------------------------------
    # Step 4 -- open GATT Server (peripheral / broadcaster role)
    # -----------------------------------------------------------------------

    def _start_gatt_server(self) -> None:
        # Build the server callback via JavaProxy
        server_cb = _GattServerCallbackProxy(backend=self)

        self._gatt_server = self._bt_manager.openGattServer(
            self._activity, server_cb
        )
        if self._gatt_server is None:
            raise RuntimeError("openGattServer() returned None.")

        # Build and add the MeshNet GATT service
        service_uuid = self._UUID_cls.fromString(MESHNET_SERVICE_UUID)
        service = self._BluetoothGattService(
            service_uuid,
            self._BluetoothGattService.SERVICE_TYPE_PRIMARY,
        )

        # Identity characteristic (READ | NOTIFY)
        id_char = self._BluetoothGattChar(
            self._UUID_cls.fromString(MESHNET_CHAR_IDENTITY_UUID),
            (
                self._BluetoothGattChar.PROPERTY_READ
                | self._BluetoothGattChar.PROPERTY_NOTIFY
            ),
            self._BluetoothGattChar.PERMISSION_READ,
        )

        # CCCD descriptor required for NOTIFY to work
        cccd = self._BluetoothGattDesc(
            self._UUID_cls.fromString(CCCD_UUID),
            (
                self._BluetoothGattDesc.PERMISSION_READ
                | self._BluetoothGattDesc.PERMISSION_WRITE
            ),
        )
        id_char.addDescriptor(cccd)

        # Message characteristic (WRITE | WRITE_NO_RESPONSE | NOTIFY)
        msg_char = self._BluetoothGattChar(
            self._UUID_cls.fromString(MESHNET_CHAR_MSG_UUID),
            (
                self._BluetoothGattChar.PROPERTY_WRITE
                | self._BluetoothGattChar.PROPERTY_WRITE_NO_RESPONSE
                | self._BluetoothGattChar.PROPERTY_NOTIFY
            ),
            (
                self._BluetoothGattChar.PERMISSION_READ
                | self._BluetoothGattChar.PERMISSION_WRITE
            ),
        )

        service.addCharacteristic(id_char)
        service.addCharacteristic(msg_char)
        self._gatt_server.addService(service)

        # Pre-populate identity characteristic value so READ requests resolve immediately
        id_char.setValue(self._build_identity_payload())

        # Store reference for later value updates
        self._id_characteristic = id_char
        logger.info("[BLE-AND] GATT server started with MeshNet service.")

    # -----------------------------------------------------------------------
    # Step 5 -- start LE advertising
    # -----------------------------------------------------------------------

    def _start_advertising(self) -> None:
        self._le_advertiser = self._bt_adapter.getBluetoothLeAdvertiser()
        if self._le_advertiser is None:
            logger.warning(
                "[BLE-AND] getBluetoothLeAdvertiser() returned None -- "
                "device may not support BLE peripheral mode."
            )
            return

        settings = (
            self._AdvertiseSettings.Builder()
            .setAdvertiseMode(self._AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(self._AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(True)
            .build()
        )

        service_uuid = self._ParcelUuid_cls(
            self._UUID_cls.fromString(MESHNET_SERVICE_UUID)
        )
        adv_data = (
            self._AdvertiseData.Builder()
            .addServiceUuid(service_uuid)
            .setIncludeDeviceName(False)
            .setIncludeTxPowerLevel(False)
            .build()
        )

        self._adv_callback = _AdvertiseCallbackProxy()
        self._le_advertiser.startAdvertising(settings, adv_data, self._adv_callback)
        logger.info("[BLE-AND] BLE advertising started.")

    # -----------------------------------------------------------------------
    # Step 6 -- scan loop (runs in background thread)
    # -----------------------------------------------------------------------

    def _scan_loop(self) -> None:
        """
        Periodically (re)start BLE scans to discover new peers.
        Scans run for SCAN_RESTART_INTERVAL_S then are restarted, which forces
        Android to flush any scan-result deduplication cache and re-report
        devices that went offline and came back.
        """
        while self._running:
            try:
                self._start_single_scan()
            except Exception as exc:
                logger.error("[BLE-AND] Scan start error: %s", exc)
            time.sleep(SCAN_RESTART_INTERVAL_S)
            try:
                if self._le_scanner is not None and self._scan_callback is not None:
                    self._le_scanner.stopScan(self._scan_callback)
            except Exception as exc:
                logger.debug("[BLE-AND] stopScan error (non-fatal): %s", exc)

    def _start_single_scan(self) -> None:
        self._le_scanner = self._bt_adapter.getBluetoothLeScanner()
        if self._le_scanner is None:
            logger.warning("[BLE-AND] BluetoothLeScanner not available.")
            return

        service_uuid = self._ParcelUuid_cls(
            self._UUID_cls.fromString(MESHNET_SERVICE_UUID)
        )

        scan_filter = (
            self._ScanFilter.Builder()
            .setServiceUuid(service_uuid)
            .build()
        )

        filters = self._ArrayList_cls()
        filters.add(scan_filter)

        scan_settings = (
            self._ScanSettings.Builder()
            .setScanMode(self._ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        )

        self._scan_callback = _ScanCallbackProxy(backend=self)
        self._le_scanner.startScan(filters, scan_settings, self._scan_callback)
        logger.debug("[BLE-AND] BLE scan started.")

    # -----------------------------------------------------------------------
    # Step 7 -- connect to a discovered peer
    # -----------------------------------------------------------------------

    def on_device_found(self, address: str, rssi: int) -> None:
        """
        Called by _ScanCallbackProxy when a MeshNet device is found.
        Runs on the Android scanner callback thread.
        """
        with self._peers_lock:
            if address in self._connecting:
                return   # already attempting connection
            if address in self._peers and self._peers[address].connected:
                # Refresh RSSI and last_seen for already-connected peers
                self._peers[address].rssi = rssi
                self._peers[address].last_seen = time.monotonic()
                return
            if len(self._peers) >= MAX_CONCURRENT_PEERS:
                logger.debug(
                    "[BLE-AND] Peer cap reached (%d) -- ignoring %s.",
                    MAX_CONCURRENT_PEERS, address,
                )
                return
            if address not in self._peers:
                self._peers[address] = PeerNode(address)
            self._peers[address].rssi = rssi
            self._connecting.add(address)

        logger.info("[BLE-AND] Connecting to discovered peer %s (rssi=%d).", address, rssi)
        self._connect_to_address(address)

    def _connect_to_address(self, address: str) -> None:
        """
        Initiate a GATT client connection to the remote device at *address*.
        Must NOT hold _peers_lock when called (connectGatt can block briefly).
        """
        try:
            device = self._bt_adapter.getRemoteDevice(address)
            gatt_cb = _GattClientCallbackProxy(backend=self, address=address)
            # autoConnect=False: direct connection attempt, fastest for nearby nodes.
            gatt = device.connectGatt(self._activity, False, gatt_cb)
            with self._peers_lock:
                if address in self._peers:
                    self._peers[address].gatt = gatt
        except Exception as exc:
            logger.error("[BLE-AND] connectGatt to %s failed: %s", address, exc)
            with self._peers_lock:
                self._connecting.discard(address)
                if address in self._peers:
                    self._peers[address].connect_attempts += 1

    # -----------------------------------------------------------------------
    # GATT client event handlers  (called by _GattClientCallbackProxy)
    # -----------------------------------------------------------------------

    def on_gatt_connected(self, address: str, gatt) -> None:
        """
        Connection established -- discover services before exchanging data.
        """
        logger.info("[BLE-AND] GATT connected to %s.", address)
        with self._peers_lock:
            self._connecting.discard(address)
            if address in self._peers:
                self._peers[address].connected = True
                self._peers[address].connect_attempts = 0
        try:
            gatt.discoverServices()
        except Exception as exc:
            logger.error("[BLE-AND] discoverServices failed for %s: %s", address, exc)

    def on_gatt_disconnected(self, address: str) -> None:
        """
        Connection dropped -- mark peer as disconnected; reconnect scheduler
        will retry after backoff.
        """
        logger.info("[BLE-AND] GATT disconnected from %s.", address)
        node_id = address
        with self._peers_lock:
            self._connecting.discard(address)
            if address in self._peers:
                peer = self._peers[address]
                peer.connected = False
                node_id = peer.node_id
                self._close_gatt(peer)   # release GATT resources
        self._cb_disconnected(node_id)

    def on_services_discovered(self, address: str, gatt) -> None:
        """
        Service discovery complete -- read identity characteristic to learn
        the remote node's ID and GPS coordinates.
        """
        logger.debug("[BLE-AND] Services discovered for %s.", address)
        try:
            service = gatt.getService(
                self._UUID_cls.fromString(MESHNET_SERVICE_UUID)
            )
            if service is None:
                logger.warning(
                    "[BLE-AND] MeshNet service not found on %s -- disconnecting.", address
                )
                gatt.disconnect()
                return

            id_char = service.getCharacteristic(
                self._UUID_cls.fromString(MESHNET_CHAR_IDENTITY_UUID)
            )
            if id_char is None:
                logger.warning(
                    "[BLE-AND] Identity characteristic missing on %s.", address
                )
                gatt.disconnect()
                return

            # Enble notifications for the identity characteristic
            gatt.setCharacteristicNotification(id_char, True)

            # Trigger an immediate read so we don't wait for a notify
            gatt.readCharacteristic(id_char)

        except Exception as exc:
            logger.error(
                "[BLE-AND] on_services_discovered error for %s: %s", address, exc
            )

    def on_characteristic_read(
        self, address: str, char_uuid: str, value: bytes
    ) -> None:
        """
        Characteristic read complete.  Parse identity payload if relevant.
        """
        if char_uuid.upper() == MESHNET_CHAR_IDENTITY_UUID.upper():
            self._ingest_identity(address, value)
        else:
            with self._peers_lock:
                node_id = self._peers[address].node_id if address in self._peers else address
            self._cb_data(node_id, value)

    def on_characteristic_changed(
        self, address: str, char_uuid: str, value: bytes
    ) -> None:
        """
        Notification / indication arrived from a connected peer.
        """
        if char_uuid.upper() == MESHNET_CHAR_IDENTITY_UUID.upper():
            self._ingest_identity(address, value)
        elif char_uuid.upper() == MESHNET_CHAR_MSG_UUID.upper():
            with self._peers_lock:
                node_id = self._peers[address].node_id if address in self._peers else address
            self._cb_data(node_id, value)

    def on_characteristic_write(self, address: str, status: int) -> None:
        """Write confirmation (GATT_SUCCESS = 0x00)."""
        if status != 0x00:
            logger.warning(
                "[BLE-AND] Write to %s returned non-success status 0x%02X.",
                address, status,
            )

    # -----------------------------------------------------------------------
    # GATT server event handlers  (called by _GattServerCallbackProxy)
    # -----------------------------------------------------------------------

    def on_server_connection_state_changed(
        self, device_address: str, connected: bool
    ) -> None:
        """
        A remote GATT client connected to or disconnected from our server.
        We track them in the same _peers registry to avoid double-counting
        bidirectional connections.
        """
        if connected:
            logger.info("[BLE-AND] Inbound GATT connection from %s.", device_address)
            with self._peers_lock:
                if device_address not in self._peers:
                    self._peers[device_address] = PeerNode(device_address)
                self._peers[device_address].connected = True
        else:
            logger.info("[BLE-AND] Inbound GATT disconnected from %s.", device_address)
            with self._peers_lock:
                if device_address in self._peers:
                    self._peers[device_address].connected = False

    def on_server_characteristic_write_request(
        self, device_address: str, char_uuid: str, value: bytes
    ) -> None:
        """
        A connected client wrote to our message characteristic.
        Forward the payload to the application callback.
        """
        with self._peers_lock:
            node_id = (
                self._peers[device_address].node_id
                if device_address in self._peers
                else device_address
            )
        self._cb_data(node_id, value)

    # -----------------------------------------------------------------------
    # Reconnect scheduler (background thread)
    # -----------------------------------------------------------------------

    def _reconnect_loop(self) -> None:
        """
        Periodically inspect the peer registry and reconnect any peer that
        dropped its connection and has not exceeded a reasonable attempt count.
        """
        while self._running:
            time.sleep(RECONNECT_BACKOFF_S)
            if not self._running:
                break
            with self._peers_lock:
                candidates = [
                    addr for addr, p in self._peers.items()
                    if not p.connected
                    and addr not in self._connecting
                    and p.connect_attempts < 10
                ]
            for addr in candidates:
                logger.info(
                    "[BLE-AND] Reconnect attempt for dropped peer %s.", addr
                )
                with self._peers_lock:
                    if addr in self._peers:
                        self._peers[addr].connect_attempts += 1
                        self._connecting.add(addr)
                self._connect_to_address(addr)

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _build_identity_payload(self) -> bytes:
        """
        Serialise local node identity to bytes for the GATT identity characteristic.

        Payload schema (JSON, UTF-8):
          {
            "v"  : <int>   -- payload version
            "id" : <str>   -- local node identifier (device BT address)
            "lat": <float> -- current GPS latitude
            "lon": <float> -- current GPS longitude
          }
        """
        lat, lon = (0.0, 0.0)
        if self._gps_provider is not None:
            try:
                lat, lon = self._gps_provider()
            except Exception as exc:
                logger.debug("[BLE-AND] GPS provider error: %s", exc)

        local_id = "UNKNOWN"
        try:
            local_id = self._bt_adapter.getAddress()
        except Exception:
            pass

        payload = json.dumps(
            {"v": PAYLOAD_VERSION, "id": local_id, "lat": lat, "lon": lon},
            separators=(",", ":"),
        )
        return payload.encode("utf-8")

    def _ingest_identity(self, address: str, raw: bytes) -> None:
        """
        Parse an identity payload received from *address* and update the
        peer registry.  Fires the connected callback if this is first contact.
        """
        try:
            payload = json.loads(raw.decode("utf-8"))
            node_id = payload.get("id", address)
            lat     = float(payload.get("lat", 0.0))
            lon     = float(payload.get("lon", 0.0))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "[BLE-AND] Failed to parse identity from %s: %s", address, exc
            )
            return

        first_contact = False
        with self._peers_lock:
            if address in self._peers:
                peer = self._peers[address]
                first_contact = peer.node_id == address   # still default value
                peer.node_id     = node_id
                peer.gps         = (lat, lon)
                peer.last_seen   = time.monotonic()
                rssi             = peer.rssi

        if first_contact:
            logger.info(
                "[BLE-AND] Identity established: address=%s node_id=%s gps=(%f,%f)",
                address, node_id, lat, lon,
            )
            self._cb_connected(node_id, (lat, lon), rssi)

    def _write_characteristic(
        self, gatt, service_uuid: str, char_uuid: str, data: bytes
    ) -> None:
        """
        Write *data* to a specific characteristic on a connected GATT client.
        Uses WRITE_TYPE_NO_RESPONSE for lowest latency.
        """
        service = gatt.getService(self._UUID_cls.fromString(service_uuid))
        if service is None:
            logger.warning("[BLE-AND] _write_characteristic: service not found.")
            return
        char = service.getCharacteristic(self._UUID_cls.fromString(char_uuid))
        if char is None:
            logger.warning("[BLE-AND] _write_characteristic: characteristic not found.")
            return
        from jnius import autoclass  # type: ignore
        BluetoothGattChar = autoclass("android.bluetooth.BluetoothGattCharacteristic")
        char.setWriteType(BluetoothGattChar.WRITE_TYPE_NO_RESPONSE)
        char.setValue(data)
        gatt.writeCharacteristic(char)

    @staticmethod
    def _close_gatt(peer: PeerNode) -> None:
        """Disconnect and release GATT resources for *peer*.  Safe to call multiple times."""
        if peer.gatt is not None:
            try:
                peer.gatt.disconnect()
            except Exception:
                pass
            try:
                peer.gatt.close()
            except Exception:
                pass
            peer.gatt = None


# ---------------------------------------------------------------------------
# _GattClientCallbackProxy
# Implements android.bluetooth.BluetoothGattCallback via JavaProxy
# ---------------------------------------------------------------------------

def _make_gatt_client_callback(backend: _AndroidBLEBackend, address: str):
    """
    Factory that creates a BluetoothGattCallback Java proxy bound to *backend*
    and *address*.  Using a factory avoids circular import issues with jnius.
    """
    from jnius import autoclass, JavaProxy   # type: ignore

    BluetoothGatt    = autoclass("android.bluetooth.BluetoothGatt")
    BluetoothProfile = autoclass("android.bluetooth.BluetoothProfile")

    class GattClientCB(JavaProxy):
        """
        BluetoothGattCallback proxy.

        All methods are invoked on the Android Binder thread pool.
        They immediately delegate to the Python backend which is fully
        thread-safe (all shared state behind _peers_lock).
        """

        __javainterfaces__ = ["android/bluetooth/BluetoothGattCallback"]

        def onConnectionStateChange(self, gatt, status, newState):
            # newState == BluetoothProfile.STATE_CONNECTED  (2)
            # newState == BluetoothProfile.STATE_DISCONNECTED (0)
            if newState == BluetoothProfile.STATE_CONNECTED:
                backend.on_gatt_connected(address, gatt)
            else:
                backend.on_gatt_disconnected(address)

        def onServicesDiscovered(self, gatt, status):
            if status == BluetoothGatt.GATT_SUCCESS:
                backend.on_services_discovered(address, gatt)
            else:
                logger.warning(
                    "[BLE-CB] Service discovery failed for %s status=%d.", address, status
                )
                try:
                    gatt.disconnect()
                except Exception:
                    pass

        def onCharacteristicRead(self, gatt, characteristic, status):
            if status == BluetoothGatt.GATT_SUCCESS:
                char_uuid = str(characteristic.getUuid())
                value     = bytes(characteristic.getValue())
                backend.on_characteristic_read(address, char_uuid, value)

        def onCharacteristicChanged(self, gatt, characteristic):
            char_uuid = str(characteristic.getUuid())
            value     = bytes(characteristic.getValue())
            backend.on_characteristic_changed(address, char_uuid, value)

        def onCharacteristicWrite(self, gatt, characteristic, status):
            backend.on_characteristic_write(address, status)

        def onReadRemoteRssi(self, gatt, rssi, status):
            if status == BluetoothGatt.GATT_SUCCESS:
                with backend._peers_lock:
                    if address in backend._peers:
                        backend._peers[address].rssi = rssi

        def onMtuChanged(self, gatt, mtu, status):
            logger.debug("[BLE-CB] MTU changed for %s: mtu=%d status=%d.", address, mtu, status)

    return GattClientCB()


# We store the proxy objects on the backend to prevent garbage collection.
class _GattClientCallbackProxy:
    """Thin wrapper that instantiates and holds the JavaProxy alive."""

    def __init__(self, backend: _AndroidBLEBackend, address: str) -> None:
        self._proxy = _make_gatt_client_callback(backend, address)

    def __getattr__(self, item):
        return getattr(self._proxy, item)


# ---------------------------------------------------------------------------
# _GattServerCallbackProxy
# Implements android.bluetooth.BluetoothGattServerCallback via JavaProxy
# ---------------------------------------------------------------------------

def _make_gatt_server_callback(backend: _AndroidBLEBackend):
    from jnius import JavaProxy, autoclass  # type: ignore

    BluetoothProfile = autoclass("android.bluetooth.BluetoothProfile")
    BluetoothGatt    = autoclass("android.bluetooth.BluetoothGatt")

    class GattServerCB(JavaProxy):
        __javainterfaces__ = ["android/bluetooth/BluetoothGattServerCallback"]

        def onConnectionStateChange(self, device, status, newState):
            addr = str(device.getAddress())
            connected = (newState == BluetoothProfile.STATE_CONNECTED)
            backend.on_server_connection_state_changed(addr, connected)

        def onCharacteristicWriteRequest(
            self, device, requestId, characteristic, preparedWrite, responseNeeded, offset, value
        ):
            addr      = str(device.getAddress())
            char_uuid = str(characteristic.getUuid())
            raw       = bytes(value)
            backend.on_server_characteristic_write_request(addr, char_uuid, raw)
            if responseNeeded:
                try:
                    backend._gatt_server.sendResponse(
                        device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value
                    )
                except Exception as exc:
                    logger.debug("[BLE-SRV] sendResponse error: %s", exc)

        def onCharacteristicReadRequest(
            self, device, requestId, offset, characteristic
        ):
            # Serve the current identity payload on every read request
            try:
                backend._gatt_server.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    offset,
                    backend._build_identity_payload(),
                )
            except Exception as exc:
                logger.debug("[BLE-SRV] sendResponse (read) error: %s", exc)

        def onDescriptorWriteRequest(
            self, device, requestId, descriptor, preparedWrite, responseNeeded, offset, value
        ):
            if responseNeeded:
                try:
                    backend._gatt_server.sendResponse(
                        device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value
                    )
                except Exception as exc:
                    logger.debug("[BLE-SRV] descriptor sendResponse error: %s", exc)

        def onServiceAdded(self, status, service):
            logger.info(
                "[BLE-SRV] Service added: uuid=%s status=%d",
                str(service.getUuid()), status,
            )

    return GattServerCB()


class _GattServerCallbackProxy:
    """Thin wrapper that instantiates and holds the server JavaProxy alive."""

    def __init__(self, backend: _AndroidBLEBackend) -> None:
        self._proxy = _make_gatt_server_callback(backend)

    def __getattr__(self, item):
        return getattr(self._proxy, item)


# ---------------------------------------------------------------------------
# _ScanCallbackProxy
# Implements android.bluetooth.le.ScanCallback via JavaProxy
# ---------------------------------------------------------------------------

def _make_scan_callback(backend: _AndroidBLEBackend):
    from jnius import JavaProxy  # type: ignore

    class ScanCB(JavaProxy):
        __javainterfaces__ = ["android/bluetooth/le/ScanCallback"]

        def onScanResult(self, callbackType, result):
            try:
                device  = result.getDevice()
                address = str(device.getAddress())
                rssi    = int(result.getRssi())
                backend.on_device_found(address, rssi)
            except Exception as exc:
                logger.debug("[BLE-SCAN] onScanResult error: %s", exc)

        def onBatchScanResults(self, results):
            # Iterate over the Java List of ScanResult objects
            try:
                for i in range(results.size()):
                    r = results.get(i)
                    device  = r.getDevice()
                    address = str(device.getAddress())
                    rssi    = int(r.getRssi())
                    backend.on_device_found(address, rssi)
            except Exception as exc:
                logger.debug("[BLE-SCAN] onBatchScanResults error: %s", exc)

        def onScanFailed(self, errorCode):
            logger.error("[BLE-SCAN] Scan failed with error code %d.", errorCode)

    return ScanCB()


class _ScanCallbackProxy:
    def __init__(self, backend: _AndroidBLEBackend) -> None:
        self._proxy = _make_scan_callback(backend)

    def __getattr__(self, item):
        return getattr(self._proxy, item)


# ---------------------------------------------------------------------------
# _AdvertiseCallbackProxy
# Implements android.bluetooth.le.AdvertiseCallback via JavaProxy
# ---------------------------------------------------------------------------

def _make_advertise_callback():
    from jnius import JavaProxy  # type: ignore

    class AdvCB(JavaProxy):
        __javainterfaces__ = ["android/bluetooth/le/AdvertiseCallback"]

        def onStartSuccess(self, settingsInEffect):
            logger.info("[BLE-ADV] Advertising started successfully.")

        def onStartFailure(self, errorCode):
            logger.error(
                "[BLE-ADV] Advertising failed to start. errorCode=%d", errorCode
            )

    return AdvCB()


class _AdvertiseCallbackProxy:
    def __init__(self) -> None:
        self._proxy = _make_advertise_callback()

    def __getattr__(self, item):
        return getattr(self._proxy, item)


# ---------------------------------------------------------------------------
# _StubBLEBackend -- desktop/CI stub (fires synthetic events for UI testing)
# ---------------------------------------------------------------------------

class _StubBLEBackend:
    """
    Non-Android stub that emits synthetic peer events so the Kivy UI layer
    can be tested on a desktop without a physical Android device.

    Synthetic behaviour:
      - After 2 s: connects two fake peers.
      - After 6 s: connects a third peer.
      - After 14 s: disconnects the second peer.
    """

    def __init__(
        self,
        cb_connected    : Callable,
        cb_disconnected : Callable,
        cb_data         : Callable,
    ) -> None:
        self._cb_connected    = cb_connected
        self._cb_disconnected = cb_disconnected
        self._cb_data         = cb_data
        self._running         = False
        self._thread          : Optional[threading.Thread] = None
        self._peers           : Dict[str, PeerNode] = {}

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(
            target=self._stub_loop, daemon=True, name="ble-stub"
        )
        self._thread.start()
        logger.info("[BLE-STUB] Stub backend started.")

    def stop(self) -> None:
        self._running = False
        logger.info("[BLE-STUB] Stub backend stopped.")

    def broadcast_message(self, data: bytes) -> None:
        logger.debug("[BLE-STUB] broadcast_message (stub): %r", data)

    def snapshot_peers(self) -> Dict[str, PeerNode]:
        return dict(self._peers)

    def _stub_loop(self) -> None:
        _EVENTS = [
            (2.0,  "connect",    "AA:BB:CC:DD:EE:01", (34.0522, -118.2437), -62),
            (2.5,  "connect",    "AA:BB:CC:DD:EE:02", (34.0600, -118.2500), -75),
            (6.0,  "connect",    "AA:BB:CC:DD:EE:03", (34.0700, -118.2600), -81),
            (8.0,  "data",       "AA:BB:CC:DD:EE:01", b'{"type":"sos","msg":"Test SOS"}', None),
            (14.0, "disconnect", "AA:BB:CC:DD:EE:02", None, None),
        ]
        start = time.monotonic()
        fired = set()
        while self._running:
            now = time.monotonic() - start
            for i, (ts, event, addr, extra, rssi) in enumerate(_EVENTS):
                if i not in fired and now >= ts:
                    fired.add(i)
                    if event == "connect":
                        p = PeerNode(addr)
                        p.node_id  = addr
                        p.gps      = extra
                        p.rssi     = rssi
                        p.connected = True
                        self._peers[addr] = p
                        self._cb_connected(addr, extra, rssi)
                    elif event == "disconnect":
                        if addr in self._peers:
                            self._peers[addr].connected = False
                        self._cb_disconnected(addr)
                    elif event == "data":
                        self._cb_data(addr, extra)
            time.sleep(0.2)
    
    def broadcast(self, data: bytes) -> None:
        """
        Broadcast data to all connected peers.
        
        Args:
            data: Raw bytes to broadcast
        """
        if not self._running:
            return
        # Stub: On Android, this would write to message characteristic of all peers
        print(f"[BLEMesh] Broadcasting {len(data)} bytes (stub)")
    
    def is_running(self) -> bool:
        """Check if the controller is running."""
        with self._lock:
            return self._running
