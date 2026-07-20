
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
// Leaflet core CSS — must come before any Leaflet component is rendered
import "leaflet/dist/leaflet.css";

// Initialize device ID if not exists
if (!localStorage.getItem('meshnet_node_id')) {
  localStorage.setItem('meshnet_node_id', `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

  createRoot(document.getElementById("root")!).render(<App />);
  