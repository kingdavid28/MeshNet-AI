package com.meshnet.ai

/**
 * MeshDiscoveryPlugin.kt
 * ─────────────────────────────────────────────────────────────────────────────
 * Capacitor plugin that bridges the Android BLE and Wi-Fi Direct APIs to the
 * MeshNet AI JavaScript layer.
 *
 * Responsibilities
 * ────────────────
 *  BLE Advertise   — broadcasts a custom Service UUID so nearby devices can
 *                    detect this node without any server connection.
 *
 *  BLE Scan        — continuously scans for other MeshNet nodes advertising
 *                    the same UUID. On discovery, reads the remote node's GATT
 *                    characteristics (node_id, label, lat, lng, battery) and
 *                    POSTs them to the Express backend via /api/mesh/register.
 *
 *  Wi-Fi Direct    — creates or joins a local Wi-Fi Direct peer group so
 *                    devices can reach each other's Express API over 192.168.49.x
 *                    without any internet connection or router.
 *
 *  Heartbeat       — PATCHes this device's own signal + battery every
 *                    heartbeatIntervalMs so the map stays current.
 *
 *  Edge reporting  — after discovering a peer, POSTs the edge (this node ↔
 *                    peer node, protocol, RSSI quality) to /api/mesh/edges.
 *
 * JavaScript API (called from useMeshDiscovery.ts)
 * ─────────────────────────────────────────────────
 *   startDiscovery(options)  → void   begin BLE scan + advertise + heartbeat
 *   stopDiscovery()          → void   stop everything, release resources
 *   getStatus()              → { scanning, advertising, wifiDirect, peersFound }
 *   registerSelf(node)       → void   manually POST this device to the backend
 *
 * Events emitted to JavaScript
 * ─────────────────────────────
 *   peerDiscovered   { nodeId, label, lat, lng, battery, signal, protocol }
 *   peerLost         { nodeId }
 *   wifiGroupFormed  { groupOwnerAddress, ssid }
 *   statusChange     { scanning, advertising, wifiDirect }
 *   error            { message }
 */

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.p2p.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.ActivityCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// ── Constants ─────────────────────────────────────────────────────────────────

private const val TAG = "MeshDiscovery"

/** 128-bit Service UUID advertised by every MeshNet node.
 *  Must match the value in capacitor.config.ts and iOS implementation. */
private const val MESH_SERVICE_UUID = "0000FEED-0000-1000-8000-00805F9B34FB"

/** GATT Characteristic UUIDs — written by the advertising node, read by scanner */
private const val CHAR_NODE_ID   = "0000FEE1-0000-1000-8000-00805F9B34FB"
private const val CHAR_LABEL     = "0000FEE2-0000-1000-8000-00805F9B34FB"
private const val CHAR_LAT       = "0000FEE3-0000-1000-8000-00805F9B34FB"
private const val CHAR_LNG       = "0000FEE4-0000-1000-8000-00805F9B34FB"
private const val CHAR_BATTERY   = "0000FEE5-0000-1000-8000-00805F9B34FB"
private const val CHAR_SIGNAL    = "0000FEE6-0000-1000-8000-00805F9B34FB"
private const val CHAR_WIFI      = "0000FEE7-0000-1000-8000-00805F9B34FB"  // wifi_status 0/1

/** Wi-Fi Direct SSID prefix — devices filter by this when scanning */
private const val WIFI_SSID_PREFIX = "MESHNET-"

@CapacitorPlugin(
    name = "MeshDiscovery",
    permissions = [
        Permission(strings = [
            Manifest.permission.BLUETOOTH,
            Manifest.permission.BLUETOOTH_ADMIN,
        ], alias = "bluetooth_legacy"),
        Permission(strings = [
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_ADVERTISE,
            Manifest.permission.BLUETOOTH_CONNECT,
        ], alias = "bluetooth_modern"),
        Permission(strings = [
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ], alias = "location"),
        Permission(strings = [
            Manifest.permission.NEARBY_WIFI_DEVICES,
        ], alias = "nearby_wifi"),
        Permission(strings = [
            Manifest.permission.CHANGE_WIFI_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.ACCESS_NETWORK_STATE,
        ], alias = "wifi"),
    ]
)
class MeshDiscoveryPlugin : Plugin() {

    // ── State ─────────────────────────────────────────────────────────────────

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val mainHandler = Handler(Looper.getMainLooper())

    // ANDROID-1: Default to empty string — must be supplied via startDiscovery().
    // 10.0.2.2 only works from the Android emulator, not physical devices.
    private var apiBase           = ""
    private var selfNodeId        = ""
    private var selfLabel         = ""
    private var selfLat           = 0.0
    private var selfLng           = 0.0
    private var selfGpsValid      = false  // ANDROID-3: GPS gate
    private var selfBattery       = 100
    private var selfSignal        = 80
    private var heartbeatInterval = 5_000L

    private var isScanning      = false
    private var isAdvertising   = false
    private var isWifiDirect    = false
    // nodeId → lastSeenMs (thread-safe — updated from BLE binder threads)
    private val knownPeers      = ConcurrentHashMap<String, Long>()
    // BLE-verified node IDs → device address (used to gate Wi-Fi Direct connections)
    private val bleVerifiedAddresses = ConcurrentHashMap<String, String>() // nodeId → BT address
    // Per-device GATT read state (ANDROID-4: thread-safe, one map per remote device)
    private val gattReadState   = ConcurrentHashMap<String, ConcurrentHashMap<String, String>>()

    // BLE
    private var bluetoothManager: BluetoothManager?      = null
    private var bluetoothAdapter: BluetoothAdapter?      = null
    private var bleScanner:       BluetoothLeScanner?    = null
    private var bleAdvertiser:    BluetoothLeAdvertiser? = null
    private var gattServer:       BluetoothGattServer?   = null
    private var scanCallback:     ScanCallback?          = null
    private var advertiseCallback: AdvertiseCallback?    = null

    // Wi-Fi Direct
    private var wifiP2pManager:  WifiP2pManager?  = null
    private var wifiP2pChannel:  WifiP2pManager.Channel? = null
    private var wifiReceiver:    BroadcastReceiver? = null

    // Heartbeat coroutine
    private var heartbeatJob: Job? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun load() {
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        wifiP2pManager   = context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
        wifiP2pChannel   = wifiP2pManager?.initialize(context, Looper.getMainLooper(), null)
    }

    // ── Plugin methods (called from JavaScript) ───────────────────────────────

    /** Begin BLE advertising + scanning + Wi-Fi Direct + heartbeat loop. */
    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        val providedApiBase = call.getString("apiBase", "").orEmpty()
        if (providedApiBase.isNotBlank()) {
            apiBase = providedApiBase
        }
        if (apiBase.isBlank()) {
            call.reject("apiBase is required — set VITE_API_BASE_URL or pass apiBase to startDiscovery()")
            return
        }

        selfNodeId        = call.getString("nodeId",            selfNodeId)!!
        selfLabel         = call.getString("label",             "MeshNet Node")!!
        val lat           = call.getDouble("lat",               0.0)!!
        val lng           = call.getDouble("lng",               0.0)!!
        // ANDROID-3: Only mark GPS valid when coordinates are non-zero
        selfGpsValid      = lat != 0.0 || lng != 0.0
        if (selfGpsValid) {
            selfLat = lat
            selfLng = lng
        }
        selfBattery       = call.getInt("battery",              100)!!
        selfSignal        = call.getInt("signal",               80)!!
        heartbeatInterval = call.getLong("heartbeatIntervalMs", 5_000L)!!

        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "onPermissionsResult")
            return
        }

        startBleAdvertise()
        startBleScan()
        startWifiDirect()
        startHeartbeat()
        call.resolve(buildStatusResult())
    }

    /** Stop all discovery, release all resources. */
    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        stopAll()
        call.resolve()
    }

    /** Return current discovery status. */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(buildStatusResult())
    }

    /**
     * Manually POST this device's own record to the Express backend.
     * Called once on app launch so the node appears on the map immediately,
     * before any peers are discovered.
     */
    @PluginMethod
    fun registerSelf(call: PluginCall) {
        val nodeId  = call.getString("nodeId")  ?: selfNodeId
        val label   = call.getString("label")   ?: selfLabel
        val lat     = call.getDouble("lat")     ?: selfLat
        val lng     = call.getDouble("lng")     ?: selfLng
        val battery = call.getInt("battery")    ?: selfBattery
        val signal  = call.getInt("signal")     ?: selfSignal
        val device  = call.getString("device")  ?: "smartphone"
        val role    = call.getString("role")    ?: "peer"

        scope.launch {
            val ok = postRegister(nodeId, label, lat, lng, battery, signal,
                bluetoothEnabled(), wifiDirect = isWifiDirect, device, role)
            if (ok) call.resolve() else call.reject("Registration failed — backend unreachable")
        }
    }

    // ── BLE Advertise ─────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startBleAdvertise() {
        val adapter = bluetoothAdapter ?: run {
            notifyError("Bluetooth adapter unavailable"); return
        }
        if (!adapter.isEnabled) { notifyError("Bluetooth is off"); return }

        bleAdvertiser = adapter.bluetoothLeAdvertiser ?: run {
            notifyError("BLE advertising not supported on this device"); return
        }

        // ── Start GATT server so scanners can read our characteristics ─────────
        startGattServer()

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true)     // scanners can connect and read GATT chars
            .setTimeout(0)            // advertise indefinitely
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)   // keep packet small
            .addServiceUuid(ParcelUuid(UUID.fromString(MESH_SERVICE_UUID)))
            .build()

        advertiseCallback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                isAdvertising = true
                Log.i(TAG, "BLE advertising started")
                notifyStatusChange()
            }
            override fun onStartFailure(errorCode: Int) {
                notifyError("BLE advertise failed: code $errorCode")
            }
        }

        bleAdvertiser!!.startAdvertising(settings, data, advertiseCallback!!)
    }

    @SuppressLint("MissingPermission")
    private fun startGattServer() {
        gattServer = bluetoothManager?.openGattServer(context, object : BluetoothGattServerCallback() {
            override fun onCharacteristicReadRequest(
                device: BluetoothDevice, requestId: Int, offset: Int,
                characteristic: BluetoothGattCharacteristic
            ) {
                val value: ByteArray? = when (characteristic.uuid.toString().uppercase()) {
                    CHAR_NODE_ID -> selfNodeId.toByteArray()
                    CHAR_LABEL   -> selfLabel.toByteArray()
                    CHAR_LAT     -> selfLat.toString().toByteArray()
                    CHAR_LNG     -> selfLng.toString().toByteArray()
                    CHAR_BATTERY -> selfBattery.toString().toByteArray()
                    CHAR_SIGNAL  -> selfSignal.toString().toByteArray()
                    CHAR_WIFI    -> (if (isWifiDirect) "1" else "0").toByteArray()
                    else         -> null
                }
                gattServer?.sendResponse(device, requestId,
                    if (value != null) BluetoothGatt.GATT_SUCCESS
                    else               BluetoothGatt.GATT_FAILURE,
                    offset, value)
            }
        })

        // Build the GATT service with all characteristics.
        // SEC-6: PERMISSION_READ_ENCRYPTED requires the remote to pair before reading,
        // preventing unauthenticated BLE scanners from harvesting node data.
        val service = BluetoothGattService(
            UUID.fromString(MESH_SERVICE_UUID),
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )
        listOf(CHAR_NODE_ID, CHAR_LABEL, CHAR_LAT, CHAR_LNG,
               CHAR_BATTERY, CHAR_SIGNAL, CHAR_WIFI).forEach { uuid ->
            service.addCharacteristic(
                BluetoothGattCharacteristic(
                    UUID.fromString(uuid),
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ_ENCRYPTED
                )
            )
        }
        gattServer?.addService(service)
    }

    // ── BLE Scan ──────────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startBleScan() {
        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) return

        bleScanner = adapter.bluetoothLeScanner ?: return

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(UUID.fromString(MESH_SERVICE_UUID)))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                // Skip our own advertisement
                if (result.device.address == bluetoothAdapter?.address) return
                onBleDeviceFound(result.device, result.rssi)
            }
            override fun onScanFailed(errorCode: Int) {
                notifyError("BLE scan failed: code $errorCode")
            }
        }

        bleScanner!!.startScan(listOf(filter), settings, scanCallback!!)
        isScanning = true
        Log.i(TAG, "BLE scanning started")
        notifyStatusChange()
    }

    /** Connect to a discovered BLE device and read all GATT characteristics.
     *  ANDROID-4: each device gets its own ConcurrentHashMap so concurrent callbacks
     *  for multiple devices cannot corrupt shared state. */
    @SuppressLint("MissingPermission")
    private fun onBleDeviceFound(device: BluetoothDevice, rssi: Int) {
        val deviceAddr = device.address
        // Allocate per-device state map (idempotent if already present)
        val chars = gattReadState.getOrPut(deviceAddr) { ConcurrentHashMap() }

        device.connectGatt(context, false, object : BluetoothGattCallback() {

            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    gatt.close()
                    gattReadState.remove(deviceAddr)
                    val nodeId = chars[CHAR_NODE_ID] ?: return
                    if (nodeId.isNotEmpty()) {
                        // ANDROID-5: record as BLE-verified before Wi-Fi Direct can connect
                        bleVerifiedAddresses[nodeId] = deviceAddr
                        processBleDiscovery(chars, rssi)
                    }
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) { gatt.disconnect(); return }
                val service = gatt.getService(UUID.fromString(MESH_SERVICE_UUID))
                if (service == null) { gatt.disconnect(); return }
                readNextChar(gatt, service,
                    listOf(CHAR_NODE_ID, CHAR_LABEL, CHAR_LAT, CHAR_LNG,
                           CHAR_BATTERY, CHAR_SIGNAL, CHAR_WIFI), 0, chars)
            }

            override fun onCharacteristicRead(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    chars[characteristic.uuid.toString().uppercase()] =
                        characteristic.value?.toString(Charsets.UTF_8) ?: ""
                }
                val keys = listOf(CHAR_NODE_ID, CHAR_LABEL, CHAR_LAT, CHAR_LNG,
                                  CHAR_BATTERY, CHAR_SIGNAL, CHAR_WIFI)
                val idx = keys.indexOfFirst { it == characteristic.uuid.toString().uppercase() }
                if (idx >= 0 && idx + 1 < keys.size) {
                    readNextChar(gatt, gatt.getService(UUID.fromString(MESH_SERVICE_UUID)),
                        keys, idx + 1, chars)
                } else {
                    gatt.disconnect()
                }
            }
        }, BluetoothDevice.TRANSPORT_LE)
    }

    private fun readNextChar(
        gatt: BluetoothGatt,
        service: BluetoothGattService?,
        keys: List<String>,
        idx: Int,
        out: MutableMap<String, String>
    ) {
        if (service == null || idx >= keys.size) { gatt.disconnect(); return }
        val char = service.getCharacteristic(UUID.fromString(keys[idx]))
        if (char != null) gatt.readCharacteristic(char)
        else readNextChar(gatt, service, keys, idx + 1, out)
    }

    /** After reading all GATT chars from a peer, register them with the backend. */
    private fun processBleDiscovery(chars: Map<String, String>, rssi: Int) {
        val nodeId  = chars[CHAR_NODE_ID] ?: return
        val label   = chars[CHAR_LABEL]   ?: nodeId
        val lat     = chars[CHAR_LAT]     ?.toDoubleOrNull() ?: 0.0
        val lng     = chars[CHAR_LNG]     ?.toDoubleOrNull() ?: 0.0
        val battery = chars[CHAR_BATTERY] ?.toIntOrNull()    ?: 80
        val signal  = rssiToPercent(rssi)
        val wifi    = chars[CHAR_WIFI]    == "1"

        // Debounce — don't re-register the same node more than once per 30s
        val now = System.currentTimeMillis()
        if ((now - (knownPeers[nodeId] ?: 0)) < 30_000) return
        knownPeers[nodeId] = now

        scope.launch {
            // 1. Register the discovered peer node with the backend
            postRegister(nodeId, label, lat, lng, battery, signal,
                ble = true, wifiDirect = wifi, "smartphone", "peer")

            // 2. Register the edge (this node ↔ peer) with protocol + RSSI quality
            postEdge(selfNodeId, nodeId, "bluetooth", signal)

            // 3. Emit event to JavaScript
            val event = JSObject().apply {
                put("nodeId",   nodeId)
                put("label",    label)
                put("lat",      lat)
                put("lng",      lng)
                put("battery",  battery)
                put("signal",   signal)
                put("protocol", "bluetooth")
            }
            notifyListeners("peerDiscovered", event)
            Log.i(TAG, "BLE peer registered: $nodeId ($label)")
        }
    }

    // ── Wi-Fi Direct ──────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startWifiDirect() {
        val manager = wifiP2pManager ?: return
        val channel = wifiP2pChannel ?: return

        // Register a broadcast receiver for Wi-Fi Direct state changes
        val intentFilter = IntentFilter().apply {
            addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
        }

        wifiReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {
                    WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
                        val state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1)
                        if (state == WifiP2pManager.WIFI_P2P_STATE_ENABLED) {
                            // Wi-Fi Direct hardware is enabled — discover peers
                            discoverWifiPeers(manager, channel)
                        }
                    }
                    WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                        onWifiPeersChanged(manager, channel)
                    }
                    WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                        val networkInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO,
                                android.net.NetworkInfo::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO)
                        }
                        if (networkInfo?.isConnected == true) {
                            manager.requestConnectionInfo(channel) { info ->
                                onWifiGroupConnected(info)
                            }
                        }
                    }
                }
            }
        }
        context.registerReceiver(wifiReceiver, intentFilter)

        // Start discovering Wi-Fi Direct peers
        discoverWifiPeers(manager, channel)
    }

    @SuppressLint("MissingPermission")
    private fun discoverWifiPeers(manager: WifiP2pManager, channel: WifiP2pManager.Channel) {
        manager.discoverPeers(channel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                isWifiDirect = true
                Log.i(TAG, "Wi-Fi Direct peer discovery started")
                notifyStatusChange()
            }
            override fun onFailure(reason: Int) {
                Log.w(TAG, "Wi-Fi Direct discovery failed: reason $reason")
            }
        })
    }

    @SuppressLint("MissingPermission")
    private fun onWifiPeersChanged(manager: WifiP2pManager, channel: WifiP2pManager.Channel) {
        manager.requestPeers(channel) { peerList: WifiP2pDeviceList ->
            // ANDROID-5: only connect to devices whose BLE identity has been verified.
            // A device name match is spoofable — require a prior BLE handshake.
            val verifiedAddresses = bleVerifiedAddresses.values.toSet()
            peerList.deviceList.forEach { device ->
                if (verifiedAddresses.contains(device.deviceAddress)) {
                    connectToWifiPeer(manager, channel, device)
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun connectToWifiPeer(
        manager: WifiP2pManager,
        channel: WifiP2pManager.Channel,
        device: WifiP2pDevice
    ) {
        val config = WifiP2pConfig().apply { deviceAddress = device.deviceAddress }
        manager.connect(channel, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.i(TAG, "Wi-Fi Direct connecting to ${device.deviceName}")
            }
            override fun onFailure(reason: Int) {
                Log.w(TAG, "Wi-Fi Direct connect failed: reason $reason")
            }
        })
    }

    private fun onWifiGroupConnected(info: WifiP2pInfo) {
        val groupOwnerAddress = info.groupOwnerAddress?.hostAddress ?: return
        Log.i(TAG, "Wi-Fi Direct group formed — owner: $groupOwnerAddress")

        // If we are NOT the group owner, the group owner's Express API is
        // reachable at their IP on port 4000. Register ourselves with them.
        if (!info.isGroupOwner) {
            val peerApiBase = "http://$groupOwnerAddress:4000"
            scope.launch {
                postRegister(selfNodeId, selfLabel, selfLat, selfLng,
                    selfBattery, selfSignal, ble = bluetoothEnabled(),
                    wifiDirect = true, "smartphone", "peer",
                    apiBaseOverride = peerApiBase)
                postEdge(selfNodeId, "group-owner-${groupOwnerAddress.replace('.', '-')}",
                    "wifi", 90, apiBaseOverride = peerApiBase)
            }
        }

        // NET-2: emit the dynamic backend URL so the JS layer can update apiBase
        val peerApiBase = "http://$groupOwnerAddress:4000"
        val event = JSObject().apply {
            put("groupOwnerAddress", groupOwnerAddress)
            put("isGroupOwner",      info.isGroupOwner)
            put("ssid",              info.groupOwnerAddress?.hostName ?: "")
            put("backendUrl",        if (info.isGroupOwner) apiBase else peerApiBase)
        }
        notifyListeners("wifiGroupFormed", event)
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                patchHeartbeat()
                delay(heartbeatInterval)
            }
        }
    }

    private suspend fun patchHeartbeat() {
        if (selfNodeId.isEmpty() || apiBase.isBlank()) return
        // ANDROID-3: skip heartbeat until we have a real GPS fix
        if (!selfGpsValid) {
            Log.d(TAG, "Heartbeat skipped — waiting for valid GPS fix")
            return
        }
        try {
            val url = URL("$apiBase/api/mesh/nodes/$selfNodeId/heartbeat")
            val body = JSONObject().apply {
                put("signal",            selfSignal)
                put("batteryPercentage", selfBattery)
                put("bluetoothStatus",   bluetoothEnabled())
                put("wifiStatus",        isWifiDirect)
                put("lat",               selfLat)
                put("lng",               selfLng)
            }.toString()
            httpPatch(url, body)
        } catch (e: Exception) {
            Log.d(TAG, "Heartbeat failed: ${e.message}")
        }
    }

    // ── Backend HTTP helpers ──────────────────────────────────────────────────

    private suspend fun postRegister(
        nodeId: String, label: String,
        lat: Double, lng: Double,
        battery: Int, signal: Int,
        ble: Boolean, wifiDirect: Boolean,
        device: String, role: String,
        apiBaseOverride: String? = null
    ): Boolean {
        val base = apiBaseOverride ?: apiBase
        return try {
            val url  = URL("$base/api/mesh/register")
            val body = JSONObject().apply {
                put("id",                nodeId)
                put("label",             label)
                put("name",              label)
                put("device",            device)
                put("role",              role)
                put("signal",            signal)
                put("batteryPercentage", battery)
                put("bluetoothStatus",   ble)
                put("wifiStatus",        wifiDirect)
                put("lat",               lat)
                put("lng",               lng)
            }.toString()
            val code = httpPost(url, body)
            code == 201
        } catch (e: Exception) {
            Log.w(TAG, "postRegister failed: ${e.message}")
            false
        }
    }

    private suspend fun postEdge(
        a: String, b: String,
        protocol: String, quality: Int,
        apiBaseOverride: String? = null
    ) {
        val base = apiBaseOverride ?: apiBase
        try {
            val url  = URL("$base/api/mesh/edges")
            val body = JSONObject().apply {
                put("a",        a)
                put("b",        b)
                put("protocol", protocol)
                put("quality",  quality)
            }.toString()
            httpPost(url, body)
        } catch (e: Exception) {
            Log.d(TAG, "postEdge failed: ${e.message}")
        }
    }

    private suspend fun httpPost(url: URL, body: String): Int =
        withContext(Dispatchers.IO) {
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod           = "POST"
                doOutput                = true
                connectTimeout          = 5_000
                readTimeout             = 5_000
                setRequestProperty("Content-Type", "application/json")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            conn.responseCode.also { conn.disconnect() }
        }

    private suspend fun httpPatch(url: URL, body: String): Int =
        withContext(Dispatchers.IO) {
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod           = "PATCH"
                doOutput                = true
                connectTimeout          = 5_000
                readTimeout             = 5_000
                setRequestProperty("Content-Type", "application/json")
                // Some JVM implementations don't support PATCH — use override header
                setRequestProperty("X-HTTP-Method-Override", "PATCH")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            conn.responseCode.also { conn.disconnect() }
        }

    // ── Utilities ─────────────────────────────────────────────────────────────

    /** Convert raw RSSI dBm (-100..0) to a 0-100 quality percentage. */
    private fun rssiToPercent(rssi: Int): Int =
        ((rssi.coerceIn(-100, -30) + 100) * 100 / 70).coerceIn(0, 100)

    private fun bluetoothEnabled(): Boolean =
        bluetoothAdapter?.isEnabled == true

    private fun buildStatusResult(): JSObject = JSObject().apply {
        put("scanning",    isScanning)
        put("advertising", isAdvertising)
        put("wifiDirect",  isWifiDirect)
        put("peersFound",  knownPeers.size)
        put("selfNodeId",  selfNodeId)
    }

    private fun notifyStatusChange() {
        val e = JSObject().apply {
            put("scanning",    isScanning)
            put("advertising", isAdvertising)
            put("wifiDirect",  isWifiDirect)
        }
        notifyListeners("statusChange", e)
    }

    private fun notifyError(msg: String) {
        Log.e(TAG, msg)
        notifyListeners("error", JSObject().apply { put("message", msg) })
    }

    // ── Permission callback ───────────────────────────────────────────────────

    @PermissionCallback
    fun onPermissionsResult(call: PluginCall) {
        if (hasRequiredPermissions()) {
            startBleAdvertise()
            startBleScan()
            startWifiDirect()
            startHeartbeat()
            call.resolve(buildStatusResult())
        } else {
            call.reject("Required permissions not granted")
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        val required = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.CHANGE_WIFI_STATE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            required += listOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            required += Manifest.permission.NEARBY_WIFI_DEVICES
        }
        return required.all {
            ActivityCompat.checkSelfPermission(context, it) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    private fun stopAll() {
        stopBleScan()
        stopBleAdvertise()
        stopGattServer()
        stopWifiDirect()
        heartbeatJob?.cancel()
        heartbeatJob        = null
        isScanning          = false
        isAdvertising       = false
        isWifiDirect        = false
        knownPeers.clear()
        bleVerifiedAddresses.clear()
        gattReadState.clear()
        notifyStatusChange()
    }

    @SuppressLint("MissingPermission")
    private fun stopBleScan() {
        scanCallback?.let { bleScanner?.stopScan(it) }
        scanCallback = null
        bleScanner   = null
    }

    @SuppressLint("MissingPermission")
    private fun stopBleAdvertise() {
        advertiseCallback?.let { bleAdvertiser?.stopAdvertising(it) }
        advertiseCallback = null
        bleAdvertiser     = null
    }

    private fun stopGattServer() {
        gattServer?.close()
        gattServer = null
    }

    private fun stopWifiDirect() {
        try { context.unregisterReceiver(wifiReceiver) } catch (_: Exception) {}
        wifiReceiver = null
        isWifiDirect = false
    }

    override fun handleOnDestroy() {
        stopAll()
        scope.cancel()
    }
}
