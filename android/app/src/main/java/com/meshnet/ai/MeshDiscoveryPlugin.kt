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
import android.net.ConnectivityManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
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
import java.lang.reflect.Method
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// ── Constants ─────────────────────────────────────────────────────────────────

private const val TAG = "MeshDiscovery"

/** 128-bit Service UUID advertised by every MeshNet node.
 *  Must match the value in capacitor.config.ts and iOS implementation. */
private const val MESH_SERVICE_UUID = "0000FEED-0000-1000-8000-00805F9B34FB"

/** GATT Characteristic UUIDs — serverless BLE mesh implementation */
private const val CHAR_IDENTITY_UUID = "0000FEE1-0000-1000-8000-00805F9B34FB"  // JSON identity payload
private const val CHAR_MSG_UUID      = "0000FEE2-0000-1000-8000-00805F9B34FB"  // Message data exchange
private const val CCCD_UUID         = "00002902-0000-1000-8000-00805F9B34FB"  // Client Characteristic Configuration

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
    // Device address → RSSI (for reporting signal strength)
    private val deviceRssi      = ConcurrentHashMap<String, Int>()
    // Track devices currently being connected to prevent duplicate connections
    private val connectingDevices = ConcurrentHashMap<String, Boolean>()

    // BLE
    private var bluetoothManager: BluetoothManager?      = null
    private var bluetoothAdapter: BluetoothAdapter?      = null
    private var bleScanner:       BluetoothLeScanner?    = null
    private var bleAdvertiser:    BluetoothLeAdvertiser? = null
    private var gattServer:       BluetoothGattServer?   = null
    private var scanCallback:     ScanCallback?          = null
    private var advertiseCallback: AdvertiseCallback?    = null
    private var identityCharacteristic: BluetoothGattCharacteristic? = null
    private var messageCharacteristic: BluetoothGattCharacteristic? = null

    // Wi-Fi Direct
    private var wifiP2pManager:  WifiP2pManager?  = null
    private var wifiP2pChannel:  WifiP2pManager.Channel? = null
    private var wifiReceiver:    BroadcastReceiver? = null

    // Wi-Fi Hotspot
    private var wifiManager:     WifiManager? = null
    private var isHotspotActive: Boolean = false

    // Captive Portal Redirect Server
    private var redirectServer:  ServerSocket? = null
    private var redirectJob:    Job? = null
    private var isRedirectActive: Boolean = false

    // mDNS Service Discovery
    private var nsdManager:     NsdManager? = null
    private var isMdnsActive:   Boolean = false
    private var mdnsListener:   NsdManager.RegistrationListener? = null

    // Heartbeat coroutine
    private var heartbeatJob: Job? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun load() {
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        wifiP2pManager   = context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
        wifiP2pChannel   = wifiP2pManager?.initialize(context, Looper.getMainLooper(), null)
        wifiManager     = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        nsdManager      = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    }

    // ── Plugin methods (called from JavaScript) ───────────────────────────────

    /** Begin BLE advertising + scanning + Wi-Fi Direct + heartbeat loop. */
    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        val providedApiBase = call.getString("apiBase", "").orEmpty()
        if (providedApiBase.isNotBlank()) {
            apiBase = providedApiBase
        }
        // Allow empty apiBase for pure P2P mode (no backend)
        // Only require apiBase if backend operations are needed

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

        if (!checkRequiredPermissions()) {
            requestAllPermissions(call, "onPermissionsResult")
            return
        }

        startBleAdvertise()
        startBleScan()
        startWifiDirect()
        // Only start heartbeat if backend is available
        if (apiBase.isNotBlank()) {
            startHeartbeat()
        }
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

    /**
     * Start WiFi hotspot with given SSID and password.
     * Note: This requires system-level permissions and may not work on all devices.
     * Android 10+ restricts hotspot creation to system apps.
     */
    @PluginMethod
    fun startHotspot(call: PluginCall) {
        val ssid = call.getString("ssid", "MeshNet-Emergency") ?: "MeshNet-Emergency"
        val password = call.getString("password", "12345678") ?: "12345678"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ requires system app privileges
            call.reject("WiFi hotspot creation requires system app privileges on Android 11+")
            return
        }

        try {
            val success = setWifiHotspotEnabled(ssid, password)
            if (success) {
                isHotspotActive = true
                call.resolve()
            } else {
                call.reject("Failed to start WiFi hotspot")
            }
        } catch (e: Exception) {
            call.reject("WiFi hotspot error: ${e.message}")
        }
    }

    /**
     * Stop WiFi hotspot.
     */
    @PluginMethod
    fun stopHotspot(call: PluginCall) {
        try {
            setWifiHotspotEnabled(null, null)
            isHotspotActive = false
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop WiFi hotspot: ${e.message}")
        }
    }

    /**
     * Check if WiFi hotspot is active.
     */
    @PluginMethod
    fun isHotspotActive(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("active", isHotspotActive)
        })
    }

    /**
     * Start captive portal redirect server.
     * Redirects all HTTP traffic to the MeshNet join endpoint.
     */
    @PluginMethod
    fun startRedirectServer(call: PluginCall) {
        val hotspotIP = call.getString("hotspotIP", "192.168.43.1") ?: "192.168.43.1"
        val backendIP = call.getString("backendIP", null)
        val joinUrl = if (backendIP != null) {
            "http://$backendIP:4000/api/mesh/join"
        } else {
            "http://$hotspotIP:4000/api/mesh/join"
        }

        try {
            redirectServer = ServerSocket()
            redirectServer?.reuseAddress = true
            redirectServer?.bind(InetSocketAddress("0.0.0.0", 8080))

            isRedirectActive = true
            redirectJob = scope.launch {
                while (isActive && isRedirectActive) {
                    try {
                        val client = redirectServer?.accept()
                        if (client != null) {
                            handleRedirectRequest(client, joinUrl)
                        }
                    } catch (e: Exception) {
                        if (isRedirectActive) {
                            Log.e(TAG, "Redirect server error: ${e.message}")
                        }
                    }
                }
            }

            call.resolve(JSObject().apply {
                put("success", true)
                put("port", 8080)
                put("joinUrl", joinUrl)
                put("backendIP", backendIP)
            })
        } catch (e: Exception) {
            call.reject("Failed to start redirect server: ${e.message}")
        }
    }

    /**
     * Stop captive portal redirect server.
     */
    @PluginMethod
    fun stopRedirectServer(call: PluginCall) {
        try {
            isRedirectActive = false
            redirectJob?.cancel()
            redirectJob = null
            redirectServer?.close()
            redirectServer = null
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop redirect server: ${e.message}")
        }
    }

    /**
     * Check if redirect server is active.
     */
    @PluginMethod
    fun isRedirectActive(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("active", isRedirectActive)
        })
    }

    /**
     * Start mDNS service broadcasting.
     * Broadcasts MeshNet service on local network for discovery.
     */
    @PluginMethod
    fun startMdnsBroadcast(call: PluginCall) {
        val serviceName = call.getString("serviceName", "MeshNet Emergency Network") ?: "MeshNet Emergency Network"
        val port = call.getInt("port", 4000) ?: 4000
        val ssid = call.getString("ssid", "MeshNet-Emergency") ?: "MeshNet-Emergency"
        val password = call.getString("password", "12345678") ?: "12345678"

        try {
            val nsdManager = nsdManager ?: run {
                call.reject("mDNS service not available")
                return
            }

            val serviceInfo = NsdServiceInfo().apply {
                this.serviceName = serviceName
                this.serviceType = "_http._tcp."
                this.port = port

                // Add TXT records with WiFi credentials
                setAttribute("ssid", ssid)
                setAttribute("password", password)
                setAttribute("version", "1.0")
                setAttribute("path", "/api/mesh/join")
            }

            mdnsListener = object : NsdManager.RegistrationListener {
                override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.e(TAG, "mDNS registration failed: $errorCode")
                    isMdnsActive = false
                }

                override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.e(TAG, "mDNS unregistration failed: $errorCode")
                }

                override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                    Log.i(TAG, "mDNS service registered: ${serviceInfo.serviceName}")
                    isMdnsActive = true
                }

                override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {
                    Log.i(TAG, "mDNS service unregistered: ${serviceInfo.serviceName}")
                    isMdnsActive = false
                }
            }

            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, mdnsListener)
            call.resolve(JSObject().apply {
                put("success", true)
                put("serviceName", serviceName)
                put("port", port)
            })
        } catch (e: Exception) {
            call.reject("Failed to start mDNS broadcast: ${e.message}")
        }
    }

    /**
     * Stop mDNS service broadcasting.
     */
    @PluginMethod
    fun stopMdnsBroadcast(call: PluginCall) {
        try {
            val nsdManager = nsdManager ?: run {
                call.reject("mDNS service not available")
                return
            }
            val listener = mdnsListener ?: run {
                call.resolve()
                return
            }

            nsdManager.unregisterService(listener)
            mdnsListener = null
            isMdnsActive = false
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop mDNS broadcast: ${e.message}")
        }
    }

    /**
     * Check if mDNS broadcast is active.
     */
    @PluginMethod
    fun isMdnsActive(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("active", isMdnsActive)
        })
    }

    // ── BLE Advertise ─────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startBleAdvertise() {
        val adapter = bluetoothAdapter ?: run {
            Log.e(TAG, "BLE advertise failed: Bluetooth adapter unavailable")
            notifyError("Bluetooth adapter unavailable"); return
        }
        if (!adapter.isEnabled) { 
            Log.e(TAG, "BLE advertise failed: Bluetooth is off")
            notifyError("Bluetooth is off"); return 
        }

        bleAdvertiser = adapter.bluetoothLeAdvertiser ?: run {
            Log.e(TAG, "BLE advertise failed: BLE advertising not supported on this device")
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
                Log.i(TAG, "BLE advertising started successfully - Node ID: $selfNodeId, Service UUID: $MESH_SERVICE_UUID")
                notifyStatusChange()
            }
            override fun onStartFailure(errorCode: Int) {
                Log.e(TAG, "BLE advertise failed with error code: $errorCode")
                notifyError("BLE advertise failed: code $errorCode")
            }
        }

        Log.i(TAG, "Starting BLE advertising with Node ID: $selfNodeId")
        bleAdvertiser!!.startAdvertising(settings, data, advertiseCallback!!)
    }

    @SuppressLint("MissingPermission")
    private fun startGattServer() {
        gattServer = bluetoothManager?.openGattServer(context, object : BluetoothGattServerCallback() {
            override fun onCharacteristicReadRequest(
                device: BluetoothDevice, requestId: Int, offset: Int,
                characteristic: BluetoothGattCharacteristic
            ) {
                val fullValue: ByteArray? = when (characteristic.uuid.toString().uppercase()) {
                    CHAR_IDENTITY_UUID -> buildIdentityPayload().toByteArray()
                    CHAR_MSG_UUID      -> null  // Read not supported for message char
                    else               -> null
                }
                
                // Handle offset for long reads (MTU limitation)
                val value: ByteArray? = if (fullValue != null && offset < fullValue.size) {
                    if (offset == 0) {
                        fullValue
                    } else {
                        fullValue.copyOfRange(offset, fullValue.size)
                    }
                } else {
                    null
                }
                
                // When we handle offset ourselves, pass offset=0 to sendResponse
                val responseOffset = if (offset == 0) 0 else 0
                gattServer?.sendResponse(device, requestId,
                    if (value != null) BluetoothGatt.GATT_SUCCESS
                    else               BluetoothGatt.GATT_FAILURE,
                    responseOffset, value)
            }

            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice, requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean, responseNeeded: Boolean, offset: Int,
                value: ByteArray
            ) {
                if (characteristic.uuid.toString().uppercase() == CHAR_MSG_UUID) {
                    // Handle incoming message from peer
                    val message = String(value, Charsets.UTF_8)
                    Log.i(TAG, "Received message from ${device.address}: $message")
                    notifyPeerMessage(device.address, message)
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId,
                        BluetoothGatt.GATT_SUCCESS, offset, value)
                }
            }
        })

        // Build the GATT service with identity and message characteristics
        val service = BluetoothGattService(
            UUID.fromString(MESH_SERVICE_UUID),
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        // Identity characteristic (READ | NOTIFY)
        val idChar = BluetoothGattCharacteristic(
            UUID.fromString(CHAR_IDENTITY_UUID),
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )

        // CCCD descriptor for notifications
        val cccd = BluetoothGattDescriptor(
            UUID.fromString(CCCD_UUID),
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        idChar.addDescriptor(cccd)

        // Message characteristic (WRITE | WRITE_NO_RESPONSE | NOTIFY)
        val msgChar = BluetoothGattCharacteristic(
            UUID.fromString(CHAR_MSG_UUID),
            BluetoothGattCharacteristic.PROPERTY_WRITE or
            BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(idChar)
        service.addCharacteristic(msgChar)
        gattServer?.addService(service)

        // Store reference for later updates
        identityCharacteristic = idChar
        messageCharacteristic = msgChar

        Log.i(TAG, "GATT server started with MeshNet service (identity + message characteristics)")
    }

    // ── Identity Payload Builder ───────────────────────────────────────────────

    private fun buildIdentityPayload(): String {
        """
        Build JSON identity payload for the GATT identity characteristic.
        Schema: {"v": 1, "id": "node_id", "lat": 0.0, "lon": 0.0}
        """
        return """{"v":1,"id":"$selfNodeId","lat":$selfLat,"lon":$selfLng}"""
    }

    // ── BLE Scan ──────────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startBleScan() {
        val adapter = bluetoothAdapter ?: run {
            Log.e(TAG, "BLE scan failed: Bluetooth adapter unavailable")
            return
        }
        if (!adapter.isEnabled) { 
            Log.e(TAG, "BLE scan failed: Bluetooth is off")
            return 
        }

        bleScanner = adapter.bluetoothLeScanner ?: run {
            Log.e(TAG, "BLE scan failed: BLE scanner not supported on this device")
            return
        }

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
                if (result.device.address == bluetoothAdapter?.address) {
                    Log.d(TAG, "Skipping own advertisement: ${result.device.address}")
                    return
                }
                Log.i(TAG, "BLE device found: ${result.device.address}, RSSI: ${result.rssi}")
                onBleDeviceFound(result.device, result.rssi)
            }
            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "BLE scan failed with error code: $errorCode")
                notifyError("BLE scan failed: code $errorCode")
            }
        }

        Log.i(TAG, "Starting BLE scan for Service UUID: $MESH_SERVICE_UUID")
        bleScanner!!.startScan(listOf(filter), settings, scanCallback!!)
        isScanning = true
        Log.i(TAG, "BLE scanning started successfully")
        notifyStatusChange()
    }

    /** Connect to a discovered BLE device and read identity characteristic.
     *  Serverless BLE mesh implementation - reads JSON identity payload. */
    @SuppressLint("MissingPermission")
    private fun onBleDeviceFound(device: BluetoothDevice, rssi: Int) {
        val deviceAddr = device.address
        deviceRssi[deviceAddr] = rssi
        
        // Skip if already connecting or connected to this device
        val wasConnecting = connectingDevices.putIfAbsent(deviceAddr, true) != null
        if (wasConnecting) {
            Log.d(TAG, "Already connecting to $deviceAddr, skipping duplicate connection attempt")
            return
        }
        
        Log.i(TAG, "Connecting to BLE device: $deviceAddr (RSSI: $rssi)")

        // Use TRANSPORT_LE to ensure BLE connection (not classic Bluetooth)
        // Use autoConnect=false for immediate connection
        val gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, object : BluetoothGattCallback() {
                override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                    handleConnectionStateChange(gatt, deviceAddr, status, newState)
                }

                @SuppressLint("NewApi")
                override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                    Log.d(TAG, "MTU changed to $mtu for $deviceAddr (status=$status)")
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        gatt.discoverServices()
                    } else {
                        gatt.discoverServices()
                    }
                }

                override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                    handleServicesDiscovered(gatt, deviceAddr, status)
                }

                override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                    handleCharacteristicRead(gatt, deviceAddr, characteristic, status)
                }

                override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                    handleCharacteristicChanged(gatt, deviceAddr, characteristic)
                }
            }, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, object : BluetoothGattCallback() {
                override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                    handleConnectionStateChange(gatt, deviceAddr, status, newState)
                }

                override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                    handleServicesDiscovered(gatt, deviceAddr, status)
                }

                override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                    handleCharacteristicRead(gatt, deviceAddr, characteristic, status)
                }

                override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                    handleCharacteristicChanged(gatt, deviceAddr, characteristic)
                }
            })
        }

        // Request MTU for Android 5.0+ if using the 3-parameter version
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            gatt?.requestMtu(512)
        }
    }

    private fun handleConnectionStateChange(gatt: BluetoothGatt, deviceAddr: String, status: Int, newState: Int) {
        Log.d(TAG, "Connection state change for $deviceAddr: status=$status, newState=$newState")
        if (newState == BluetoothProfile.STATE_CONNECTED) {
            Log.i(TAG, "Connected to $deviceAddr, discovering services")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                gatt.requestMtu(512)
            } else {
                gatt.discoverServices()
            }
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
            Log.i(TAG, "Disconnected from $deviceAddr (status=$status)")
            gatt.close()
            gattReadState.remove(deviceAddr)
            connectingDevices.remove(deviceAddr) // Remove from connecting devices
            if (status == BluetoothGatt.GATT_SUCCESS) {
                scheduleReconnect(deviceAddr)
            } else {
                Log.w(TAG, "Connection failed with status $status, not scheduling reconnect")
            }
        }
    }

    @SuppressLint("NewApi")
    private fun handleMtuChanged(gatt: BluetoothGatt, deviceAddr: String, mtu: Int, status: Int) {
        Log.d(TAG, "MTU changed to $mtu for $deviceAddr (status=$status)")
        gatt.discoverServices()
    }

    private fun handleServicesDiscovered(gatt: BluetoothGatt, deviceAddr: String, status: Int) {
        Log.d(TAG, "Services discovered for $deviceAddr: status=$status")
        if (status != BluetoothGatt.GATT_SUCCESS) {
            Log.e(TAG, "Service discovery failed for $deviceAddr: $status")
            gatt.disconnect()
            return
        }
        val service = gatt.getService(UUID.fromString(MESH_SERVICE_UUID))
        if (service == null) {
            Log.e(TAG, "MeshNet service not found on $deviceAddr")
            gatt.disconnect()
            return
        }
        Log.i(TAG, "MeshNet service found on $deviceAddr, reading identity characteristic")

        val idChar = service.getCharacteristic(UUID.fromString(CHAR_IDENTITY_UUID))
        if (idChar != null) {
            // Ensure the characteristic is readable before reading
            if ((idChar.properties and BluetoothGattCharacteristic.PROPERTY_READ) != 0) {
                @Suppress("DEPRECATION")
                gatt.readCharacteristic(idChar)
            } else {
                Log.e(TAG, "Identity characteristic is not readable on $deviceAddr")
                gatt.disconnect()
            }
        } else {
            Log.e(TAG, "Identity characteristic not found on $deviceAddr")
            gatt.disconnect()
        }
    }

    private fun handleCharacteristicRead(gatt: BluetoothGatt, deviceAddr: String, characteristic: BluetoothGattCharacteristic, status: Int) {
        Log.d(TAG, "Characteristic read: ${characteristic.uuid}, status=$status")
        if (status == BluetoothGatt.GATT_SUCCESS) {
            val uuid = characteristic.uuid.toString().uppercase()
            if (uuid == CHAR_IDENTITY_UUID) {
                val value = characteristic.value?.toString(Charsets.UTF_8) ?: ""
                Log.i(TAG, "Identity payload from $deviceAddr: $value")
                val rssi = deviceRssi[deviceAddr] ?: 0
                processIdentityPayload(deviceAddr, value, rssi)
            }
        }
        // After reading identity, enable notifications for message characteristic
        val service = gatt.getService(UUID.fromString(MESH_SERVICE_UUID))
        if (service != null) {
            val msgChar = service.getCharacteristic(UUID.fromString(CHAR_MSG_UUID))
            if (msgChar != null) {
                gatt.setCharacteristicNotification(msgChar, true)
                val cccd = msgChar.getDescriptor(UUID.fromString(CCCD_UUID))
                if (cccd != null) {
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(cccd)
                }
            }
        }
    }

    private fun handleCharacteristicChanged(gatt: BluetoothGatt, deviceAddr: String, characteristic: BluetoothGattCharacteristic) {
        val uuid = characteristic.uuid.toString().uppercase()
        if (uuid == CHAR_MSG_UUID) {
            val message = characteristic.value?.toString(Charsets.UTF_8) ?: ""
            Log.i(TAG, "Message received from $deviceAddr: $message")
            notifyPeerMessage(deviceAddr, message)
        }
    }

    // ── Identity Payload Processing ───────────────────────────────────────────

    private fun processIdentityPayload(deviceAddr: String, payload: String, rssi: Int) {
        try {
            val json = JSONObject(payload)
            val version = json.optInt("v", 0)
            val nodeId = json.optString("id", deviceAddr)
            val lat = json.optDouble("lat", 0.0)
            val lng = json.optDouble("lon", 0.0)

            Log.i(TAG, "Parsed identity: node=$nodeId, lat=$lat, lng=$lng, version=$version")

            // Store peer info
            knownPeers[nodeId] = System.currentTimeMillis()
            bleVerifiedAddresses[nodeId] = deviceAddr

            // Emit peer discovered event to JavaScript
            val peerData = JSObject().apply {
                put("nodeId", nodeId)
                put("lat", lat)
                put("lng", lng)
                put("rssi", rssi)
                put("protocol", "BLE")
                put("address", deviceAddr)
            }
            notifyPeerDiscovered(peerData)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse identity payload: $payload", e)
        }
    }

    // ── Reconnect Logic with Backoff ─────────────────────────────────────────

    private val reconnectBackoffs = ConcurrentHashMap<String, Int>()
    private val reconnectHandler = Handler(Looper.getMainLooper())

    private fun scheduleReconnect(deviceAddr: String) {
        val backoff = reconnectBackoffs.getOrPut(deviceAddr) { 0 }
        if (backoff >= 10) {
            Log.w(TAG, "Max reconnect attempts reached for $deviceAddr")
            return
        }

        val delayMs = (8000 * (backoff + 1)).toLong() // 8s, 16s, 24s, etc.
        reconnectBackoffs[deviceAddr] = backoff + 1

        Log.i(TAG, "Scheduling reconnect to $deviceAddr in ${delayMs}ms (attempt ${backoff + 1})")

        reconnectHandler.postDelayed({
            if (isScanning) {
                Log.i(TAG, "Attempting reconnect to $deviceAddr")
                // Trigger new scan to find the device again
                // The scan callback will handle reconnection
            }
        }, delayMs)
    }

    // ── Message Broadcasting ─────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun broadcastMessage(message: String) {
        Log.i(TAG, "Broadcasting message to all connected peers: $message")
        val messageBytes = message.toByteArray(Charsets.UTF_8)

        // Iterate through connected GATT clients and write to message characteristic
        gattReadState.keys.forEach { deviceAddr ->
            try {
                // Need to maintain active GATT connections for this to work
                // For now, log the intent
                Log.d(TAG, "Would send message to $deviceAddr")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send message to $deviceAddr", e)
            }
        }
    }

    // ── Event Notification Helpers ───────────────────────────────────────────

    private fun notifyPeerDiscovered(peerData: JSObject) {
        notifyListeners("peerDiscovered", peerData)
    }

    private fun notifyPeerMessage(deviceAddr: String, message: String) {
        val msgData = JSObject().apply {
            put("address", deviceAddr)
            put("message", message)
        }
        notifyListeners("peerMessage", msgData)
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
        // Allow heartbeat without GPS for pure P2P mode
        // GPS coordinates will be 0.0 if not available
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
        if (checkRequiredPermissions()) {
            startBleAdvertise()
            startBleScan()
            startWifiDirect()
            startHeartbeat()
            call.resolve(buildStatusResult())
        } else {
            call.reject("Required permissions not granted")
        }
    }

    private fun checkRequiredPermissions(): Boolean {
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
        isRedirectActive = false
        redirectJob?.cancel()
        redirectJob = null
        redirectServer?.close()
        redirectServer = null
        isMdnsActive = false
        mdnsListener?.let { nsdManager?.unregisterService(it) }
        mdnsListener = null
        heartbeatJob?.cancel()
        heartbeatJob        = null
        isScanning          = false
        isAdvertising       = false
        isWifiDirect        = false
        isHotspotActive     = false
        knownPeers.clear()
        bleVerifiedAddresses.clear()
        gattReadState.clear()
        notifyStatusChange()
    }

    // ── WiFi Hotspot Helper ─────────────────────────────────────────────────────

    @SuppressLint("PrivateApi")
    private fun setWifiHotspotEnabled(ssid: String?, password: String?): Boolean {
        try {
            val wifiManager = wifiManager ?: return false

            // Use reflection to access hidden setWifiApEnabled method
            val wifiConfigClass = Class.forName("android.net.wifi.WifiConfiguration")
            val setWifiApEnabledMethod = wifiManager.javaClass.getMethod(
                "setWifiApEnabled",
                wifiConfigClass,
                Boolean::class.javaPrimitiveType
            )

            if (ssid == null || password == null) {
                // Disable hotspot
                setWifiApEnabledMethod.invoke(wifiManager, null, false)
                return true
            }

            // Create WiFi configuration for hotspot
            val wifiConfig = WifiConfiguration().apply {
                this.SSID = ssid
                this.preSharedKey = password
                this.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
            }

            // Enable hotspot
            setWifiApEnabledMethod.invoke(wifiManager, wifiConfig, true)
            return true
        } catch (e: Exception) {
            Log.e(TAG, "setWifiHotspotEnabled failed: ${e.message}")
            return false
        }
    }

    // ── Captive Portal Helper ────────────────────────────────────────────────────

    private fun handleRedirectRequest(client: Socket, joinUrl: String) {
        scope.launch {
            try {
                val input = client.getInputStream()
                val output = client.getOutputStream()

                // Read the HTTP request (we don't need to parse it, just consume it)
                val buffer = ByteArray(1024)
                while (input.read(buffer) > 0) {
                    // Consume the request
                }

                // Send HTTP redirect response
                val html = """
                    <!DOCTYPE html>
                    <html><head><meta http-equiv="refresh" content="0;url=$joinUrl">
                    <title>MeshNet Emergency</title>
                    </head><body>
                    <a href="$joinUrl">Tap here to open MeshNet Emergency</a>
                    </body></html>
                """.trimIndent()

                val response = """
                    HTTP/1.1 302 Found
                    Location: $joinUrl
                    Content-Type: text/html; charset=utf-8
                    Cache-Control: no-store, no-cache, must-revalidate
                    Content-Length: ${html.toByteArray().size}
                    
                    $html
                """.trimIndent()

                output.write(response.toByteArray())
                output.flush()
            } catch (e: Exception) {
                Log.e(TAG, "Handle redirect request error: ${e.message}")
            } finally {
                try {
                    client.close()
                } catch (e: Exception) {
                    Log.e(TAG, "Close client error: ${e.message}")
                }
            }
        }
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
