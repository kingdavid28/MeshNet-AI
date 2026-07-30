[app]

# (str) Title of your application
title = MeshNet-AI

# (str) Package name
package.name = meshnetai

# (str) Package domain (needed for android/ios packaging)
package.domain = org.meshnetai

# (str) Source code where the main.py live
source.dir = .

# (str) Entry point
source.main = main.py

# (list) Source files to include (let empty to include all the files)
source.include_exts = py,kv,png,jpg,jpeg,atlas,json,enc

# (list) List of inclusions using pattern matching
source.include_patterns = assets/*,tiles/**,logs/.gitkeep,data/.gitkeep

# (str) Application versioning (method 1)
version = 1.0.0

# (list) Application requirements
# comma separated e.g. requirements = sqlite3,kivy
requirements = python3,kivy,requests,plyer,pyjnius

# Garden packages loaded at build time by the kivy-garden tool
# garden_requirements = mapview

# (str) Presplash of the application
#presplash.filename = %(source.dir)s/assets/presplash.png

# (str) Icon of the application
#icon.filename = %(source.dir)s/assets/icon.png

# (list) Supported orientations
# Valid options are: landscape, portrait, portrait-reverse, landscape-reverse, or all
orientation = landscape

#
# Android specific
#

# (bool) Indicate if the application should be fullscreen or not
fullscreen = 0

# (list) Permissions
android.permissions = BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE, ACCESS_WIFI_STATE, CHANGE_WIFI_STATE, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, INTERNET, ACCESS_NETWORK_STATE, FOREGROUND_SERVICE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, MANAGE_BLUETOOTH

# (int) Target Android API, should be as high as possible.
android.api = 33

# (int) Minimum API your APK / AAB will support.
android.minapi = 26

# (int) Android SDK version to use (deprecated - auto-detected)
# android.sdk = 33

# (str) Android NDK version to use
android.ndk = 25c

# (str) Android NDK directory (if empty, it will be automatically downloaded.)
android.ndk_path =

# (str) Android SDK directory (if empty, it will be automatically downloaded.)
android.sdk_path =

# (str) Extra xml to write directly inside the <manifest> element of AndroidManifest.xml
android.add_manifest_xml = <uses-feature android:name="android.hardware.bluetooth" android:required="true" />,<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />,<uses-feature android:name="android.hardware.wifi" android:required="true" />

# (bool) Enable AndroidX support. Enable when 'android.gradle_dependencies'
# contains an 'androidx' package, or any package from Kotlin source.
# android.enable_androidx requires android.api >= 28
android.enable_androidx = True

# (bool) Indicate whether the screen should stay on
android.wakelock = True

# (list) The Android archs to build for, choices: armeabi-v7a, arm64-v8a, x86, x86_64
android.archs = arm64-v8a

# (bool) enables Android auto backup feature (Android API >=23)
android.allow_backup = True

# (str) The format used to package the app for release mode (aab or apk or aar).
android.release_artifact = apk

# (str) The format used to package the app for debug mode (apk or aar).
android.debug_artifact = apk

# (str) Bootstrap to use for android builds
p4a.bootstrap = sdl2

# (str) python-for-android branch to use, defaults to master
# p4a.branch = master

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug (with command output))
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1

# (str) Path to build artifact storage, absolute or relative to spec file
# Use absolute path without spaces to avoid python-for-android issues
build_dir = /home/reycelmeshnet/.buildozer-kivyapp

# (str) Path to build output (i.e. .apk, .aab, .ipa) storage
bin_dir = /home/reycelmeshnet/kivyapp-bin
