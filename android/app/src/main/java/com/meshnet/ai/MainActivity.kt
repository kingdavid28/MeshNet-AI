package com.meshnet.ai

import android.content.Intent
import android.os.Build
import android.util.Log
import android.webkit.WebView
import com.getcapacitor.BridgeActivity

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
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        try {
            // Register our custom MeshDiscovery plugin before the bridge starts
            registerPlugin(MeshDiscoveryPlugin::class.java)
            
            // Create notification channel for foreground service
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    MeshNetForegroundService.createNotificationChannel(this)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to create notification channel", e)
                }
            }
            
            super.onCreate(savedInstanceState)
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            super.onCreate(savedInstanceState)
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
        // Temporarily disable foreground service to debug app startup
        // Uncomment after app opens successfully
        /*
        try {
            // Start foreground service when app is resumed
            val serviceIntent = Intent(this, MeshNetForegroundService::class.java)
            serviceIntent.action = MeshNetForegroundService.ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service", e)
            // Don't crash the app if service fails to start
        }
        */
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
