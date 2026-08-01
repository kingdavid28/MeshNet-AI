import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must match the applicationId in android/app/build.gradle
  appId:   "com.meshnet.ai",
  appName: "MeshNet AI",
  // Vite build output — Capacitor copies dist/ into the Android webview
  webDir:  "dist",
  plugins: {
    // SQLite plugin configuration
    CapacitorSQLite: {
      platform: 'CapacitorSQLite',
    },
    // MeshDiscoveryPlugin config — consumed by MeshDiscoveryPlugin.kt
    MeshDiscovery: {
      // Backend URL for hybrid mode (try backend first, fallback to P2P)
      // Empty string means pure P2P mode, URL means hybrid mode
      apiBase: "",
      // BLE service UUID advertised by every MeshNet node.
      // Must be the same on every device in the mesh.
      serviceUuid: "0000FEED-0000-1000-8000-00805F9B34FB",
      // Wi-Fi Direct group name prefix (SSID: MESHNET-<6 hex chars>)
      wifiSsidPrefix: "MESHNET-",
      // Heartbeat interval in milliseconds
      heartbeatIntervalMs: 5000,
    },
  },
};

export default config;
