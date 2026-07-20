import { useState, useCallback } from "react";
import {
  AlertTriangle,
  Heart,
  CheckCircle2,
  Zap,
  Shield,
  MapPin,
  Navigation,
  Send,
} from "lucide-react";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { encryptMessage } from "../hooks/useMeshCrypto";
import { API_BASE, meshHeaders, ALERT_TYPE_MAP, ALERT_MSG_CATEGORY, ALERT_LABEL } from "../constants";

export function AlertTab({ nodeCount }: { nodeCount: number }) {
  const [alertType, setAlertType] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const deviceLocation = useDeviceLocation();

  const handleSend = useCallback(async () => {
    if (!alertType || sending) return;
    setSending(true);

    const lat = deviceLocation.lat ?? undefined;
    const lng = deviceLocation.lng ?? undefined;

    const payload = {
      type:    ALERT_TYPE_MAP[alertType] ?? "sos",
      message: message.trim() || undefined,
      lat,
      lng,
    };

    let delivered = false;
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method:  "POST",
        headers: meshHeaders(),
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(6_000),
      });
      delivered = res.ok || res.status === 201;
    } catch {
      // Backend unreachable — queue for retry
    }

    if (delivered) {
      // Fan-out: broadcast an encrypted mesh message so every node's CommsTab receives it
      try {
        const label   = ALERT_LABEL[alertType] ?? alertType.toUpperCase();
        const gpsLine = lat != null && lng != null
          ? ` · GPS ${lat.toFixed(5)}°N ${lng.toFixed(5)}°E`
          : "";
        const details  = message.trim() ? ` · ${message.trim()}` : "";
        const plaintext = `${label}${details}${gpsLine}`;
        const ciphertext = await encryptMessage(plaintext);
        await fetch(`${API_BASE}/api/messages`, {
          method:  "POST",
          headers: meshHeaders(),
          body:    JSON.stringify({
            fromNodeId: localStorage.getItem("meshnet_node_id") ?? "self",
            fromLabel:  localStorage.getItem("meshnet_node_label") ?? "Node",
            toNodeId:   "broadcast",
            category:   ALERT_MSG_CATEGORY[alertType] ?? "alert",
            ciphertext,
            hops:       0,
          }),
          signal: AbortSignal.timeout(6_000),
        });
      } catch { /* non-fatal — alert already stored */ }
    } else {
      // Queue alert in localStorage for background retry
      const queue = JSON.parse(localStorage.getItem("meshnet_alert_queue") ?? "[]") as unknown[];
      queue.push({ ...payload, queuedAt: Date.now() });
      localStorage.setItem("meshnet_alert_queue", JSON.stringify(queue));
      setQueued(true);
    }

    setSending(false);
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setQueued(false);
      setAlertType(null);
      setMessage("");
    }, 3_000);
  }, [alertType, sending, message, deviceLocation]);

  const types = [
    { id: "sos", label: "SOS Alert", icon: <AlertTriangle size={22} />, color: "#EF4444", bg: "#EF4444" },
    { id: "medical", label: "Medical", icon: <Heart size={22} />, color: "#F97316", bg: "#F97316" },
    { id: "safe", label: "I am Safe", icon: <CheckCircle2 size={22} />, color: "#22C55E", bg: "#22C55E" },
    { id: "hazard", label: "Hazard", icon: <Zap size={22} />, color: "#FBBF24", bg: "#FBBF24" },
    { id: "supply", label: "Need Supplies", icon: <Shield size={22} />, color: "#5B8DD9", bg: "#5B8DD9" },
    { id: "locate", label: "Locate Me", icon: <MapPin size={22} />, color: "#22C55E", bg: "#22C55E" },
  ];

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 h-full min-h-[480px]">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${queued ? "bg-[#F97316]/20" : "bg-[#22C55E]/20"}`}>
          <CheckCircle2 size={40} className={queued ? "text-[#F97316]" : "text-[#22C55E]"} />
        </div>
        <div
          className={`text-3xl font-black tracking-widest uppercase ${queued ? "text-[#F97316]" : "text-[#22C55E]"}`}
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          {queued ? "Alert Queued" : "Alert Sent"}
        </div>
        <p className="text-sm text-[#7B9CC4] text-center">
          {queued
            ? "Backend unreachable — will retry automatically when connected"
            : `Broadcast to ${nodeCount} node${nodeCount !== 1 ? "s" : ""} · Relayed across mesh network`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2
          className="text-lg font-bold text-[#E8EEF7] uppercase tracking-widest"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Select Alert Type
        </h2>
        <p className="text-xs text-[#7B9CC4] mt-0.5">Will broadcast to all reachable nodes</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setAlertType(t.id)}
            className={`rounded-xl p-4 flex flex-col items-center gap-2 border-2 transition-all duration-150 active:scale-95 ${
              alertType === t.id
                ? "border-current bg-current/20 shadow-[0_0_20px_currentColor/30]"
                : "border-[rgba(91,141,217,0.15)] bg-[#132B5A]"
            }`}
            style={{ color: t.color } as React.CSSProperties}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${t.color}20` }}
            >
              {t.icon}
            </div>
            <span
              className="text-sm font-bold text-[#E8EEF7] text-center leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-3">
        <textarea
          className="w-full bg-transparent text-sm text-[#E8EEF7] placeholder-[#7B9CC4]/50 resize-none outline-none"
          rows={3}
          placeholder="Add details (optional) — location, number of people, severity..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.18)] p-3 flex items-center gap-3">
        <Navigation size={16} className={deviceLocation.status === "ok" ? "text-[#22C55E] shrink-0" : "text-[#7B9CC4] shrink-0"} />
        <div className="flex-1">
          {deviceLocation.status === "ok" && deviceLocation.lat !== null && deviceLocation.lng !== null ? (
            <div className="text-xs font-mono text-[#22C55E]">
              {Math.abs(deviceLocation.lat).toFixed(4)}° {deviceLocation.lat >= 0 ? "N" : "S"} · {Math.abs(deviceLocation.lng).toFixed(4)}° {deviceLocation.lng >= 0 ? "E" : "W"}
            </div>
          ) : (
            <div className="text-xs font-mono text-[#7B9CC4]">
              {deviceLocation.status === "acquiring" ? "Acquiring GPS…" : deviceLocation.error ?? "GPS unavailable"}
            </div>
          )}
          <div className="text-[10px] text-[#7B9CC4]">
            {deviceLocation.status === "ok" ? "GPS locked · Auto-attach to alert" : "Alert will send without coordinates"}
          </div>
        </div>
        {deviceLocation.status === "ok"
          ? <CheckCircle2 size={14} className="text-[#22C55E]" />
          : <Navigation size={14} className="text-[#7B9CC4] animate-pulse" />}
      </div>

      <button
        onClick={handleSend}
        disabled={!alertType || sending}
        className={`w-full rounded-xl py-4 flex items-center justify-center gap-2 font-bold text-white transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          alertType
            ? "bg-[#F97316] shadow-[0_0_20px_rgba(249,115,22,0.3)]"
            : "bg-[#132B5A] text-[#7B9CC4]"
        }`}
        style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: "1.125rem", letterSpacing: "0.1em" }}
      >
        <Send size={18} className={sending ? "animate-pulse" : ""} />
        {sending ? "SENDING…" : "BROADCAST ALERT"}
      </button>
    </div>
  );
}
