import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Clock } from "lucide-react";
import { encryptMessage, decryptMessage } from "../hooks/useMeshCrypto";
import { API_BASE, meshHeaders, ALERT_LABEL, ALERT_MSG_CATEGORY, msgTypeStyle, msgTypeIcon } from "../constants";
import type { LocalMessage } from "../types";

export function CommsTab() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<LocalMessage[]>([]);
  const [sending, setSending] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  // Poll backend for incoming messages every 5 s and decrypt them
  useEffect(() => {
    const nodeId = localStorage.getItem("meshnet_node_id") ?? "";

    async function fetchIncoming() {
      const incoming: LocalMessage[] = [];

      // 1. Poll encrypted mesh messages
      try {
        const url = nodeId
          ? `${API_BASE}/api/messages?nodeId=${encodeURIComponent(nodeId)}`
          : `${API_BASE}/api/messages`;
        const res = await fetch(url, {
          headers: meshHeaders(),
          signal: AbortSignal.timeout(6_000),
        });
        if (res.ok) {
          const data = (await res.json()) as Array<{
            id: string; fromLabel: string; ciphertext: string;
            category: string; createdAt: string; fromNodeId: string;
          }>;
          for (const item of data) {
            if (seenIds.current.has(item.id)) continue;
            seenIds.current.add(item.id);
            const plain = await decryptMessage(item.ciphertext);
            const d = new Date(item.createdAt);
            incoming.push({
              id:   item.id,
              from: item.fromLabel || item.fromNodeId,
              text: plain ?? "[encrypted]",
              time: `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`,
              type: (item.category as LocalMessage["type"]) ?? "info",
              read: false,
            });
          }
        }
      } catch { /* offline */ }

      // 2. Poll alerts — surfaces SOS / medical requests from all nodes
      try {
        const aRes = await fetch(`${API_BASE}/api/alerts`, {
          headers: meshHeaders(),
          signal: AbortSignal.timeout(6_000),
        });
        if (aRes.ok) {
          const alerts = (await aRes.json()) as Array<{
            id: string; type: string; fromLabel: string; fromNodeId: string;
            message?: string; lat?: number; lng?: number;
            createdAt: string; acknowledged: boolean;
          }>;
          for (const a of alerts) {
            const msgId = `alert-${a.id}`;
            if (seenIds.current.has(msgId)) continue;
            seenIds.current.add(msgId);
            const label = ALERT_LABEL[a.type] ?? a.type.toUpperCase();
            const gpsLine = a.lat != null && a.lng != null
              ? ` · GPS ${a.lat.toFixed(5)}°N ${a.lng.toFixed(5)}°E`
              : "";
            const details = a.message ? ` · ${a.message}` : "";
            const d = new Date(a.createdAt);
            incoming.push({
              id:   msgId,
              from: a.fromLabel || a.fromNodeId,
              text: `${label}${details}${gpsLine}`,
              time: `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`,
              type: (ALERT_MSG_CATEGORY[a.type] as LocalMessage["type"]) ?? "alert",
              read: a.acknowledged,
            });
          }
        }
      } catch { /* offline */ }

      if (incoming.length > 0) {
        incoming.sort((x, y) => x.time.localeCompare(y.time));
        setMsgs((prev) => [...incoming.reverse(), ...prev]);
      }
    }

    void fetchIncoming();
    const id = setInterval(() => void fetchIncoming(), 5_000);
    return () => clearInterval(id);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);

    try {
      const ciphertext = await encryptMessage(trimmed);
      const res = await fetch(`${API_BASE}/api/messages`, {
        method:  "POST",
        headers: meshHeaders(),
        body:    JSON.stringify({
          fromNodeId: localStorage.getItem("meshnet_node_id") ?? "self",
          fromLabel:  "You",
          toNodeId:   "broadcast",
          category:   "info",
          ciphertext,
          hops:       0,
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (res.ok) {
        const saved = await res.json() as { id?: string };
        if (saved.id) seenIds.current.add(saved.id);
      }
    } catch { /* offline — still append locally */ }

    const now = new Date();
    const hh  = now.getHours().toString().padStart(2, "0");
    const mm  = now.getMinutes().toString().padStart(2, "0");
    setMsgs((prev) => [
      { id: `local-${Date.now()}`, from: "You", text: trimmed, time: `${hh}:${mm}`, type: "info", read: true },
      ...prev,
    ]);
    setInput("");
    setSending(false);
  }, [input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <h2
          className="text-lg font-bold text-[#E8EEF7] uppercase tracking-widest"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Mesh Comms
        </h2>
        <p className="text-xs text-[#7B9CC4]">Encrypted · offline · peer-to-peer</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {msgs.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-xl border-l-2 p-3 ${msgTypeStyle[msg.type]}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                {msgTypeIcon[msg.type]}
                <span className="text-xs font-bold text-[#E8EEF7]">{msg.from}</span>
                {!msg.read && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#F97316]/20 text-[#F97316]">
                    New
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[#7B9CC4]/60 shrink-0">
                <Clock size={9} />
                <span className="text-[10px] font-mono">{msg.time}</span>
              </div>
            </div>
            <p className="text-sm text-[#C4D5EC] leading-snug">{msg.text}</p>
          </div>
        ))}
      </div>

      <div className="p-4 pt-2 border-t border-[rgba(91,141,217,0.15)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Broadcast a message…"
            className="flex-1 rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] px-3 py-2.5 text-sm text-[#E8EEF7] placeholder-[#7B9CC4]/50 outline-none focus:border-[rgba(91,141,217,0.5)]"
          />
          <button
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-xl bg-[#F97316] flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleSend()}
          >
            <Send size={16} className={`text-white ${sending ? "animate-pulse" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
