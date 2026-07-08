const http = require('node:http');

// Hotspot gateway IP — phones on the hotspot reach the backend at this address.
// Passed in from main.js via ipcMain when startRedirectServer is invoked.
const HOTSPOT_IP   = process.argv[2] || '192.168.137.1'; // NOSONAR
const REDIRECT_PORT = 80;
const JOIN_URL      = `http://${HOTSPOT_IP}:4000/api/mesh/join`;

// URLs that iOS, Android, and Windows use to detect a captive portal.
// Responding to these with a non-200 / redirect triggers the "Sign in to network"
// popup automatically — the victim never has to open a browser manually.
const CAPTIVE_PROBE_PATHS = new Set([
  '/generate_204',              // Android / Chrome
  '/gen_204',                   // Android fallback
  '/hotspot-detect.html',       // Apple iOS / macOS
  '/library/test/success.html', // Apple fallback
  '/ncsi.txt',                  // Windows NCSI
  '/connecttest.txt',           // Windows 10+
  '/redirect',                  // generic
  '/canonical.html',            // Firefox
]);

const server = http.createServer((req, res) => {
  console.log(`[CaptivePortal] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  // Android connectivity check — must return 204 with a Location header to
  // trigger the captive portal notification.
  if (req.url === '/generate_204' || req.url === '/gen_204') {
    res.writeHead(302, { Location: JOIN_URL });
    res.end();
    return;
  }

  // Apple captive portal check — must NOT return 200 "Success" to trigger popup.
  if (req.url === '/hotspot-detect.html' || req.url === '/library/test/success.html') {
    res.writeHead(302, { Location: JOIN_URL });
    res.end();
    return;
  }

  // Windows NCSI checks — redirect to trigger captive portal browser.
  if (req.url === '/ncsi.txt' || req.url === '/connecttest.txt') {
    res.writeHead(302, { Location: JOIN_URL });
    res.end();
    return;
  }

  // All other requests — redirect to the SOS join page.
  res.writeHead(302, {
    Location: JOIN_URL,
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${JOIN_URL}"></head>` +
    `<body><a href="${JOIN_URL}">Tap here to open MeshNet Emergency</a></body></html>`
  );
});

server.listen(REDIRECT_PORT, HOTSPOT_IP, () => {
  console.log(`[CaptivePortal] Listening on http://${HOTSPOT_IP}:${REDIRECT_PORT}`);
  console.log(`[CaptivePortal] All traffic -> ${JOIN_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[CaptivePortal] Port 80 already in use — run as Administrator.`);
  } else {
    console.error(`[CaptivePortal] Error: ${err.message}`);
  }
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
