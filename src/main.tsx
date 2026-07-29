console.log('[Main] Script loading - main.tsx executing');

import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getSQLiteService } from "./services/sqliteService";
import "./styles/index.css";
// Leaflet core CSS — must come before any Leaflet component is rendered
import "leaflet/dist/leaflet.css";

console.log('[Main] Imports loaded successfully');

// Initialize device ID if not exists
// Pseudorandom number generator is acceptable here for generating device IDs
// (not security-sensitive, only used for local identification)
try {
  console.log('[Main] Initializing device ID...');
  if (!localStorage.getItem('meshnet_node_id')) {
    localStorage.setItem('meshnet_node_id', `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }
  console.log('[Main] Device ID initialized:', localStorage.getItem('meshnet_node_id'));
} catch (error) {
  console.error('[Main] Failed to initialize device ID:', error);
}

// Initialize SQLite database for offline mode
console.log('[Main] Initializing SQLite service...');
const sqliteService = getSQLiteService();
sqliteService.initialize().then(() => {
  console.log('[Main] SQLite service initialized');
  localStorage.setItem('meshnet_backend_mode', 'offline');
}).catch((error) => {
  console.error('[Main] Failed to initialize SQLite:', error);
  console.log('[Main] App will continue without SQLite persistence');
});

console.log('[Main] Mounting React app...');
const rootElement = document.getElementById("root");
console.log('[Main] Root element found:', rootElement);

if (!rootElement) {
  console.error('[Main] ERROR: Root element not found!');
} else {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    console.log('[Main] React app mounted successfully');
  } catch (error) {
    console.error('[Main] ERROR: Failed to mount React app:', error);
  }
}
  