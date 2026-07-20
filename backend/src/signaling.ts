import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";

interface ClientMeta {
  deviceId: string;
}

const clients = new Map<string, WebSocket>();
const meta = new WeakMap<WebSocket, ClientMeta>();

function getSecretFromReq(req: IncomingMessage): string | null {
  // The browser WebSocket constructor cannot set custom headers, so we accept
  // the shared secret as a query parameter. Native clients may use the header.
  const headerSecret = req.headers["x-mesh-secret"];
  const secret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
  if (secret) return secret;

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return url.searchParams.get("secret");
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: unknown, exceptDeviceId?: string): void {
  for (const [deviceId, ws] of clients) {
    if (exceptDeviceId && deviceId === exceptDeviceId) continue;
    send(ws, msg);
  }
}

function registerClient(ws: WebSocket, deviceId: string): void {
  const existing = meta.get(ws);
  if (existing && existing.deviceId !== deviceId) {
    clients.delete(existing.deviceId);
  }
  meta.set(ws, { deviceId });
  clients.set(deviceId, ws);

  // Tell the newcomer about peers already connected to signaling
  for (const [peerId] of clients) {
    if (peerId !== deviceId) {
      send(ws, { type: "device-registered", deviceId: peerId });
    }
  }

  // Tell existing peers about the newcomer
  broadcast({ type: "device-registered", deviceId }, deviceId);
}

export function setupSignalingServer(server: import("http").Server): void {
  const MESH_SECRET = process.env.MESH_SECRET;
  if (!MESH_SECRET) {
    throw new Error("[signaling] MESH_SECRET env var is not set");
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/signaling")) return;

    const secret = getSecretFromReq(req);
    if (secret !== MESH_SECRET) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    ws.on("message", (raw: RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      const m = meta.get(ws);
      const senderId = m?.deviceId;

      if (msg.type === "register") {
        const deviceId = typeof msg.deviceId === "string" ? msg.deviceId : senderId;
        if (!deviceId) {
          send(ws, { type: "error", message: "deviceId is required" });
          return;
        }
        // Acknowledge the registering client first, then tell it about peers and broadcast the new peer.
        send(ws, { type: "device-registered", deviceId });
        registerClient(ws, deviceId);
        return;
      }

      if (!senderId) {
        send(ws, { type: "error", message: "Register before sending signaling data" });
        return;
      }

      const targetId = typeof msg.deviceId === "string" ? msg.deviceId : undefined;
      if (!targetId) {
        send(ws, { type: "error", message: "deviceId (target) is required" });
        return;
      }

      const target = clients.get(targetId);
      if (!target || target.readyState !== WebSocket.OPEN) {
        send(ws, { type: "error", message: `Peer ${targetId} is not connected` });
        return;
      }

      const type = msg.type;
      if (type === "offer" || type === "answer" || type === "ice-candidate") {
        // Relay to the target with the sender's deviceId
        send(target, { ...msg, deviceId: senderId });
        return;
      }

      send(ws, { type: "error", message: `Unknown message type: ${String(type)}` });
    });

    ws.on("close", () => {
      const m = meta.get(ws);
      if (m) {
        clients.delete(m.deviceId);
        meta.delete(ws);
        broadcast({ type: "device-disconnected", deviceId: m.deviceId }, m.deviceId);
      }
    });

    ws.on("error", (err) => {
      console.error("[signaling] WebSocket error:", err.message);
    });
  });

  console.log("[signaling] WebSocket signaling server mounted at /signaling");
}
