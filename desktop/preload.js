const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // WiFi operations
  scanNetworks: () => ipcRenderer.invoke('wifi-scan'),
  createHotspot: (config) => ipcRenderer.invoke('wifi-create-hotspot', config),
  stopHotspot: () => ipcRenderer.invoke('wifi-stop-hotspot'),
  checkElevated: () => ipcRenderer.invoke('check-elevated'),
  getConnectedDevicesCount: () => ipcRenderer.invoke('wifi-connected-devices'),
  getConnectedDevices: () => ipcRenderer.invoke('wifi-connected-devices-list'),
  getHotspotIP: () => ipcRenderer.invoke('wifi-get-hotspot-ip'),
  broadcastMDNSService: (config) => ipcRenderer.invoke('mdns-broadcast', config),
  stopMDNSService: () => ipcRenderer.invoke('mdns-stop'),
  
  // Redirect server for automatic device discovery
  startRedirectServer: (hotspotIP) => ipcRenderer.invoke('start-redirect-server', hotspotIP),
  stopRedirectServer: () => ipcRenderer.invoke('stop-redirect-server'),
  setupCaptivePortal: (hotspotIP) => ipcRenderer.invoke('setup-captive-portal', hotspotIP),

  // Device GPS via Windows Location API (bypasses Chromium's Google dependency)
  getLocation: () => ipcRenderer.invoke('get-location'),

  // Platform detection
  platform: process.platform,
  
  // App info
  getVersion: () => process.versions.electron
});
