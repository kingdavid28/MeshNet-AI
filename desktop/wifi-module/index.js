const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const execAsync = promisify(exec);
const bonjour = require('bonjour')();

class WiFiModule {
  constructor() {
    this.platform = process.platform;
  }

  // Check if running with elevated privileges
  async checkElevated() {
    if (this.platform === 'win32') {
      try {
        // Try to run a command that requires admin privileges
        await execAsync('net session');
        return true;
      } catch (error) {
        return false;
      }
    }
    // On Linux/Mac, check if running as root
    return process.getuid?.() === 0;
  }

  // Get connected devices for Windows Mobile Hotspot
  async getConnectedDevices() {
    if (this.platform === 'win32') {
      try {
        console.log('[WiFi] Getting connected devices...');
        
        // Method: Get all network adapters and their connections to identify hotspot
        const adaptersCommand = `
          Get-NetAdapter | Select-Object Name, InterfaceDescription, Status | ConvertTo-Json
        `;
        
        try {
          const { stdout } = await execAsync(`powershell -Command "${adaptersCommand}"`);
          console.log('[WiFi] All adapters:', stdout);
          
          if (!stdout || stdout.trim() === '') {
            console.log('[WiFi] No adapters returned, using IP-based detection');
            return await this.getConnectedDevicesByIP();
          }
          
          const adapters = JSON.parse(stdout);
          console.log('[WiFi] Parsed adapters:', adapters);
          
          // Look for adapters that might be the hotspot
          const hotspotAdapter = adapters.find(adapter => 
            adapter.Name && (
              adapter.Name.toLowerCase().includes('mobile') ||
              adapter.Name.toLowerCase().includes('hotspot') ||
              adapter.InterfaceDescription?.toLowerCase().includes('microsoft hosted network')
            )
          );
          
          if (hotspotAdapter) {
            console.log('[WiFi] Found hotspot adapter:', hotspotAdapter.Name);
            
            // Get network connections for this adapter with IP addresses
            const connectionCommand = `
              Get-NetAdapter -Name "${hotspotAdapter.Name}" | 
              Get-NetNeighbor -AddressFamily IPv4 -State Reachable | 
              Select-Object IPAddress, LinkLayerAddress
            `;
            
            const { stdout: connectionOutput } = await execAsync(`powershell -Command "${connectionCommand}"`);
            console.log('[WiFi] Connection output:', connectionOutput);
            
            const devices = [];
            const lines = connectionOutput.split('\n');
            
            for (const line of lines) {
              const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
              const macMatch = line.match(/([0-9a-fA-F]{2}-){5}([0-9a-fA-F]{2})/);
              
              if (ipMatch && macMatch) {
                const ip = ipMatch[0];
                const mac = macMatch[0].toLowerCase();
                devices.push({ ip, mac });
              }
            }
            
            console.log(`[WiFi] Connected devices (Adapter): ${devices.length}, Devices: ${JSON.stringify(devices)}`);
            return devices;
          } else {
            console.log('[WiFi] No hotspot adapter found, trying IP-based detection');
          }
        } catch (error) {
          console.log('[WiFi] Adapter enumeration failed:', error.message);
        }
        
        // Fallback to IP-based detection
        console.log('[WiFi] Using IP-based detection for hotspot');
        return await this.getConnectedDevicesByIP();
        
      } catch (error) {
        console.error('[WiFi] All methods failed, using ARP fallback:', error.message);
        return await this.getConnectedDevicesARP();
      }
    }
    return [];
  }

  // Get connected devices count (backward compatibility)
  async getConnectedDevicesCount() {
    const devices = await this.getConnectedDevices();
    return devices.length;
  }

  // Get connected devices by IP range (hotspot typically uses 192.168.137.x)
  async getConnectedDevicesByIP() {
    try {
      console.log('[WiFi] Using IP-based detection...');
      
      // Get ARP table and filter by hotspot IP range
      const arpCommand = 'arp -a';
      const { stdout: arpOutput } = await execAsync(arpCommand);
      
      const macAddresses = new Set();
      const ipAddresses = [];
      const lines = arpOutput.split('\n');
      let currentInterface = '';
      
      for (const line of lines) {
        // Check for interface header
        const interfaceMatch = line.match(/Interface:\s*(\d+\.\d+\.\d+\.\d+)/);
        if (interfaceMatch) {
          currentInterface = interfaceMatch[1];
          console.log('[WiFi] Current interface IP:', currentInterface);
          continue;
        }
        
        // Hotspot typically uses 192.168.137.x range - STRICT FILTER
        if (currentInterface.startsWith('192.168.137.')) {
          // Extract IP and MAC from ARP entry
          const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
          const macMatch = line.match(/([0-9a-fA-F]{2}-){5}([0-9a-fA-F]{2})/);
          
          if (ipMatch && macMatch) {
            const ip = ipMatch[0];
            const mac = macMatch[0].toLowerCase();
            
            // Skip broadcast and multicast MACs
            if (!mac.startsWith('ff-ff-ff') && !mac.startsWith('01-00-5e') && !mac.startsWith('33-33')) {
              console.log(`[WiFi] Found device on hotspot interface: ${ip} (${mac})`);
              macAddresses.add(mac);
              ipAddresses.push({ ip, mac });
            }
          }
        }
      }
      
      // Get host MACs to filter out own adapters
      const hostMacs = await this.getHostMACAddresses();
      const clientMacs = new Set(Array.from(macAddresses).filter(mac => !hostMacs.includes(mac)));

      // ARP presence on the hotspot interface is sufficient — ICMP ping is blocked
      // by most mobile device firewalls (Android/iOS) causing false negatives.
      const clientDevices = ipAddresses.filter(({ mac }) => clientMacs.has(mac));

      console.log(`[WiFi] Connected devices (ARP): ${clientDevices.length}, Devices: ${JSON.stringify(clientDevices)}`);
      return clientDevices;
      
    } catch (error) {
      console.error('[WiFi] IP-based detection failed:', error.message);
      return await this.getConnectedDevicesARP();
    }
  }

  // Get hotspot IP address
  async getHotspotIP() {
    if (this.platform === 'win32') {
      try {
        const command = 'netsh interface ip show address "Mobile Hotspot*"';
        const { stdout } = await execAsync(command);
        
        const ipMatch = stdout.match(/IP Address:\s*(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) {
          console.log('[WiFi] Hotspot IP:', ipMatch[1]);
          return ipMatch[1];
        }
        
        // Fallback to default
        console.log('[WiFi] Using default hotspot IP: 192.168.137.1');
        return '192.168.137.1'; // NOSONAR — known Windows hotspot gateway
      } catch (error) {
        console.log('[WiFi] Could not get hotspot IP, using default: 192.168.137.1');
        return '192.168.137.1'; // NOSONAR
      }
    }
    return '192.168.137.1'; // NOSONAR
  }

  // Setup mDNS hostname for automatic discovery
  async setupMDNSHostname() {
    if (this.platform === 'win32') {
      try {
        // Try to set up a local hostname for easy access
        // This requires admin privileges and may not work on all Windows versions
        const command = 'netsh interface ip set dns "Mobile Hotspot*" static 192.168.137.1';
        await execAsync(command);
        console.log('[WiFi] mDNS hostname setup attempted');
      } catch (error) {
        console.log('[WiFi] mDNS hostname setup not available:', error.message);
      }
    }
  }

  // Fallback method using ARP with interface filtering
  async getConnectedDevicesARP() {
    try {
      console.log('[WiFi] Using ARP fallback method...');

      // Get Mobile Hotspot interface details using PowerShell
      const psCommand = `
        Get-NetAdapter |
        Where-Object { $_.Name -like '*Mobile*' -or $_.Name -like '*Hotspot*' } |
        Select-Object -ExpandProperty InterfaceAlias
      `;

      let hotspotInterface = '';
      let hotspotIP = '';
      try {
        const { stdout } = await execAsync(`powershell -Command "${psCommand}"`);
        const interfaces = stdout.trim().split('\n').filter(i => i.trim());
        if (interfaces.length > 0) {
          hotspotInterface = interfaces[0].trim();
          console.log('[WiFi] Hotspot interface:', hotspotInterface);

          // Get the IP address of the hotspot interface
          const ipCommand = `powershell -Command "Get-NetIPAddress -InterfaceAlias '${hotspotInterface}' -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress"`;
          const { stdout: ipOutput } = await execAsync(ipCommand);
          const ips = ipOutput.trim().split('\n').filter(ip => ip.trim());
          if (ips.length > 0) {
            hotspotIP = ips[0].trim();
            console.log('[WiFi] Hotspot IP:', hotspotIP);

            // Clear ARP cache for the hotspot interface to remove stale entries
            try {
              await execAsync(`arp -d ${hotspotIP}`);
              console.log('[WiFi] Cleared ARP cache for hotspot interface');
            } catch (error) {
              // Ignore ARP clear errors - may not have permission or entries
            }
          }
        }
      } catch (error) {
        console.log('[WiFi] Could not get hotspot interface name');
      }

      // Get ARP table
      const arpCommand = 'arp -a';
      const { stdout: arpOutput } = await execAsync(arpCommand);
      
      // Parse ARP table and filter by hotspot interface
      const devices = [];
      const lines = arpOutput.split('\n');
      let currentInterface = '';
      
      for (const line of lines) {
        // Check for interface header
        const interfaceMatch = line.match(/Interface:\s*(\d+\.\d+\.\d+\.\d+)/);
        if (interfaceMatch) {
          currentInterface = interfaceMatch[1];
          continue;
        }
        
        // If we have a hotspot interface, try to get its IP and filter
        if (hotspotInterface && currentInterface) {
          // Get the interface IP for the current ARP interface
          try {
            const getIPCommand = `powershell -Command "Get-NetIPAddress -InterfaceAlias '${hotspotInterface}' -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress"`;
            const { stdout: ipOutput } = await execAsync(getIPCommand);
            const hotspotIPs = ipOutput.trim().split('\n').filter(ip => ip.trim());
            
            // Only count if current interface IP matches hotspot interface IP
            if (!hotspotIPs.includes(currentInterface)) {
              continue;
            }
          } catch (error) {
            // If we can't filter by interface, continue with all
          }
        }
        
        // Parse IP and MAC address
        const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        const macMatch = line.match(/([0-9a-fA-F]{2}-){5}([0-9a-fA-F]{2})/);
        if (ipMatch && macMatch) {
          const ip = ipMatch[0];
          const mac = macMatch[0].toLowerCase();
          // Skip broadcast and multicast MACs
          if (!mac.startsWith('ff-ff-ff') && !mac.startsWith('01-00-5e') && !mac.startsWith('33-33')) {
            devices.push({ ip, mac });
          }
        }
      }
      
      // Get host MACs to filter out
      const hostMacs = await this.getHostMACAddresses();
      const clientDevices = devices.filter(device => !hostMacs.includes(device.mac));

      // Verify devices are actually reachable by pinging them
      const activeDevices = [];
      for (const device of clientDevices) {
        try {
          // Quick ping with 1 second timeout
          await execAsync(`ping -n 1 -w 1000 ${device.ip}`);
          activeDevices.push(device);
        } catch (error) {
          // Device not reachable, skip it
          console.log(`[WiFi] Device ${device.ip} not reachable, skipping`);
        }
      }

      console.log(`[WiFi] Connected devices (ARP + ping): ${activeDevices.length}, Devices: ${JSON.stringify(activeDevices)}`);
      return activeDevices;
      
    } catch (error) {
      console.error('[WiFi] ARP fallback failed:', error.message);
      return [];
    }
  }

  // Get host machine's MAC addresses
  async getHostMACAddresses() {
    try {
      const { stdout } = await execAsync('getmac /fo csv /nh');
      const lines = stdout.split('\n');
      const macs = [];
      
      for (const line of lines) {
        const match = line.match(/([0-9a-fA-F]{2}-){5}([0-9a-fA-F]{2})/);
        if (match) {
          macs.push(match[0].toLowerCase());
        }
      }
      
      return macs;
    } catch (error) {
      console.error('[WiFi] Failed to get host MACs:', error.message);
      return [];
    }
  }

  // Broadcast mDNS service for MeshNet discovery
  async broadcastMDNSService(config) {
    try {
      console.log('[mDNS] Broadcasting MeshNet service:', config);
      const { name, port, txt } = config;
      
      // Use bonjour library for cross-platform mDNS broadcasting
      const service = bonjour.publish({
        name: name,
        type: 'http',
        port: port,
        txt: txt
      });
      
      service.on('up', () => {
        console.log(`[mDNS] Service published: ${name}._http._tcp.local on port ${port}`);
      });
      
      service.on('error', (err) => {
        console.error('[mDNS] Service error:', err);
      });
      
      // Store service reference for cleanup
      this.mdnsService = service;
      
      return { success: true, message: 'mDNS service broadcast active' };
    } catch (error) {
      console.error('[mDNS] Broadcast failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Stop mDNS service broadcasting
  stopMDNSService() {
    if (this.mdnsService) {
      this.mdnsService.stop();
      this.mdnsService = null;
      console.log('[mDNS] Service broadcast stopped');
    }
  }

  // Scan for available WiFi networks
  async scanNetworks() {
    if (this.platform === 'win32') {
      return this.scanWindows();
    } else if (this.platform === 'darwin') {
      return this.scanMacOS();
    } else if (this.platform === 'linux') {
      return this.scanLinux();
    }
    throw new Error('Unsupported platform');
  }

  // Windows WiFi scanning using netsh
  async scanWindows() {
    try {
      const { stdout } = await execAsync('netsh wlan show networks mode=bssid');
      return this.parseWindowsNetworks(stdout);
    } catch (error) {
      throw new Error(`WiFi scan failed: ${error.message}`);
    }
  }

  // Parse Windows netsh output
  parseWindowsNetworks(output) {
    const networks = [];
    const lines = output.split('\n');
    let currentNetwork = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('SSID')) {
        if (currentNetwork) {
          networks.push(currentNetwork);
        }
        const ssid = trimmed.split(':')[1]?.trim() || '';
        currentNetwork = {
          ssid: ssid,
          bssid: [],
          signal: 0,
          security: '',
          channel: 0
        };
      } else if (currentNetwork) {
        if (trimmed.startsWith('BSSID')) {
          const bssid = trimmed.split(':')[1]?.trim() || '';
          currentNetwork.bssid.push(bssid);
        } else if (trimmed.includes('Signal')) {
          const signalMatch = trimmed.match(/(\d+)%/);
          if (signalMatch) {
            currentNetwork.signal = Number.parseInt(signalMatch[1]);
          }
        } else if (trimmed.includes('Authentication')) {
          currentNetwork.security = trimmed.split(':')[1]?.trim() || '';
        } else if (trimmed.includes('Channel')) {
          const channelMatch = trimmed.match(/(\d+)/);
          if (channelMatch) {
            currentNetwork.channel = Number.parseInt(channelMatch[1]);
          }
        }
      }
    }

    if (currentNetwork) {
      networks.push(currentNetwork);
    }

    return networks;
  }

  // macOS WiFi scanning using airport
  async scanMacOS() {
    try {
      const { stdout } = await execAsync('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s');
      return this.parseMacOSNetworks(stdout);
    } catch (error) {
      throw new Error(`WiFi scan failed: ${error.message}`);
    }
  }

  // Parse macOS airport output
  parseMacOSNetworks(output) {
    const networks = [];
    const lines = output.split('\n').slice(1); // Skip header

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 6) {
        networks.push({
          ssid: parts[0],
          bssid: parts[1],
          rssi: Number.parseInt(parts[2]),
          channel: Number.parseInt(parts[3]),
          ht: parts[4],
          cc: parts[5],
          security: parts.length > 6 ? parts.slice(6).join(' ') : ''
        });
      }
    }

    return networks;
  }

  // Linux WiFi scanning using nmcli or iwlist
  async scanLinux() {
    try {
      // Try nmcli first
      const { stdout } = await execAsync('nmcli -t -f active,ssid,bssid,signal,security dev wifi list');
      return this.parseLinuxNetworks(stdout);
    } catch (error) {
      // Fallback to iwlist
      try {
        const { stdout } = await execAsync('sudo iwlist scan');
        return this.parseLinuxIwlist(stdout);
      } catch (error_) {
        throw new Error(`WiFi scan failed: ${error_.message}`);
      }
    }
  }

  // Parse Linux nmcli output
  parseLinuxNetworks(output) {
    const networks = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(':');
      if (parts.length >= 5) {
        networks.push({
          active: parts[0] === 'yes',
          ssid: parts[1],
          bssid: parts[2],
          signal: Number.parseInt(parts[3]),
          security: parts[4]
        });
      }
    }

    return networks;
  }

  // Create WiFi hotspot
  async createHotspot(config) {
    if (this.platform === 'win32') {
      return this.createWindowsHotspot(config);
    } else if (this.platform === 'darwin') {
      return this.createMacOSHotspot(config);
    } else if (this.platform === 'linux') {
      return this.createLinuxHotspot(config);
    }
    throw new Error('Unsupported platform');
  }

  // Windows hotspot creation using netsh
  async createWindowsHotspot(config) {
    try {
      const { ssid } = config;
      
      // Check if running with elevated privileges
      const isElevated = await this.checkElevated();
      console.log(`Running with elevated privileges: ${isElevated}`);
      
      if (!isElevated) {
        throw new Error('Application is not running with administrator privileges. Please restart as administrator.');
      }
      
      // Windows Mobile Hotspot requires WPA2 security - cannot create open network
      // Using simple password for emergency access
      const password = config.password || '12345678'; // Simple password for easy entry
      console.log(`Creating emergency mobile hotspot with SSID: "${ssid}"`);
      console.log(`Using WPA2 security with simple password: "${password}"`);
      
      // Try to enable Mobile Hotspot using PowerShell
      try {
        console.log('Attempting to enable Mobile Hotspot with WPA2 security...');
        
        // Set Mobile Hotspot SSID using registry
        const setSsidCommand = String.raw`powershell -Command "Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\WlanSvc\Parameters\HostedNetworkSettings' -Name 'SSID' -Value ([byte[]](char[]'${ssid}'))"`;
        
        try {
          await execAsync(setSsidCommand);
          console.log('Mobile Hotspot SSID set');
        } catch (ssidError) {
          console.error(`Failed to set SSID: ${ssidError.message}`);
        }
        
        // Enable Mobile Hotspot
        const enableCommand = 'powershell -Command "Start-Process ms-settings:network-mobilehotspot"';
        console.log(`Opening Mobile Hotspot settings for manual activation`);
        
        try {
          await execAsync(enableCommand);
          console.log('Mobile Hotspot settings opened');
        } catch (enableError) {
          console.error(`Failed to open Mobile Hotspot settings: ${enableError.message}`);
        }
        
        // Provide manual activation instructions with password
        return {
          success: true,
          message: 'Mobile Hotspot settings opened for manual activation',
          manualInstructions: [
            '1. In the opened Mobile Hotspot settings window:',
            '2. Set Network name to "MeshNet"',
            '3. Set Network password to: 12345678',
            '4. Toggle "Share my internet connection" to ON',
            '5. Victims can connect using this simple password',
            '6. Once activated, return to this app to continue'
          ],
          password: password,
          isOpen: false,
          method: 'Windows Mobile Hotspot (WPA2 Security)'
        };
        
      } catch (mobileHotspotError) {
        console.error(`Mobile Hotspot approach failed: ${mobileHotspotError.message}`);
        
        // Fallback: Provide instructions for manual activation
        return {
          success: false,
          message: 'Mobile Hotspot requires manual activation',
          manualInstructions: [
            '1. Open Windows Settings (Windows Key + I)',
            '2. Go to Network & Internet > Mobile Hotspot',
            '3. Set Network name to "MeshNet"',
            '4. Set Network password to: 12345678',
            '5. Toggle "Share my internet connection" to ON',
            '6. Victims can connect using this simple password',
            '7. Return to this app to continue'
          ],
          error: mobileHotspotError.message,
          troubleshooting: 'Mobile Hotspot may need to be enabled manually in Windows Settings'
        };
      }
      
    } catch (error) {
      console.error('Hotspot creation error:', error);
      return {
        success: false,
        message: error.message || 'Unknown error occurred'
      };
    }
  }

  // macOS hotspot creation
  async createMacOSHotspot(config) {
    try {
      throw new Error('macOS hotspot creation requires manual configuration in System Preferences');
    } catch (error) {
      throw new Error(`Hotspot creation failed: ${error.message}`);
    }
  }

  // Linux hotspot creation using hostapd
  async createLinuxHotspot(config) {
    try {
      throw new Error('Linux hotspot creation requires hostapd configuration');
    } catch (error) {
      throw new Error(`Hotspot creation failed: ${error.message}`);
    }
  }

  // Stop WiFi hotspot
  async stopHotspot() {
    if (this.platform === 'win32') {
      return this.stopWindowsHotspot();
    } else if (this.platform === 'darwin') {
      return this.stopMacOSHotspot();
    } else if (this.platform === 'linux') {
      return this.stopLinuxHotspot();
    }
    throw new Error('Unsupported platform');
  }

  // Stop Windows hotspot
  async stopWindowsHotspot() {
    try {
      await execAsync('netsh wlan stop hostednetwork');
      return { success: true, message: 'Hotspot stopped successfully' };
    } catch (error) {
      throw new Error(`Hotspot stop failed: ${error.message}`);
    }
  }

  // Stop macOS hotspot
  async stopMacOSHotspot() {
    try {
      // Disable Internet Sharing
      throw new Error('macOS hotspot stop requires manual configuration in System Preferences');
    } catch (error) {
      throw new Error(`Hotspot stop failed: ${error.message}`);
    }
  }

  // Stop Linux hotspot
  async stopLinuxHotspot() {
    try {
      // Kill hostapd process
      await execAsync('sudo pkill hostapd');
      return { success: true, message: 'Hotspot stopped successfully' };
    } catch (error) {
      throw new Error(`Hotspot stop failed: ${error.message}`);
    }
  }
}

module.exports = new WiFiModule();
