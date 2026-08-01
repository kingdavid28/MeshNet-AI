package com.meshnet.ai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity
import com.getcapacitor.Plugin

/**
 * MainActivity — Capacitor entry point.
 *
 * All plugin registration is done via auto-discovery (Capacitor 3+):
 * every @CapacitorPlugin-annotated class in the package is registered
 * automatically. No manual registration needed.
 */
class MainActivity : BridgeActivity() {
    companion object {
        private const val TAG = "MeshNetMainActivity"
        private const val PERMISSION_REQUEST_CODE = 1001

        private val REQUIRED_PERMISSIONS = arrayOf(
            // Location permissions (required for BLE scanning)
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            // Bluetooth permissions (Android 12+)
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_ADVERTISE,
            Manifest.permission.BLUETOOTH_CONNECT,
            // WiFi permissions
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.CHANGE_WIFI_STATE,
            Manifest.permission.ACCESS_NETWORK_STATE,
            // Nearby WiFi devices (Android 13+)
            Manifest.permission.NEARBY_WIFI_DEVICES,
            // Notifications (Android 13+)
            Manifest.permission.POST_NOTIFICATIONS
        )
    }

    // Manual plugin registration for custom plugins
    init {
        registerPlugin(MeshDiscoveryPlugin::class.java)
        // SQLite plugin should be auto-discovered by Capacitor
        // If it's not loading, the issue is likely with the plugin sync, not registration
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        try {
            // Create notification channel for foreground service
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    MeshNetForegroundService.createNotificationChannel(this)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to create notification channel", e)
                }
            }
            
            super.onCreate(savedInstanceState)
            
            // Request runtime permissions after Capacitor is initialized
            requestRuntimePermissions()
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            try {
                super.onCreate(savedInstanceState)
            } catch (e2: Exception) {
                Log.e(TAG, "Error calling super.onCreate", e2)
            }
        }
    }
    
    private fun requestRuntimePermissions() {
        val permissionsToRequest = mutableListOf<String>()
        
        for (permission in REQUIRED_PERMISSIONS) {
            // Check if permission is needed for this Android version
            if (!isPermissionNeededForSdkVersion(permission)) continue
            
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(permission)
            }
        }
        
        if (permissionsToRequest.isNotEmpty()) {
            Log.d(TAG, "Requesting ${permissionsToRequest.size} runtime permissions")
            ActivityCompat.requestPermissions(this, permissionsToRequest.toTypedArray(), PERMISSION_REQUEST_CODE)
        } else {
            Log.d(TAG, "All required permissions already granted")
        }
    }
    
    private fun isPermissionNeededForSdkVersion(permission: String): Boolean {
        when (permission) {
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_ADVERTISE,
            Manifest.permission.BLUETOOTH_CONNECT -> {
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            }
            Manifest.permission.NEARBY_WIFI_DEVICES -> {
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            }
            Manifest.permission.POST_NOTIFICATIONS -> {
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            }
            else -> return true
        }
    }
    
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val deniedPermissions = mutableListOf<String>()
            
            for (i in permissions.indices) {
                if (grantResults[i] != PackageManager.PERMISSION_GRANTED) {
                    deniedPermissions.add(permissions[i])
                    Log.w(TAG, "Permission denied: ${permissions[i]}")
                } else {
                    Log.d(TAG, "Permission granted: ${permissions[i]}")
                }
            }
            
            if (deniedPermissions.isNotEmpty()) {
                Log.w(TAG, "Some permissions were denied: ${deniedPermissions.joinToString()}")
            } else {
                Log.d(TAG, "All requested permissions granted")
            }
        }
    }

    override fun load() {
        try {
            // Configure WebView for better scrolling behavior
            val webView = this.bridge?.webView
            webView?.let {
                it.isVerticalScrollBarEnabled = true
                it.isHorizontalScrollBarEnabled = false
                it.overScrollMode = WebView.OVER_SCROLL_ALWAYS
            }
            super.load()
        } catch (e: Exception) {
            Log.e(TAG, "Error in load", e)
            super.load()
        }
    }

    override fun onResume() {
        super.onResume()
        // Don't auto-start foreground service to avoid memory pressure crashes
        // Service will be started manually when needed for background operations
    }

    override fun onPause() {
        super.onPause()
        // Keep foreground service running when app is paused
        // This ensures background monitoring continues
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            // Stop foreground service when app is destroyed
            val serviceIntent = Intent(this, MeshNetForegroundService::class.java)
            serviceIntent.action = MeshNetForegroundService.ACTION_STOP
            startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop foreground service", e)
        }
    }
}
