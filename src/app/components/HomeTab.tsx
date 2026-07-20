import { useState } from "react";
import {
  AlertTriangle,
  Heart,
  Navigation,
  Users,
  Zap,
} from "lucide-react";
import type { CloudantNode } from "../hooks/useCloudantNodes";
import { MESSAGES, msgTypeStyle, msgTypeIcon } from "../constants";

export function HomeTab({ liveNodes }: { liveNodes: CloudantNode[] }) {
  const [sosActive, setSosActive] = useState(false);
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);

  const handleSOS = () => {
    if (sosActive) return;
    setSosCountdown(3);
    const id = setInterval(() => {
      setSosCountdown((c) => {
        if (c === null || c <= 1) {
          clearInterval(id);
          setSosActive(true);
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
  const stats = [
    { label: "Nodes", value: String(onlineNodes.length), sub: "online" },
    { label: "Signal", value: `${avgSignal}%`, sub: "avg" },
    { label: "Latency", value: "—", sub: "p95" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Network health */}
      <div className="rounded-xl border border-[rgba(91,141,217,0.2)] bg-[#132B5A] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span
              className="text-xs font-medium text-[#22C55E] uppercase tracking-widest"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Mesh Active
            </span>
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
          {MESSAGES.slice(0, 2).map((msg) => (
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
