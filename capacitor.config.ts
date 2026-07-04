import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must match the applicationId in android/app/build.gradle
  appId:   "com.meshnet.ai",
  appName: "MeshNet AI",
  // Vite build output — Capacitor copies dist/ into the Android webview
  webDir:  "dist",
  server: {
    // In development, point the Android webview at the Vite dev server
    // so hot-reload works on the device.  Remove for production builds.
    androidScheme: "https",
  },
  plugins: {
    // MeshDiscoveryPlugin config — consumed by MeshDiscoveryPlugin.kt
    MeshDiscovery: {
      // The Express backend URL reachable from the Android device.
      // On a real device connected to the same LAN as the dev machine,
      // use the machine's local IP (e.g. http://192.168.1.x:4000).
      // The plugin reads this at runtime; fallback is localhost.
      apiBase: process.env.VITE_API_BASE_URL ?? "http://localhost:4000",
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
