
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
// Leaflet core CSS — must come before any Leaflet component is rendered
import "leaflet/dist/leaflet.css";

// Initialize mesh secret in localStorage for backend authentication
if (!localStorage.getItem('mesh-secret')) {
  localStorage.setItem('mesh-secret', '6D86BF911C7251206107275D23BB3F993542A0B86BAAC510AEF80B4C554143E876BBEC724AF568F832E321D10175445DFABDEAFA7BAE96AD14B0F749C843469C');
}

// Initialize device ID if not exists
if (!localStorage.getItem('meshnet_node_id')) {
  localStorage.setItem('meshnet_node_id', `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

  createRoot(document.getElementById("root")!).render(<App />);
  