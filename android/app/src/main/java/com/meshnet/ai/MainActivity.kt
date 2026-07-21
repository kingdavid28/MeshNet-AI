package com.meshnet.ai

import android.content.Intent
import android.os.Build
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
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        // Register our custom MeshDiscovery plugin before the bridge starts
        registerPlugin(MeshDiscoveryPlugin::class.java)
        
        // Create notification channel for foreground service
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            MeshNetForegroundService.createNotificationChannel(this)
        }
        
        super.onCreate(savedInstanceState)
    }

    override fun load() {
        // Configure WebView for better scrolling behavior
        val webView = this.bridge?.webView
        webView?.let {
            it.isVerticalScrollBarEnabled = true
            it.isHorizontalScrollBarEnabled = false
            it.overScrollMode = WebView.OVER_SCROLL_ALWAYS
        }
        super.load()
    }

    override fun onResume() {
        super.onResume()
        // Start foreground service when app is resumed
        val serviceIntent = Intent(this, MeshNetForegroundService::class.java)
        serviceIntent.action = MeshNetForegroundService.ACTION_START
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    override fun onPause() {
        super.onPause()
        // Keep foreground service running when app is paused
        // This ensures background monitoring continues
    }

    override fun onDestroy() {
        super.onDestroy()
        // Stop foreground service when app is destroyed
        val serviceIntent = Intent(this, MeshNetForegroundService::class.java)
        serviceIntent.action = MeshNetForegroundService.ACTION_STOP
        startService(serviceIntent)
    }
}
