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
  
  // Only mount React app after SQLite is successfully initialized
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
}).catch((error) => {
  console.error('[Main] Failed to initialize SQLite:', error);
  // SQLite is required - show error to user and prevent app from running
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 20px; text-align: center; font-family: system-ui, sans-serif;">
        <h1 style="color: #dc2626; margin-bottom: 16px;">Database Initialization Failed</h1>
        <p style="color: #374151; margin-bottom: 24px; max-width: 500px;">
          The app requires SQLite to function in standalone mode. Please ensure your device has sufficient storage and try again.
        </p>
        <p style="color: #6b7280; font-size: 14px; font-family: monospace;">Error: ${error instanceof Error ? error.message : String(error)}</p>
        <button onclick="window.location.reload()" style="margin-top: 24px; padding: 12px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
          Retry
        </button>
      </div>
    `;
  }
  // Don't throw error - we've shown the error screen
});
