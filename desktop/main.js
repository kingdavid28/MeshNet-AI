const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const WiFiModule = require('./wifi-module/index');

const execAsync = promisify(exec);

let mainWindow;
let redirectServer = null;

const isDev = !app.isPackaged;

// ── Content-Security-Policy ───────────────────────────────────────────────────
// In dev:  allow unsafe-eval + unsafe-inline so Vite HMR and React Fast Refresh work.
// In prod: strict policy — no inline scripts, no eval, only local + OSM tiles.
// Hotspot gateway IPs — the backend only runs on the gateway (.1) of each subnet.
// CSP does not support wildcard IP octets; exact hosts must be listed.
const HOTSPOT_ORIGINS = [
  'http://192.168.137.1:*',  // Windows Mobile Hotspot gateway
  'http://192.168.42.1:*',   // Android hotspot gateway
  'http://10.42.0.1:*',      // Linux (NetworkManager) hotspot gateway
].join(' ');

const DEV_CSP = [
  "default-src 'self' http://localhost:* ws://localhost:*",
  "script-src  'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src   'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src    'self' https://fonts.gstatic.com",
  "img-src     'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org",
  `connect-src 'self' http://localhost:* ws://localhost:* https://tile.openstreetmap.org ${HOTSPOT_ORIGINS}`,
].join('; ');

const PROD_CSP = [
  "default-src 'self'",
  "script-src  'self'",
  "style-src   'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src    'self' https://fonts.gstatic.com",
  "img-src     'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org",
  `connect-src 'self' http://localhost:* ws://localhost:* https://tile.openstreetmap.org ${HOTSPOT_ORIGINS}`,
].join('; ');

function createWindow() {
  // Inject CSP response header for every request in this session
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? DEV_CSP : PROD_CSP],
      },
    });
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Block navigations to external origins (defence-in-depth)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = ['http://localhost:5173', 'http://localhost:4000'];
    if (!allowed.some((base) => url.startsWith(base))) {
      event.preventDefault();
    }
  });

  // Load the existing web app
  mainWindow.loadURL('http://localhost:5173');

  // Open DevTools only in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// WiFi scanning IPC handler
ipcMain.handle('wifi-scan', async () => {
  try {
    const networks = await WiFiModule.scanNetworks();
    return { success: true, networks };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Connected devices count IPC handler
ipcMain.handle('wifi-connected-devices', async () => {
  try {
    const count = await WiFiModule.getConnectedDevicesCount();
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Connected devices list IPC handler (returns device details)
ipcMain.handle('wifi-connected-devices-list', async () => {
  try {
    const devices = await WiFiModule.getConnectedDevices();
    return { success: true, devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// mDNS broadcast IPC handler
ipcMain.handle('mdns-broadcast', async (event, config) => {
  try {
    const result = await WiFiModule.broadcastMDNSService(config);
    return { success: true, result };
  } catch (error) {
    console.error('mDNS broadcast error:', error);
    return { success: false, error: error.message };
  }
});

// mDNS stop IPC handler
ipcMain.handle('mdns-stop', async () => {
  try {
    WiFiModule.stopMDNSService();
    return { success: true };
  } catch (error) {
    console.error('mDNS stop error:', error);
    return { success: false, error: error.message };
  }
});

// WiFi hotspot creation IPC handler
ipcMain.handle('wifi-create-hotspot', async (event, config) => {
  try {
    console.log('IPC received config:', config);
    const result = await WiFiModule.createHotspot(config);
    console.log('IPC result:', result);
    return { success: true, result };
  } catch (error) {
    console.error('IPC error:', error);
    return { success: false, error: error.message };
  }
});

// WiFi hotspot deactivation IPC handler
ipcMain.handle('wifi-stop-hotspot', async () => {
  try {
    const result = await WiFiModule.stopHotspot();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get hotspot IP address
ipcMain.handle('wifi-get-hotspot-ip', async () => {
  try {
    const ip = await WiFiModule.getHotspotIP();
    return { success: true, ip };
  } catch (error) {
    console.error('Get hotspot IP error:', error);
    return { success: false, error: error.message };
  }
});

// ── Device GPS via Windows Location API ──────────────────────────────────────
// Chromium's navigator.geolocation in Electron relies on Google's network
// location provider which returns 403 with no API key → GPS always fails.
// This IPC handler uses PowerShell's WinRT Geolocation API directly, which
// reads from the Windows Location Service (GPS / Wi-Fi / cell triangulation).
ipcMain.handle('get-location', () => new Promise((resolve) => {
  const ps = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
try {
  $loc = [Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime]::new()
  $loc.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
  $geo = Await ($loc.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition,Windows.Devices.Geolocation,ContentType=WindowsRuntime])
  $c = $geo.Coordinate.Point.Position
  Write-Output ($c.Latitude.ToString() + ',' + $c.Longitude.ToString() + ',' + $geo.Coordinate.Accuracy.ToString())
} catch { Write-Output ('ERROR:' + $_.ToString()) }
`.trim();

  const child = require('node:child_process').spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );

  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.on('close', () => {
    const line = out.trim();
    const parts = line.split(',');
    if (parts.length >= 2) {
      const lat = Number.parseFloat(parts[0]);
      const lng = Number.parseFloat(parts[1]);
      const acc = parts[2] ? Number.parseFloat(parts[2]) : null;
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        resolve({ success: true, lat, lng, accuracy: acc });
        return;
      }
    }
    resolve({ success: false, error: line || 'No location available' });
  });
  child.on('error', (err) => resolve({ success: false, error: err.message }));
}));

// Check if running with elevated privileges
ipcMain.handle('check-elevated', async () => {
  try {
    const isElevated = await WiFiModule.checkElevated();
    return { success: true, isElevated };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ── Captive-portal: DNS hijack + portproxy redirect ──────────────────────────
//
// Confirmed root cause (live-tested):
//   • Windows ICS (iphlpsvc/svchost PID 5728) owns 192.168.137.1:80 TCP.
//     It RESETS all connections on unknown paths — phones get no redirect.
//   • ICS DNS proxy owns 0.0.0.0:53 UDP but Windows uses the more-specific
//     192.168.137.1:53 binding first for packets on the hotspot interface.
//
// Confirmed working solution (live-tested with curl):
//
//   Tier 1 — DNS hijack on 192.168.137.1:53
//     All DNS A-queries resolve to 192.168.137.1.
//     Confirmed: nslookup connectivitycheck.gstatic.com 192.168.137.1 → 192.168.137.1
//
//   Tier 2 — Redirect server on port 8080 + portproxy 80→8080
//     portproxy operates at kernel (WFP) level — packets forwarded BEFORE
//     iphlpsvc userspace socket can reset them.
//     Confirmed: curl http://192.168.137.1:80/generate_204 → HTTP 302 ✓
//
//   Full phone flow:
//     DNS query → 192.168.137.1
//     GET /generate_204 → port 80 → portproxy → port 8080 (our server)
//     Our server → 302 → http://192.168.137.1:4000/api/mesh/join
//     Phone OS detects non-204 → "Sign in to network" popup
//     Victim taps → SOS page opens

const { createDNSServer } = require('./dns-captive');

let dnsServer = null;

function tryListen(server, port, addr) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, addr, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function tryDNSListen(server, port, addr) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.bind(port, addr, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function redirectBody(url) {
  return `<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=${url}">
<title>MeshNet Emergency</title>
</head>
<body><a href="${url}">Tap here to open MeshNet Emergency</a></body></html>`;
}

function makeProbeHandler(joinUrl) {
  return (req, res) => {
    console.log(`[CaptivePortal] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
    const body = redirectBody(joinUrl);
    res.writeHead(302, {
      Location: joinUrl,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };
}

async function checkPortproxy(hotspotIP) {
  try {
    const { stdout } = await execAsync('netsh interface portproxy show v4tov4');
    return stdout.includes(hotspotIP) && stdout.includes('80') && stdout.includes('8080');
  } catch {
    return false;
  }
}

async function startDNSHijack(ip) {
  const dns = createDNSServer(ip);
  try {
    await tryDNSListen(dns, 53, ip);
    dnsServer = dns;
    console.log(`[CaptivePortal] DNS hijack on ${ip}:53`);
    return true;
  } catch (error_) {
    console.warn('[CaptivePortal] DNS bind failed:', error_.code);
    return false;
  }
}

async function startHTTPRedirect(joinUrl) {
  const server = http.createServer(makeProbeHandler(joinUrl));
  try {
    await tryListen(server, 8080, '0.0.0.0');
    redirectServer = server;
    console.log(`[CaptivePortal] HTTP server on 0.0.0.0:8080 -> ${joinUrl}`);
    return true;
  } catch (error_) {
    console.warn('[CaptivePortal] Port 8080 bind failed:', error_.code);
    return false;
  }
}

function portalMethod(dnsActive, httpActive) {
  if (dnsActive && httpActive) return 'dns+http';
  if (dnsActive) return 'dns';
  if (httpActive) return 'http';
  return 'manual';
}

ipcMain.handle('start-redirect-server', async (event, hotspotIP) => {
  try {
    const ip      = hotspotIP || '192.168.137.1'; // NOSONAR
    const joinUrl = `http://${ip}:4000/api/mesh/join`;

    if (dnsServer)      { dnsServer.close();      dnsServer      = null; }
    if (redirectServer) { redirectServer.close();  redirectServer = null; }

    const dnsActive  = await startDNSHijack(ip);
    const httpActive = await startHTTPRedirect(joinUrl);
    const proxied    = httpActive ? await checkPortproxy(ip) : false;

    const method = portalMethod(dnsActive, httpActive);
    if (method !== 'manual') {
      return {
        success: true,
        method,
        port: httpActive ? 8080 : null,
        proxied,
        manualUrl: proxied ? null : joinUrl,
        warning: proxied ? null : 'Click "Enable Auto-Popup" to run the one-time setup.',
      };
    }

    return {
      success: true,
      method: 'manual',
      port: null,
      proxied: false,
      manualUrl: joinUrl,
      warning: 'Click "Enable Auto-Popup" to run the one-time setup.',
    };
  } catch (error) {
    console.error('[CaptivePortal] Unexpected error:', error);
    return { success: false, error: error.message };
  }
});

// Stop captive portal servers
async function stopRedirectServer() {
  if (dnsServer) {
    dnsServer.close();
    dnsServer = null;
    console.log('[CaptivePortal] DNS server stopped');
  }
  if (redirectServer) {
    await new Promise((resolve) => {
      redirectServer.close(() => { redirectServer = null; resolve(); });
    });
    console.log('[CaptivePortal] HTTP server stopped');
  }
}

// One-time elevated setup:
//   1. netsh portproxy 80→8080   — kernel-level forwarding past ICS
//   2. Firewall rules for UDP 53, TCP 8080, TCP 4000
ipcMain.handle('setup-captive-portal', async (event, hotspotIP) => {
  const ip = hotspotIP || '192.168.137.1'; // NOSONAR
  // Delete any stale rules first so re-running the setup never fails on
  // "entry already exists" errors. Use parentheses to keep cmd chaining robust.
  const cmds = [
    `netsh interface portproxy delete v4tov4 listenaddress=${ip} listenport=80`,
    `netsh interface portproxy add v4tov4 listenaddress=${ip} listenport=80 connectaddress=${ip} connectport=8080`,
    `netsh advfirewall firewall delete rule name="MeshNet DNS"`,
    `netsh advfirewall firewall add rule name="MeshNet DNS"  dir=in action=allow protocol=UDP localport=53`,
    `netsh advfirewall firewall delete rule name="MeshNet HTTP"`,
    `netsh advfirewall firewall add rule name="MeshNet HTTP" dir=in action=allow protocol=TCP localport=8080`,
    `netsh advfirewall firewall delete rule name="MeshNet API"`,
    `netsh advfirewall firewall add rule name="MeshNet API"  dir=in action=allow protocol=TCP localport=4000`,
  ].join(' & ');
  const escaped = cmds.replaceAll('"', String.raw`\"`);

  return new Promise((resolve) => {
    const ps = require('node:child_process').spawn('powershell.exe', [
      '-NoProfile', '-Command',
      `Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c ${escaped}'`,
    ], { stdio: 'ignore' });
    ps.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Portproxy and firewall rules added. Reactivate the hotspot.' });
      } else {
        resolve({ success: false, error: 'UAC prompt cancelled or setup failed.' });
      }
    });
    ps.on('error', (err) => resolve({ success: false, error: err.message }));
  });
});

ipcMain.handle('stop-redirect-server', async () => {
  try {
    await stopRedirectServer();
    return { success: true, message: 'Redirect server stopped' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Cleanup on app quit
app.on('before-quit', async () => {
  await stopRedirectServer();
});
