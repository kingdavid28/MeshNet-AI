import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getApiBase, getMeshSecret } from '../utils/env';
import { WiFiHotspotService, HotspotConfig } from '../services/wifi';
import { DesktopWiFiService } from '../services/wifi-desktop';
import mdnsService from '../services/mdns';
import { useDeviceLocation } from '../app/hooks/useDeviceLocation';
import { meshDeviceEmitter } from './NetworkStatus';
import { MeshDiscovery } from '../app/plugins/MeshDiscoveryPlugin';

const DEFAULT_HOTSPOT_IP = '192.168.137.1'; // NOSONAR — known Windows hotspot gateway, not a secret

interface HotspotManagerProps {
  onCredentialsChange?: (credentials: { ssid: string; password: string } | null) => void;
}

export function HotspotManager({ onCredentialsChange }: HotspotManagerProps) {
  const [hotspotConfig, setHotspotConfig] = useState<HotspotConfig | null>(null);
  const [isHotspotActive, setIsHotspotActive] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState(0);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [isElevated, setIsElevated] = useState(false);
  const [manualInstructions, setManualInstructions] = useState<string[] | null>(null);
  const [hotspotIP, setHotspotIP] = useState<string>('');
  const [captivePortalStatus, setCaptivePortalStatus] = useState<'auto'|'proxied'|'manual'|null>(null);
  const [desktopBackendIP, setDesktopBackendIP] = useState<string>('192.168.1.100'); // Default desktop backend IP
  const [networkMode, setNetworkMode] = useState<'manual' | 'auto' | 'bluetooth'>('auto'); // Network connection mode
  const registeredDevicesRef    = useRef<Set<string>>(new Set()); // registered WITH coords
  const registeredNoGpsRef       = useRef<Set<string>>(new Set()); // registered WITHOUT coords
  const deviceLocation = useDeviceLocation();
  // Always-current ref so interval callbacks never capture a stale deviceLocation
  const deviceLocationRef = useRef(deviceLocation);
  useEffect(() => { deviceLocationRef.current = deviceLocation; }, [deviceLocation]);
  // Track last device list fingerprint to suppress unchanged-state logs
  const lastDeviceFingerprintRef = useRef<string>("");
  const openSystemHotspotSettings = () => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    let url: string | null = null;
    if (/Windows NT/.test(ua)) {
      url = 'ms-settings:network-mobilehotspot';
    } else if (/Android/.test(ua)) {
      url = 'intent://#Intent;action=android.settings.TETHER_SETTINGS;end';
    }
    if (!url) return;

    try {
      // Open a blank popup in the same user gesture, then navigate it to the
      // system settings URL. This avoids popup blockers and gives the OS a
      // chance to launch the native Settings app.
      const win = window.open('about:blank', '_blank');
      if (win) {
        win.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      console.warn('[HotspotManager] Could not open hotspot settings:', err);
      try {
        window.location.href = url;
      } catch {
        // ignore
      }
    }
  };

  const wifiService = useMemo(() => new WiFiHotspotService(), []);
  const desktopWiFiService = useMemo(() => new DesktopWiFiService(), []);

  useEffect(() => {
    // Check if running in desktop (Electron) app
    const desktopSupported = desktopWiFiService.isSupported();
    setIsDesktop(desktopSupported);
    
    // Check if WiFi APIs are supported (browser)
    setIsSupported(WiFiHotspotService.isSupported());
    
    // Load existing hotspot config
    loadHotspotConfig();
    
    // Check elevated privileges if in desktop mode
    if (desktopSupported) {
      checkElevatedPrivileges();
    }
    
    // Listen for WiFi events
    wifiService.on('hotspotActivated', handleHotspotActivated);
    wifiService.on('hotspotDeactivated', handleHotspotDeactivated);
    wifiService.on('devicesUpdated', handleDevicesUpdated);

    return () => {
      wifiService.off('hotspotActivated', handleHotspotActivated);
      wifiService.off('hotspotDeactivated', handleHotspotDeactivated);
      wifiService.off('devicesUpdated', handleDevicesUpdated);
    };
  }, []);

  // Periodically update connected devices count when hotspot is active
  const updateConnectedDevicesCount = useCallback(async () => {
    if (!isDesktop || !isHotspotActive) return;
    try {
      // Try detailed device list; fall back to a plain count if the API doesn't provide it
      let rawDevices: Array<{ mac: string; ip: string }> = [];
      try {
        rawDevices = await desktopWiFiService.getConnectedDevices();
      } catch {
        const count = await desktopWiFiService.getConnectedDevicesCount();
        rawDevices = Array.from({ length: count }, (_, i) => ({
          mac: `device-${i}`,
          ip: '',
        }));
      }

      const gatewayIp = await desktopWiFiService.getHotspotIP().catch(() => '');

      // Dedupe by MAC and exclude the hotspot gateway so we only count real peers
      const seenMacs = new Set<string>();
      const devices = rawDevices.filter((d: { mac: string; ip: string }) => {
        if (!d.mac || seenMacs.has(d.mac)) return false;
        if (d.ip && d.ip === gatewayIp) return false;
        seenMacs.add(d.mac);
        return true;
      });

      const fingerprint = JSON.stringify([...seenMacs].sort((a, b) => a.localeCompare(b)));

      // Only log + process when the device list actually changed
      if (fingerprint !== lastDeviceFingerprintRef.current) {
        lastDeviceFingerprintRef.current = fingerprint;
        console.log('[HotspotManager] Connected devices changed:', devices);
        setConnectedDevices(devices.length);
        meshDeviceEmitter.updateCount(devices.length);

        const meshSecret = getMeshSecret();
        if (!meshSecret) {
          console.warn('[HotspotManager] No mesh-secret found, skipping device registration');
          return;
        }
        await Promise.all(devices.map((d: { mac: string; ip: string }) => registerDevice(d, meshSecret)));
      }
    } catch (err) {
      console.error('[HotspotManager] Failed to get connected devices:', err);
    }
  }, [isDesktop, isHotspotActive]);

  useEffect(() => {
    if (!isDesktop || !isHotspotActive) return;
    void updateConnectedDevicesCount();
    const interval = setInterval(() => void updateConnectedDevicesCount(), 10_000);
    return () => clearInterval(interval);
  }, [isDesktop, isHotspotActive, updateConnectedDevicesCount]);

  const loadHotspotConfig = async () => {
    const config = await wifiService.createHotspotConfig();
    // Emergency network: simple password for Windows WPA2 requirement
    config.ssid = 'meshnet';
    config.password = '12345678'; // Simple password for easy emergency access
    setHotspotConfig(config);
  };

  const handleHotspotActivated = (config: HotspotConfig) => {
    setIsHotspotActive(true);
    setHotspotConfig(config);
    setError(null);
    // Notify parent of credentials for BLE advertising
    onCredentialsChange?.({ ssid: config.ssid, password: config.password });
  };

  const handleHotspotDeactivated = () => {
    setIsHotspotActive(false);
    // Clear registered devices when hotspot is deactivated
    registeredDevicesRef.current = new Set();
    registeredNoGpsRef.current = new Set();
    setConnectedDevices(0);
    meshDeviceEmitter.updateCount(0);
    // Clear credentials for BLE advertising
    onCredentialsChange?.(null);
  };

  const handleDevicesUpdated = (count: number) => {
    setConnectedDevices(count);
  };

  const activateHotspot = async () => {
    setActivating(true);
    setError(null);
    try {
      if (isDesktop) {
        await handleDesktopActivation();
      } else {
        // Check if running in Capacitor (Android app)
        const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;
        
        if (isCapacitor) {
          // Use Android native plugin for phone mode
          await handlePhoneActivation();
        } else {
          // Browser mode - open system settings
          openSystemHotspotSettings();
          const success = await wifiService.activateHotspot();
          if (success) {
            setShowInstructions(true);
          } else {
            setError('Failed to activate hotspot');
          }
        }
      }
    } catch (err) {
      setError('Hotspot activation error: ' + (err as Error).message);
    } finally {
      setActivating(false);
    }
  };

  // ── Extracted helper: stop redirect server + mDNS before deactivation ──────
  const stopDesktopServices = async (): Promise<void> => {
    try {
      await desktopWiFiService.stopRedirectServer();
      console.log('[HotspotManager] Redirect server stopped');
    } catch (error) {
      console.error('[HotspotManager] Failed to stop redirect server:', error);
    }
    const eAPI = (globalThis as any).electronAPI;
    if (eAPI) {
      try {
        await eAPI.stopMDNSService();
        console.log('[HotspotManager] mDNS service stopped');
      } catch (error) {
        console.error('[HotspotManager] Failed to stop mDNS service:', error);
      }
    }
  };

  const deactivateHotspot = async () => {
    setActivating(true);
    setError(null);
    try {
      const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;
      
      if (isDesktop) {
        await stopDesktopServices();
      } else if (isCapacitor) {
        // Stop phone services
        await handlePhoneDeactivation();
      }
      
      const success = await wifiService.deactivateHotspot();
      if (success) {
        setIsHotspotActive(false);
        setShowInstructions(false);
        registeredDevicesRef.current = new Set();
      } else {
        setError('Failed to deactivate hotspot');
      }
    } catch (error) {
      setError('Hotspot deactivation error: ' + (error as Error).message);
    } finally {
      setActivating(false);
    }
  };

  // ── Extracted helper: phone hotspot activation branch ────────────────────
  const handlePhoneActivation = async (): Promise<boolean> => {
    try {
      const ssid = 'meshnet';
      const password = '12345678';
      
      // Start WiFi hotspot using Android native plugin
      await MeshDiscovery.startHotspot({ ssid, password });
      console.log('[HotspotManager] Phone hotspot started');
      
      // Determine backend URL based on network mode
      let backendIP: string | undefined = undefined;
      const hotspotIP = '192.168.43.1'; // Android hotspot default
      
      if (networkMode === 'manual') {
        // Manual mode: use configured desktop backend IP
        backendIP = desktopBackendIP;
        console.log('[HotspotManager] Manual mode: redirecting to desktop backend:', desktopBackendIP);
      } else if (networkMode === 'auto') {
        // Auto mode: detect if desktop is on phone's network
        // Try to discover desktop via mDNS or use default
        backendIP = '192.168.43.1'; // Default to desktop being on same network
        console.log('[HotspotManager] Auto mode: assuming desktop on phone network');
      } else if (networkMode === 'bluetooth') {
        // Bluetooth mode: use Bluetooth tethering IP
        backendIP = '192.168.44.1'; // Typical Bluetooth tethering gateway
        console.log('[HotspotManager] Bluetooth mode: redirecting via Bluetooth');
      }
      
      // Start captive portal redirect server
      await MeshDiscovery.startRedirectServer({ 
        hotspotIP, 
        backendIP 
      });
      console.log('[HotspotManager] Phone redirect server started, redirecting to:', backendIP || 'local');
      
      // Start mDNS broadcasting
      await MeshDiscovery.startMdnsBroadcast({
        serviceName: 'MeshNet Emergency Network',
        port: 4000,
        ssid,
        password
      });
      console.log('[HotspotManager] Phone mDNS broadcast started');
      
      setIsHotspotActive(true);
      onCredentialsChange?.({ ssid, password });
      return true;
    } catch (error) {
      console.error('[HotspotManager] Phone activation failed:', error);
      setError('Phone hotspot activation failed: ' + (error as Error).message);
      return false;
    }
  };

  // ── Extracted helper: phone hotspot deactivation branch ──────────────────
  const handlePhoneDeactivation = async (): Promise<void> => {
    try {
      await MeshDiscovery.stopHotspot();
      console.log('[HotspotManager] Phone hotspot stopped');
      
      await MeshDiscovery.stopRedirectServer();
      console.log('[HotspotManager] Phone redirect server stopped');
      
      await MeshDiscovery.stopMdnsBroadcast();
      console.log('[HotspotManager] Phone mDNS broadcast stopped');
    } catch (error) {
      console.error('[HotspotManager] Phone deactivation failed:', error);
    }
  };

  // ── Extracted helper: desktop hotspot activation branch ───────────────────
  const handleDesktopActivation = async (): Promise<boolean> => {
    const config = {
      ssid: 'meshnet', // Clear emergency SSID for easy identification
      password: '12345678', // Simple password for Windows WPA2 requirement
      interface: 'wlan0',
    };
    console.log('[HotspotManager] Creating hotspot with config:', config);
    const result = await desktopWiFiService.createHotspot(config);
    console.log('[HotspotManager] Hotspot creation result:', result);
    const success = result.success !== false;

    if (!success) {
      if (result.manualInstructions) {
        setManualInstructions(result.manualInstructions);
        setError(result.message || 'Manual activation required');
        setShowInstructions(true);
      } else {
        setError('Failed to activate hotspot: ' + result.error);
      }
      return false;
    }

    const ip = await desktopWiFiService.getHotspotIP();
    setHotspotIP(ip || DEFAULT_HOTSPOT_IP);
    
    // Determine backend URL based on mode
    const backendUrl = isDesktop 
      ? `http://${ip || DEFAULT_HOTSPOT_IP}:4000`
      : `http://${desktopBackendIP}:4000`;
    
    try {
      const portalResult = await desktopWiFiService.startRedirectServer(ip || DEFAULT_HOTSPOT_IP, backendUrl);
      const method = portalResult?.method;
      const proxied = portalResult?.proxied;
      // HTTP redirect is sufficient for captive portal functionality
      const hasRedirect = method === 'http' || method === 'dns+http' || method === 'dns+http+https' || method === 'dns+https';
      if (hasRedirect && proxied) {
        setCaptivePortalStatus('proxied');
        console.log('[HotspotManager] Captive portal fully active — phones will auto-popup');
      } else if (hasRedirect) {
        setCaptivePortalStatus('auto');
        console.warn('[HotspotManager] Captive portal servers running but portproxy missing — click Enable Auto-Popup');
      } else {
        setCaptivePortalStatus('manual');
        console.warn('[HotspotManager] Captive portal unavailable — HTTP redirect is required');
      }
    } catch (err) {
      setCaptivePortalStatus('manual');
      console.error('[HotspotManager] Failed to start redirect server:', err);
    }

    if (result.manualInstructions) {
      setManualInstructions(result.manualInstructions);
      setIsHotspotActive(true);
      setShowInstructions(true);
    } else {
      setIsHotspotActive(true);
      setShowInstructions(false);
    }

    if (result.password && hotspotConfig) {
      setHotspotConfig({ ...hotspotConfig, password: result.password });
    }

    if (hotspotConfig) {
      await mdnsService.broadcastService({
        name: 'MeshNet Emergency Network',
        port: 4000,
        txt: { 
          ssid: hotspotConfig.ssid, 
          password: hotspotConfig.password || '', 
          version: '1.0', 
          path: '/api/mesh/join',
          backend: backendUrl // Include backend URL in mDNS for discovery
        },
      });
    }
    return true;
  };

  // ── Extracted helper: register a single device as a mesh node ────────────────
  const registerDevice = async (device: { mac: string; ip: string }, meshSecret: string): Promise<void> => {
    const deviceId  = `device-${device.mac.replace(/-/g, '')}`;
    // Use ref so we always get the latest GPS fix, not a stale closure value
    const loc       = deviceLocationRef.current;
    const hasCoords = loc.lat != null && loc.lng != null;

    // Already registered with good coords → skip entirely
    if (registeredDevicesRef.current.has(deviceId)) return;
    // Registered without coords and GPS still unavailable → skip (no change to send)
    if (registeredNoGpsRef.current.has(deviceId) && !hasCoords) return;

    try {
      const response = await fetch(`${getApiBase()}/api/mesh/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mesh-Secret': meshSecret },
        body: JSON.stringify({
          id: deviceId,
          label: `Device ${device.mac.slice(-6)}`,
          name: `Hotspot Client ${device.ip}`,
          device: 'smartphone',
          role: 'peer',
          signal: 100,
          batteryPercentage: 100,
          bluetoothStatus: false,
          wifiStatus: true,
          os: null,
          lat: loc.lat,
          lng: loc.lng,
        }),
      });
      if (response.ok) {
        console.log(`[HotspotManager] Registered device ${deviceId} (${device.ip}) lat=${loc.lat} lng=${loc.lng}`);
        if (hasCoords) {
          registeredDevicesRef.current.add(deviceId);    // fully done
          registeredNoGpsRef.current.delete(deviceId);   // promote out of no-gps set
        } else {
          registeredNoGpsRef.current.add(deviceId);      // registered once, wait for GPS
        }
      } else {
        const errorText = await response.text();
        console.warn(`[HotspotManager] Failed to register device ${deviceId}:`, response.statusText, errorText);
      }
    } catch (err) {
      console.error(`[HotspotManager] Error registering device ${deviceId}:`, err);
    }
  };

  const checkElevatedPrivileges = async () => {
    try {
      const elevated = await desktopWiFiService.checkElevated();
      setIsElevated(elevated);
    } catch (error) {
      console.error('[HotspotManager] Elevated check failed:', error);
      setIsElevated(false);
    }
  };

  const scanNetworks = async () => {
    if (!isDesktop) return;
    
    setScanning(true);
    setError(null);
    
    try {
      const networks = await desktopWiFiService.scanNetworks();
      setAvailableNetworks(networks);
    } catch (error) {
      setError('Network scan failed: ' + (error as Error).message);
    } finally {
      setScanning(false);
    }
  };

  if (!isSupported && !isDesktop) {
    return (
      <div className="p-4 bg-gray-800 rounded-xl border border-red-600/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <h3 className="text-white font-semibold text-sm">WiFi Not Supported</h3>
        </div>
        <p className="text-gray-400 text-xs">WiFi Network Information API is not supported in this browser.</p>
      </div>
    );
  }

  const portalAuto = captivePortalStatus === 'proxied';
  const portalNeedsSetup = captivePortalStatus === 'auto' || captivePortalStatus === 'manual';

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-900 rounded-xl">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isHotspotActive ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-gray-500'}`} />
          <h3 className="text-white font-semibold text-sm">WiFi Hotspot</h3>
          {isDesktop && (
            <span className="px-1.5 py-0.5 bg-blue-600/80 text-blue-100 text-[10px] font-medium rounded">
              Desktop
            </span>
          )}
        </div>
        {isDesktop && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
            isElevated
              ? 'bg-green-500/15 border border-green-500/30 text-green-400'
              : 'bg-yellow-500/15 border border-yellow-500/30 text-yellow-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isElevated ? 'bg-green-400' : 'bg-yellow-400'}`} />
            {isElevated ? 'Admin' : 'Standard'}
          </div>
        )}
      </div>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <span className="text-red-400 text-sm flex-shrink-0">⚠</span>
          <p className="text-red-300 text-xs leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200 text-xs flex-shrink-0">✕</button>
        </div>
      )}

      {/* ── No-admin notice (only when not elevated, hotspot not yet active) ── */}
      {isDesktop && !isElevated && !isHotspotActive && (
        <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <span className="text-yellow-400 text-base flex-shrink-0">🔒</span>
          <div>
            <p className="text-yellow-300 text-xs font-semibold mb-0.5">Admin privileges recommended</p>
            <p className="text-yellow-400/70 text-[11px] leading-relaxed">
              For automatic captive portal popups on victim phones, run Electron as Administrator.
              You can still activate the hotspot — victims will need to open the URL manually.
            </p>
          </div>
        </div>
      )}

      {/* ── Manual activation instructions (desktop) ───────────── */}
      {manualInstructions && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-amber-300 text-xs font-semibold">Manual Activation Steps</p>
            <button onClick={() => setManualInstructions(null)} className="text-amber-400/60 hover:text-amber-300 text-xs">✕</button>
          </div>
          <ol className="text-amber-200/80 text-[11px] space-y-1 list-decimal list-inside leading-relaxed">
            {manualInstructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Emergency network info card ─────────────────────────── */}
      {hotspotConfig && (
        <div className="p-3 bg-gray-800 border border-gray-700 rounded-xl space-y-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Emergency Network</p>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Network name</span>
            <span className="text-white font-mono font-bold text-sm">{hotspotConfig.ssid}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Security</span>
            <span className="text-green-400 text-xs font-semibold">Open (no password)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Max connections</span>
            <span className="text-white text-xs">{hotspotConfig.maxConnections ?? '—'}</span>
          </div>
        </div>
      )}

      {/* ── Captive portal status (only when hotspot is active) ─── */}
      {isHotspotActive && hotspotIP && (
        <div className={`rounded-xl border p-3 space-y-2 ${
          portalAuto
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-orange-500/10 border-orange-500/30'
        }`}>
          {/* Status pill */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${portalAuto ? 'bg-green-400 animate-pulse' : 'bg-orange-400'}`} />
            <p className={`text-xs font-semibold ${portalAuto ? 'text-green-300' : 'text-orange-300'}`}>
              {captivePortalStatus === 'proxied' && 'Auto captive portal — active'}
              {captivePortalStatus === 'auto'    && 'Auto captive portal — setup needed'}
              {captivePortalStatus === 'manual'  && 'Manual mode — auto-popup unavailable'}
              {!captivePortalStatus              && 'Captive portal starting…'}
            </p>
          </div>

          {/* Explanation */}
          <p className="text-[11px] leading-relaxed text-gray-400">
            {portalAuto
              ? 'Phones that join MeshNet Wi-Fi will automatically receive a "Sign in to network" popup leading to the SOS page.'
              : 'Click Enable Auto-Popup and accept the UAC prompt so phones get the "Sign in to network" popup. Until then, victims must open the URL below manually.'}
          </p>

          {/* URL box */}
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <code className="text-green-400 font-mono text-xs flex-1 break-all">
              http://{hotspotIP}:4000/api/mesh/join
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(`http://${hotspotIP}:4000/api/mesh/join`)}
              className="text-gray-500 hover:text-gray-300 text-[10px] flex-shrink-0 transition-colors"
              title="Copy URL"
            >
              copy
            </button>
          </div>

          {/* Enable auto-popup button - always show so users can re-run setup if needed */}
          <button
            onClick={async () => {
              const eAPI = (globalThis as any).electronAPI;
              if (!eAPI?.setupCaptivePortal) return;
              const r = await eAPI.setupCaptivePortal(hotspotIP || DEFAULT_HOTSPOT_IP);
              if (r?.success) {
                setError(null);
                alert('Done! Deactivate and reactivate the hotspot — phones will now get the auto-popup.');
              } else {
                setError('Setup failed: ' + (r?.error ?? 'unknown'));
              }
            }}
            className="w-full py-2 text-[11px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            ⚡ Enable Auto-Popup — one-time UAC prompt
          </button>
        </div>
      )}

      {/* ── Connected devices count (active state) ─────────────── */}
      {isHotspotActive && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
          <span className="text-green-400 text-lg">📶</span>
          <div className="flex-1">
            <p className="text-green-300 text-xs font-semibold">Hotspot Active</p>
            <p className="text-green-400/70 text-[11px]">
              {connectedDevices === 0
                ? 'Waiting for devices to connect…'
                : `${connectedDevices} device${connectedDevices === 1 ? '' : 's'} connected`}
            </p>
          </div>
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        </div>
      )}

      {/* ── Network scanner (desktop only, collapsed by default) ── */}
      {isDesktop && (
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer p-2.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-colors list-none">
            <span className="text-gray-300 text-xs font-medium">Nearby Wi-Fi Networks</span>
            <div className="flex items-center gap-2">
              {availableNetworks.length > 0 && (
                <span className="text-gray-500 text-[10px]">{availableNetworks.length} found</span>
              )}
              <span className="text-gray-500 text-[10px] group-open:rotate-180 transition-transform">▾</span>
            </div>
          </summary>
          <div className="mt-1 p-2 bg-gray-800/50 border border-gray-700 border-t-0 rounded-b-lg space-y-2">
            <button
              onClick={scanNetworks}
              disabled={scanning}
              className="w-full py-1.5 text-xs font-medium rounded bg-blue-600/80 hover:bg-blue-600 disabled:bg-gray-600 text-white transition-colors"
            >
              {scanning ? 'Scanning…' : 'Scan Networks'}
            </button>
            {availableNetworks.length > 0 ? (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {availableNetworks.map((n: { ssid: string; security?: string; signal: number }) => (
                  <div key={n.ssid} className="flex items-center justify-between px-2 py-1.5 bg-gray-700/60 rounded">
                    <div>
                      <p className="text-white text-xs font-medium">{n.ssid}</p>
                      <p className="text-gray-500 text-[10px]">{n.security || 'Open'}</p>
                    </div>
                    <span className="text-gray-400 text-[10px]">{n.signal}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-[11px] text-center py-2">No networks found yet.</p>
            )}
          </div>
        </details>
      )}

      {/* ── Network Mode Selection (phone mode only) ── */}
      {!isDesktop && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-purple-300 text-xs font-semibold">Network Connection Mode</p>
            <span className="text-purple-400/60 text-[10px]">Phone Mode</span>
          </div>
          <p className="text-purple-200/70 text-[11px] mb-3">
            Choose how the phone connects to the desktop backend
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setNetworkMode('auto')}
              className={`w-full px-3 py-2 text-xs rounded-lg border transition-colors ${
                networkMode === 'auto'
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-750'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>🔄 Auto (Desktop on Phone Network)</span>
                {networkMode === 'auto' && <span className="text-purple-300">✓</span>}
              </div>
              <p className="text-[10px] text-left mt-1 opacity-70">
                Desktop connects to phone hotspot (192.168.43.x)
              </p>
            </button>
            <button
              onClick={() => setNetworkMode('manual')}
              className={`w-full px-3 py-2 text-xs rounded-lg border transition-colors ${
                networkMode === 'manual'
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-750'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>📡 Manual (Same Network)</span>
                {networkMode === 'manual' && <span className="text-purple-300">✓</span>}
              </div>
              <p className="text-[10px] text-left mt-1 opacity-70">
                Phone and desktop on same WiFi network
              </p>
            </button>
            <button
              onClick={() => setNetworkMode('bluetooth')}
              className={`w-full px-3 py-2 text-xs rounded-lg border transition-colors ${
                networkMode === 'bluetooth'
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-750'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>🔵 Bluetooth Tethering</span>
                {networkMode === 'bluetooth' && <span className="text-purple-300">✓</span>}
              </div>
              <p className="text-[10px] text-left mt-1 opacity-70">
                Desktop connects via Bluetooth (192.168.44.x)
              </p>
            </button>
          </div>
          
          {/* Manual IP input (only shown in manual mode) */}
          {networkMode === 'manual' && (
            <div className="mt-3 pt-3 border-t border-purple-500/30">
              <p className="text-purple-200/70 text-[11px] mb-2">
                Enter desktop backend IP address
              </p>
              <input
                type="text"
                value={desktopBackendIP}
                onChange={(e) => setDesktopBackendIP(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          )}
          
          <p className="text-purple-300/50 text-[10px] mt-3">
            {networkMode === 'auto' && 'Desktop must connect to phone hotspot first'}
            {networkMode === 'manual' && 'Ensure phone and desktop are on same network'}
            {networkMode === 'bluetooth' && 'Enable Bluetooth tethering on phone'}
          </p>
        </div>
      )}

      {/* ── Manual browser instructions (non-desktop) ──────────── */}
      {showInstructions && !isDesktop && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-blue-300 text-xs font-semibold">Manual Hotspot Setup</p>
            <button onClick={() => setShowInstructions(false)} className="text-blue-400/60 hover:text-blue-300 text-xs">✕</button>
          </div>
          <ol className="text-blue-200/70 text-[11px] space-y-1 list-decimal list-inside leading-relaxed mb-3">
            <li>Open device Settings</li>
            <li>Go to Network &amp; Internet → Hotspot &amp; Tethering</li>
            <li>Set hotspot name to something memorable</li>
            <li>Set security to None (open network)</li>
            <li>Enable Wi-Fi Hotspot</li>
            <li>Enter your hotspot name in the field above</li>
          </ol>
          <button
            onClick={() => {
              setIsHotspotActive(true);
              setShowInstructions(false);
            }}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            I've Enabled the Hotspot
          </button>
        </div>
      )}

      {/* ── Primary action button ───────────────────────────────── */}
      {!isHotspotActive ? (
        <button
          onClick={activateHotspot}
          disabled={activating}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
        >
          {activating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Activating…
            </span>
          ) : 'Activate Hotspot'}
        </button>
      ) : (
        <button
          onClick={deactivateHotspot}
          disabled={activating}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-red-600/80 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"
        >
          {activating ? 'Deactivating…' : 'Deactivate Hotspot'}
        </button>
      )}
    </div>
  );
}
