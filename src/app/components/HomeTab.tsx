import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Heart,
  Navigation,
  Users,
  Zap,
} from "lucide-react";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { encryptMessage } from "../hooks/useMeshCrypto";
import { MESSAGES, msgTypeStyle, msgTypeIcon, API_BASE, meshHeaders, ALERT_MSG_CATEGORY } from "../constants";
import type { LocalMessage } from "../types";

export function HomeTab({
  liveNodes,
  sendMeshMessage,
}: {
  liveNodes: CloudantNode[];
  sendMeshMessage?: (
    destination: string,
    message: any,
    priority: "emergency" | "high" | "normal" | "low"
  ) => Promise<string | null>;
}) {
  const [sosActive, setSosActive] = useState(false);
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const deviceLocation = useDeviceLocation();
  const [recentActivity, setRecentActivity] = useState<LocalMessage[]>(() => {
    try {
      const stored = localStorage.getItem("meshnet_home_recent");
      if (stored) return (JSON.parse(stored) as LocalMessage[]).slice(0, 5);
    } catch { /* ignore */ }
    return MESSAGES.slice(0, 2) as LocalMessage[];
  });

  useEffect(() => {
    try {
      localStorage.setItem("meshnet_home_recent", JSON.stringify(recentActivity.slice(0, 5)));
    } catch { /* ignore */ }
  }, [recentActivity]);

  const broadcastSOS = useCallback(async () => {
    const lat = deviceLocation.lat ?? undefined;
    const lng = deviceLocation.lng ?? undefined;

    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const time = `${hh}:${mm}`;

    const payload = { type: "sos", message: "SOS broadcast from home tab", lat, lng };
    let delivered = false;
    let errorMessage = "";

    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: "POST",
        headers: meshHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      delivered = res.ok || res.status === 201;
      if (!delivered) {
        const text = await res.text().catch(() => "");
        errorMessage = `Server returned ${res.status}${text ? `: ${text}` : ""}`;
      }
    } catch (error) {
      console.error("[HomeTab] SOS backend error:", error);
      errorMessage = error instanceof Error ? error.message : "Network error";
    }

    let sentVia: "backend" | "mesh" | "offline" = "offline";

    if (delivered) {
      sentVia = "backend";
      try {
        const gpsLine = lat != null && lng != null
          ? ` · GPS ${lat.toFixed(5)}°N ${lng.toFixed(5)}°E`
          : "";
        const plaintext = `SOS ALERT broadcast${gpsLine}`;
        const ciphertext = await encryptMessage(plaintext);
        await fetch(`${API_BASE}/api/messages`, {
          method: "POST",
          headers: meshHeaders(),
          body: JSON.stringify({
            fromNodeId: localStorage.getItem("meshnet_node_id") ?? "self",
            fromLabel: "You",
            toNodeId: "broadcast",
            category: ALERT_MSG_CATEGORY["sos"] ?? "alert",
            ciphertext,
            hops: 0,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        console.error("[HomeTab] SOS backend mesh broadcast failed:", error);
      }
    } else if (sendMeshMessage) {
      try {
        const meshId = await sendMeshMessage("broadcast", { ...payload, timestamp: Date.now() }, "emergency");
        if (meshId) {
          sentVia = "mesh";
          console.warn("[HomeTab] SOS broadcast via mesh:", meshId);
        } else {
          console.warn("[HomeTab] SOS mesh broadcast not delivered");
        }
      } catch (error) {
        console.error("[HomeTab] SOS mesh broadcast failed:", error);
      }
    }

    if (sentVia === "offline") {
      const queue = JSON.parse(localStorage.getItem("meshnet_alert_queue") ?? "[]") as unknown[];
      queue.push({ ...payload, queuedAt: Date.now(), error: errorMessage });
      localStorage.setItem("meshnet_alert_queue", JSON.stringify(queue));
    }

    const gpsLine = lat != null && lng != null
      ? ` · GPS ${lat.toFixed(5)}°N ${lng.toFixed(5)}°E`
      : "";
    const text =
      sentVia === "backend"
        ? `SOS ALERT broadcast${gpsLine}`
        : sentVia === "mesh"
        ? `SOS ALERT broadcast via mesh${gpsLine}`
        : `SOS ALERT queued (offline)${gpsLine}`;

    setRecentActivity((prev) => [
      { id: `sos-${Date.now()}`, from: "You", text, time, type: "alert", read: true },
      ...prev,
    ].slice(0, 5));
  }, [deviceLocation, sendMeshMessage]);

  const handleSOS = () => {
    if (sosActive || sosCountdown !== null) return;
    setSosCountdown(3);
    const id = setInterval(() => {
      setSosCountdown((c) => {
        if (c === null || c <= 1) {
          clearInterval(id);
          setSosActive(true);
          broadcastSOS();
          setTimeout(() => setSosActive(false), 5000);
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onlineNodes = liveNodes.filter((n) => n.signal > 0);
  const avgSignal = onlineNodes.length > 0
    ? Math.round(onlineNodes.reduce((s, n) => s + n.signal, 0) / onlineNodes.length)
    : 0;
  const isMeshActive = onlineNodes.length > 0;
  const stats = [
    { label: "Nodes", value: String(onlineNodes.length), sub: "online" },
    { label: "Signal", value: isMeshActive ? `${avgSignal}%` : "—", sub: "avg" },
    { label: "Latency", value: "—", sub: "p95" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Network health */}
      <div className="rounded-xl border border-[rgba(91,141,217,0.2)] bg-[#132B5A] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isMeshActive ? 'bg-[#22C55E] animate-pulse' : 'bg-[#4B5563]'}`} />
          </div>
          <span className="text-xs font-mono text-[#7B9CC4]">{onlineNodes.length} nodes online</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-[#0B1D3A]/60 px-3 py-2 text-center">
              <div
                className="text-xl font-bold text-[#E8EEF7] leading-none"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                {s.value}
              </div>
              <div className="text-[10px] text-[#7B9CC4] mt-0.5 uppercase tracking-wide">{s.sub}</div>
              <div className="text-[9px] text-[#7B9CC4]/60 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SOS Button */}
      <button
        onClick={handleSOS}
        className={`relative w-full rounded-2xl py-6 flex flex-col items-center gap-1 transition-all duration-200 active:scale-95 ${
          sosActive
            ? "bg-[#EF4444] shadow-[0_0_40px_rgba(239,68,68,0.6)]"
            : sosCountdown !== null
            ? "bg-[#F97316]/80"
            : "bg-[#F97316] shadow-[0_0_24px_rgba(249,115,22,0.35)]"
        }`}
      >
        <AlertTriangle size={32} strokeWidth={2.5} className="text-white" />
        <span
          className="text-2xl font-black text-white tracking-widest uppercase"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          {sosActive
            ? "SOS BROADCASTING"
            : sosCountdown !== null
            ? `SENDING IN ${sosCountdown}...`
            : "SOS ALERT"}
        </span>
        <span className="text-xs text-white/70 font-medium">Hold to broadcast emergency</span>
        {sosActive && (
          <div className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping" />
        )}
      </button>

      {/* Action grid */}
      <div className="grid grid-cols-2 gap-3">
        <button className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4 flex flex-col items-start gap-3 active:bg-[#1A3870] transition-colors">
          <div className="w-10 h-10 rounded-lg bg-[#F97316]/15 flex items-center justify-center">
            <Heart size={20} className="text-[#F97316]" />
          </div>
          <div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Medical
            </div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Request
            </div>
            <div className="text-[10px] text-[#7B9CC4] mt-1">Flag medical need</div>
          </div>
        </button>

        <button className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4 flex flex-col items-start gap-3 active:bg-[#1A3870] transition-colors">
          <div className="w-10 h-10 rounded-lg bg-[#22C55E]/15 flex items-center justify-center">
            <Navigation size={20} className="text-[#22C55E]" />
          </div>
          <div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Share
            </div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              GPS
            </div>
            <div className="text-[10px] text-[#7B9CC4] mt-1">Broadcast position</div>
          </div>
        </button>

        <button className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4 flex flex-col items-start gap-3 active:bg-[#1A3870] transition-colors">
          <div className="w-10 h-10 rounded-lg bg-[#5B8DD9]/15 flex items-center justify-center">
            <Users size={20} className="text-[#5B8DD9]" />
          </div>
          <div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              All Clear
            </div>
            <div className="text-[10px] text-[#7B9CC4] mt-1">Signal safe status</div>
          </div>
        </button>

        <button className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4 flex flex-col items-start gap-3 active:bg-[#1A3870] transition-colors">
          <div className="w-10 h-10 rounded-lg bg-[#22C55E]/15 flex items-center justify-center">
            <Zap size={20} className="text-[#22C55E]" />
          </div>
          <div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Relay
            </div>
            <div
              className="text-base font-bold text-[#E8EEF7] leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Mode
            </div>
            <div className="text-[10px] text-[#7B9CC4] mt-1">Boost network range</div>
          </div>
        </button>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-sm font-bold text-[#7B9CC4] uppercase tracking-widest"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Recent Activity
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {recentActivity.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg border-l-2 px-3 py-2.5 flex items-start gap-2 ${msgTypeStyle[msg.type]}`}
            >
              <span className="mt-0.5">{msgTypeIcon[msg.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold text-[#E8EEF7]">{msg.from}</span>
                  {!msg.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                  )}
                </div>
                <p className="text-xs text-[#7B9CC4] truncate">{msg.text}</p>
              </div>
              <span className="text-[10px] font-mono text-[#7B9CC4]/60 shrink-0">{msg.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
