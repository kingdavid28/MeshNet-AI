# MeshNet Desktop Application

A desktop version of MeshNet with native WiFi capabilities, allowing for WiFi scanning and hotspot creation with elevated privileges.

## Features

- **Native WiFi Scanning**: Scan for available WiFi networks using system-level APIs
- **Hotspot Creation**: Create WiFi hotspots programmatically with elevated privileges
- **BLE Advertising**: Broadcast WiFi credentials via BLE for automatic device discovery
- **Cross-Platform**: Supports Windows, macOS, and Linux
- **Elevated Privileges**: Detects and requires administrator privileges for WiFi operations
- **Integrated UI**: Uses the existing React web application interface

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Administrator privileges (for WiFi operations)
- **USB Bluetooth 4.0+ adapter** (for BLE advertising on Windows)
- **Zadig tool** (for WinUSB driver installation - required for BLE advertising on Windows)

## Installation

1. Navigate to the desktop directory:
```bash
cd desktop
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Development Mode

1. Start the web application (in the parent directory):
```bash
cd ..
npm run dev
```

2. Start the Electron application (in the desktop directory):
```bash
cd desktop
npm start
```

The Electron app will load the web application from `http://localhost:5173` with native WiFi capabilities.

### Production Build

1. Build the application:
```bash
npm run build
```

This will create an installer in the `dist` directory.

## Platform-Specific Requirements

### Windows
- Requires Windows 10 or higher
- Must run as Administrator for WiFi operations
- Uses `netsh` commands for WiFi management
- **BLE Advertising requires USB Bluetooth 4.0+ adapter with WinUSB driver**

### macOS
- Requires macOS 10.15 or higher
- WiFi hotspot creation requires manual configuration in System Preferences
- Uses `airport` command for WiFi scanning

### Linux
- Requires Linux with NetworkManager or hostapd
- Must run with sudo/root privileges
- Uses `nmcli` or `iwlist` for WiFi operations

## Elevated Privileges

WiFi hotspot creation requires elevated privileges:

### Windows
Right-click the application and select "Run as administrator"

### macOS
Use `sudo` to run the application or configure system preferences

### Linux
Run with `sudo` or configure sudoers for passwordless execution

## WiFi Operations

### Scanning Networks
- Click "Scan Networks" button in the WiFi Hotspot Management section
- Results show SSID, security type, and signal strength
- Updates in real-time

### Creating Hotspots
- Enter desired hotspot name in the configuration field
- Click "Activate Hotspot" button
- Hotspot will be created using system-level APIs
- Other devices can connect using the configured SSID

### Stopping Hotspots
- Click "Deactivate Hotspot" button
- Hotspot will be stopped using system-level APIs

## Troubleshooting

### "Elevated Privileges Required" Error
- Restart the application as administrator/sudo
- Check that your user has the necessary permissions

### WiFi Operations Not Working
- Verify that your WiFi adapter is enabled
- Check that no other hotspot is already active
- Ensure the application has the necessary system permissions

### Network Scanning Fails
- Check that your WiFi adapter is working
- Verify that the application has elevated privileges
- Try restarting the application

## BLE Advertising Setup (Windows Only)

BLE peripheral advertising on Windows requires a USB Bluetooth 4.0+ adapter with WinUSB driver. This is because Windows' native Bluetooth stack only supports BLE central mode (scanning/connecting), not peripheral mode (advertising).

### Hardware Requirements

- **USB Bluetooth 4.0+ adapter** (must be USB, not built-in)
- Adapter must support BLE (Bluetooth Low Energy)
- Recommended: CSR8510, CSR8510A10, or similar CSR-based adapters

### Driver Setup with Zadig

**IMPORTANT**: This process will replace the adapter's driver with WinUSB, making it unavailable for normal Bluetooth use in Windows. The adapter will be dedicated to this application.

1. **Download Zadig**
   - Download from: https://zadig.akeo.ie/
   - Extract and run `zadig.exe` as Administrator

2. **Install WinUSB Driver**
   - Plug in your USB Bluetooth adapter
   - Open Zadig and click "Options" > "List All Devices"
   - Select your Bluetooth adapter from the dropdown (e.g., "CSR8510 A10")
   - In the target driver box, select "WinUSB" (not libusb-win32)
   - Click "Install Driver" or "Replace Driver"
   - Wait for installation to complete

3. **Verify Installation**
   - The adapter should now show "WinUSB" as the driver
   - The adapter will no longer appear in Windows Bluetooth settings
   - This is normal - the adapter is now dedicated to raw hardware access

4. **Revert Driver (if needed)**
   - To restore normal Bluetooth functionality:
   - Open Device Manager
   - Find the Bluetooth adapter
   - Right-click > Update Driver > Browse my computer
   - Let me pick from available drivers > select the original Bluetooth driver

### Troubleshooting BLE Advertising

**"Bluetooth adapter not found" error**
- Verify the USB adapter is plugged in
- Check Device Manager to ensure WinUSB driver is installed
- Try unplugging and replugging the adapter

**"Permission denied" error**
- Run the application as Administrator
- Ensure the WinUSB driver is properly installed

**"LIBUSB_ERROR_NOT_SUPPORTED" error**
- This means the USB device cannot be opened by the library
- Try reinstalling the WinUSB driver with Zadig
- In Zadig, try selecting "libusb-win32" instead of "WinUSB"
- Some adapters work better with libusb-win32 driver
- Restart the application after driver change
- Try a different USB port (some ports have compatibility issues)
- Verify the adapter is a CSR-based adapter (CSR8510, CSR8510A10)

**Advertising starts but devices can't discover**
- Check that the adapter supports BLE 4.0+
- Verify the adapter is not in use by another application
- Try restarting the application

**To restore normal Bluetooth functionality**
- Use Device Manager to reinstall the original Bluetooth driver
- The adapter will then work normally with Windows Bluetooth stack

## Development

### Project Structure
```
desktop/
├── main.js           # Electron main process
├── preload.js        # IPC bridge
├── wifi-module/      # Native WiFi operations
│   └── index.js      # Platform-specific WiFi implementation
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

### Adding New WiFi Features
1. Add the feature to `wifi-module/index.js`
2. Expose the feature in `preload.js`
3. Add IPC handler in `main.js`
4. Update the React UI to use the new feature

## Security Considerations

- The application requires elevated privileges for WiFi operations
- Only run this application from trusted sources
- Review the code before running with administrator privileges
- The application makes system-level changes to WiFi configuration

## License

MIT License - See parent project for details
