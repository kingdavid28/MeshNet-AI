# MeshNet AI ProGuard Rules
# -------------------------

# Keep Capacitor classes
-keep class com.capacitorjs.** { *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
  @com.getcapacitor.annotation.ActivityCallback <methods>;
  @com.getcapacitor.annotation.Permission <methods>;
}

# Keep SQLite plugin classes
-keep class com.capacitorcommunity.sqlite.** { *; }

# Keep BLE plugin classes
-keep class com.capacitorcommunity.bluetoothle.** { *; }

# Keep custom MeshDiscovery plugin
-keep class com.meshnet.ai.** { *; }

# Keep React Native related
-keep class com.facebook.react.** { *; }

# Keep webview JavaScript interface
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# Keep model classes
-keep class com.meshnet.ai.** { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
  public static *** d(...);
  public static *** v(...);
  public static *** i(...);
}
