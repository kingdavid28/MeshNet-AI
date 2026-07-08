const http = require('node:http');

// Hotspot gateway IP — phones on the hotspot reach the backend at this address.
// Passed in from main.js via ipcMain when startRedirectServer is invoked.
const HOTSPOT_IP   = process.argv[2] || '192.168.137.1'; // NOSONAR
// Windows ICS (iphlpsvc) owns the hotspot IP on port 80 and resets unknown
// connections. We therefore bind on port 8080 and rely on the kernel-level
// portproxy rule 192.168.137.1:80 -> 192.168.137.1:8080 (set up via the
// "Enable Auto-Popup" / setup-captive-portal IPC in the Electron app).
const REDIRECT_PORT = 8080;
const LISTEN_ADDR   = '0.0.0.0';
const JOIN_URL      = `http://${HOTSPOT_IP}:4000/api/mesh/join`;

function redirectBody(url) {
  return `<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=${url}">
<title>MeshNet Emergency</title>
</head>
<body>
<a href="${url}">Tap here to open MeshNet Emergency</a>
</body></html>`;
}

function sendRedirect(res, url) {
  const body = redirectBody(url);
  res.writeHead(302, {
    Location: url,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  console.log(`[CaptivePortal] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  sendRedirect(res, JOIN_URL);
});

server.listen(REDIRECT_PORT, LISTEN_ADDR, () => {
  console.log(`[CaptivePortal] Listening on http://${LISTEN_ADDR}:${REDIRECT_PORT}`);
  console.log(`[CaptivePortal] Requires portproxy ${HOTSPOT_IP}:80 -> ${HOTSPOT_IP}:${REDIRECT_PORT}`);
  console.log(`[CaptivePortal] All traffic -> ${JOIN_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[CaptivePortal] Port ${REDIRECT_PORT} already in use.`);
  } else {
    console.error(`[CaptivePortal] Error: ${err.message}`);
  }
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
