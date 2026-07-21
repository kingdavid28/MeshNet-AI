package com.meshnet.ai

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
}
