/**
 * SosInputPortal — King David's Emergency SOS Input Portal
 *
 * Left-panel component for the dashboard. Allows the operator to:
 *  1. Select an emergency type  (War Zone, Flood, Earthquake, Medical, etc.)
 *  2. Pick a pre-built SOS template (auto-fills location + time)
 *  3. Edit / send — broadcasts to all reachable mesh nodes
 *  4. Offline queue — failed sends are stored and retried automatically
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Heart,
  Waves,
  Flame,
  Siren,
  ShieldAlert,
  Navigation,
  Send,
  CheckCircle2,
  Radio,
  FileText,
  WifiOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SosPayload {
  type: string;
  message: string;
  lat?: number;
  lng?: number;
  timestamp: string;
}

interface QueuedSos {
  id: string;
  payload: SosPayload;
  backendType: string;
  queuedAt: string;
}

interface EmergencyType {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

interface Props {
  onSend?: (payload: SosPayload) => void;
}

// ─── Emergency type catalogue ─────────────────────────────────────────────────

const EMERGENCY_TYPES: EmergencyType[] = [
  {
    id: "war_zone",
    label: "War Zone",
    icon: <ShieldAlert size={20} />,
    color: "#EF4444",
    description: "Active conflict / armed threat",
  },
  {
    id: "flood",
    label: "Flood",
    icon: <Waves size={20} />,
    color: "#38BDF8",
    description: "Flash flood / rising water",
  },
  {
    id: "earthquake",
    label: "Earthquake",
    icon: <AlertTriangle size={20} />,
    color: "#F59E0B",
    description: "Seismic event / structural damage",
  },
  {
    id: "medical",
    label: "Medical",
    icon: <Heart size={20} />,
    color: "#F97316",
    description: "Injury / medical emergency",
  },
  {
    id: "fire",
    label: "Fire",
    icon: <Flame size={20} />,
    color: "#FBBF24",
    description: "Structure fire / wildfire",
  },
  {
    id: "sos",
    label: "SOS",
    icon: <Siren size={20} />,
    color: "#EF4444",
    description: "General SOS distress signal",
  },
  {
    id: "evacuation",
    label: "Evacuate",
    icon: <AlertTriangle size={20} />,
    color: "#A855F7",
    description: "Forced / recommended evacuation",
  },
];

// ─── SOS Message Templates ────────────────────────────────────────────────────

const BACKEND_TYPE_MAP: Record<string, string> = {
  war_zone:   "sos",
  sos:        "sos",
  medical:    "medical",
  fire:       "hazard",
  evacuation: "hazard",
  flood:      "hazard",
  earthquake: "hazard",
};

function fmtTime(): string {
  const offset = /GMT([+-]\d+)/.exec(new Date().toString())?.[1] ?? "";
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + ` UTC${offset}`;
}

function fmtCoords(lat?: number, lng?: number): string {
  if (lat != null && lng != null) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return "[LOCATION UNAVAILABLE — describe manually]";
}

type TemplateFactory = (loc: string, time: string) => { label: string; text: string }[];

const TEMPLATES: Record<string, TemplateFactory> = {
  flood: (loc, time) => [
    { label: "F-1 · Distress", text: `🌊 [FLOOD] EMERGENCY\nLocation: ${loc}\nTime: ${time}\nPersons stranded, rising water. Need immediate evacuation.\nSent via MeshNet` },
    { label: "F-2 · Safe zone", text: `🌊 [FLOOD] SAFE ZONE REACHED\nLocation: ${loc}\nTime: ${time}\nSurvivors evacuated to higher ground. Road submerged at last position.` },
    { label: "F-3 · Supply request", text: `🌊 [FLOOD] SUPPLY REQUEST\nLocation: ${loc}\nTime: ${time}\nNeed: Food / Water / Medical / Boat\nSEVERITY: CRITICAL` },
    { label: "F-4 · Hazard alert", text: `🌊 [FLOOD] HAZARD ALERT\nLocation: ${loc}\nTime: ${time}\nWARNING: Bridge/road impassable. Avoid this area.` },
    { label: "F-5 · Missing person", text: `🌊 [FLOOD] MISSING PERSON\nLast seen: ${loc} at ${time}\nDescription: [Name, age, clothing]. Contact rescuer at this node.` },
    { label: "F-6 · All clear", text: `🌊 [FLOOD] ALL CLEAR\nArea: ${loc}\nTime: ${time}\nEvacuation complete. All persons accounted for.` },
  ],
  earthquake: (loc, time) => [
    { label: "E-1 · Distress", text: `🏚 [EARTHQUAKE] EMERGENCY\nLocation: ${loc}\nTime: ${time}\nStructure collapsed. Persons trapped. Send rescue team.` },
    { label: "E-2 · Aftershock warning", text: `🏚 [EARTHQUAKE] AFTERSHOCK WARNING\nFelt at: ${loc}\nTime: ${time}\nMove away from damaged structures immediately.` },
    { label: "E-3 · Damage report", text: `🏚 [EARTHQUAKE] DAMAGE REPORT\nLocation: ${loc}\nTime: ${time}\nBuildings affected: __\nRoad passable: YES/NO\nPower line down: YES/NO` },
    { label: "E-4 · Medical triage", text: `🏚 [EARTHQUAKE] MEDICAL TRIAGE NEEDED\nLocation: ${loc}\nTime: ${time}\nCritical: __ / Moderate: __ / Minor: __\nRequire: Doctor / Paramedic / First-aid kit` },
    { label: "E-5 · Rescue update", text: `🏚 [EARTHQUAKE] RESCUE UPDATE\nLocation: ${loc}\nTime: ${time}\nSurvivors extracted: __\nStill searching: YES/NO` },
    { label: "E-6 · Landslide risk", text: `🏚 [EARTHQUAKE] LANDSLIDE RISK\nLocation: ${loc}\nTime: ${time}\nUnstable slope detected. Do NOT traverse this area.` },
  ],
  medical: (loc, time) => [
    { label: "M-1 · Emergency", text: `🚑 [MEDICAL] EMERGENCY\nLocation: ${loc}\nTime: ${time}\nCondition: __\nSymptoms: __\nNeed: Doctor / AED / Oxygen / Ambulance` },
    { label: "M-2 · Cardiac arrest", text: `🚑 [MEDICAL] CARDIAC ARREST\nLocation: ${loc}\nTime: ${time}\nPatient unconscious, no pulse detected.\nCPR in progress: YES/NO  AED needed: YES/NO` },
    { label: "M-3 · Mass casualty", text: `🚑 [MEDICAL] MASS CASUALTY\nLocation: ${loc}\nTime: ${time}\nCasualties: __  Critical: __  Walking wounded: __\nNeed: Medical team / Stretchers` },
    { label: "M-4 · Supply shortage", text: `🚑 [MEDICAL] SUPPLY SHORTAGE\nLocation: ${loc}\nTime: ${time}\nCritical need: [medication/equipment]\nPatients at risk: __` },
    { label: "M-5 · Transfer request", text: `🚑 [MEDICAL] TRANSFER REQUEST\nLocation: ${loc}\nTime: ${time}\nPatient condition: STABLE / CRITICAL\nDestination: [nearest hospital/evac point]` },
    { label: "M-6 · Trauma response", text: `🚑 [MEDICAL] MENTAL HEALTH ALERT\nLocation: ${loc}\nTime: ${time}\nPersons showing acute stress/panic.\nNeed: Crisis counsellor / Trauma responder` },
  ],
};

const QUEUE_KEY = "meshnet_sos_queue";

function loadQueue(): QueuedSos[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedSos[];
  } catch { return []; }
}

function saveQueue(q: QueuedSos[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

const API_BASE: string =
  ((import.meta as Record<string, any>).env?.VITE_API_BASE_URL as string | undefined)
  ?? "http://localhost:4000";

// ─── Component ────────────────────────────────────────────────────────────────

export default function SosInputPortal({ onSend }: Readonly<Props>) {
  const [selectedType, setSelectedType]       = useState<string | null>(null);
  const [message, setMessage]                 = useState("");
  const [sending, setSending]                 = useState(false);
  const [sent, setSent]                       = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [gpsCoords, setGpsCoords]             = useState<{ lat: number; lng: number } | null>(null);
  const [showTemplates, setShowTemplates]     = useState(false);
  const [queuedCount, setQueuedCount]         = useState(() => loadQueue().length);

  const selected  = EMERGENCY_TYPES.find((t) => t.id === selectedType) ?? null;
  const templates = selectedType && TEMPLATES[selectedType]
    ? TEMPLATES[selectedType](fmtCoords(gpsCoords?.lat, gpsCoords?.lng), fmtTime())
    : null;
  const canSend = selected !== null;

  // ── Acquire GPS once on mount ─────────────────────────────────────────────
  useEffect(() => {
    const tryElectronGPS = async () => {
      const api = (window as Record<string, any>).electronAPI;
      if (!api?.getLocation) return;
      const r = await api.getLocation() as { success: boolean; lat?: number; lng?: number };
      if (r.success && r.lat != null && r.lng != null) {
        setGpsCoords({ lat: r.lat, lng: r.lng });
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { tryElectronGPS(); },
        { timeout: 8000, maximumAge: 30_000 },
      );
    } else {
      tryElectronGPS();
    }
  }, []);

  // ── Flush offline queue when online ──────────────────────────────────────
  const flushQueue = useCallback(async () => {
    const queue = loadQueue();
    if (queue.length === 0) return;
    const secret = localStorage.getItem("mesh-secret") ?? "";
    const remaining: QueuedSos[] = [];
    for (const item of queue) {
      try {
        const res = await fetch(`${API_BASE}/api/alerts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Mesh-Secret": secret },
          body: JSON.stringify({
            type:    item.backendType,
            message: item.payload.message,
            lat:     item.payload.lat,
            lng:     item.payload.lng,
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) remaining.push(item);
      } catch { remaining.push(item); }
    }
    saveQueue(remaining);
    setQueuedCount(remaining.length);
  }, []);

  useEffect(() => {
    const handler = () => flushQueue();
    window.addEventListener("online", handler);
    flushQueue();
    return () => window.removeEventListener("online", handler);
  }, [flushQueue]);

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend || sending) return;
    setError(null);
    setSending(true);

    const payload: SosPayload = {
      type:      selectedType!,
      message:   message.trim() || `${selected!.label} emergency reported`,
      lat:       gpsCoords?.lat,
      lng:       gpsCoords?.lng,
      timestamp: new Date().toISOString(),
    };

    const backendType = BACKEND_TYPE_MAP[payload.type] ?? "sos";
    const secret      = localStorage.getItem("mesh-secret") ?? "";

    let delivered = false;
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mesh-Secret": secret },
        body: JSON.stringify({ type: backendType, message: payload.message, lat: payload.lat, lng: payload.lng }),
        signal: AbortSignal.timeout(6_000),
      });
      delivered = res.ok;
    } catch { /* network error — fall through to queue */ }

    if (!delivered) {
      const queue = loadQueue();
      queue.push({ id: crypto.randomUUID(), payload, backendType, queuedAt: new Date().toISOString() });
      saveQueue(queue);
      setQueuedCount(queue.length);
      setError("⚠ Backend unreachable — SOS queued. Will retry automatically.");
    }

    onSend?.(payload);
    setSending(false);
    setSent(true);

    setTimeout(() => {
      setSent(false);
      setSelectedType(null);
      setMessage("");
      setShowTemplates(false);
      setError(null);
    }, 4000);
  };

  // ── Sent confirmation ─────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 h-full min-h-[400px] px-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.4)" }}
        >
          <CheckCircle2 size={36} className="text-[#22C55E]" />
        </div>
        <div>
          <p className="text-3xl font-black text-center uppercase tracking-widest text-[#22C55E]"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
            SOS Sent
          </p>
          <p className="text-sm text-[#7B9CC4] text-center mt-1">
            Broadcasting to all reachable mesh nodes
          </p>
        </div>
        <div className="flex items-center gap-2 text-[#7B9CC4] text-xs font-mono">
          <Radio size={12} className="animate-pulse text-[#22C55E]" />
          Relaying across network…
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Header */}
      <div className="flex items-center gap-3 pb-1 border-b border-[rgba(91,141,217,0.15)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)" }}>
          <AlertTriangle size={18} className="text-[#EF4444]" />
        </div>
        <div>
          <h2 className="text-base font-black text-[#E8EEF7] uppercase tracking-widest leading-none"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
            Emergency SOS Portal
          </h2>
          <p className="text-[10px] text-[#7B9CC4] mt-0.5 font-mono uppercase tracking-wider">
            Offline · Mesh-broadcast · Encrypted
          </p>
        </div>
        {queuedCount > 0 && (
          <span className="ml-auto text-[9px] font-mono px-2 py-1 rounded-full"
            style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
            {queuedCount} queued
          </span>
        )}
      </div>

      {/* Step 1 — Select Emergency Type */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#7B9CC4]">
          01 — Select Emergency Type
        </span>
        <div className="grid grid-cols-2 gap-2">
          {EMERGENCY_TYPES.map((t) => {
            const active = selectedType === t.id;
            return (
              <button key={t.id}
                onClick={() => { setSelectedType(active ? null : t.id); setShowTemplates(false); setMessage(""); }}
                className="rounded-xl p-3 flex items-center gap-3 border transition-all duration-150 active:scale-95 text-left"
                style={{
                  background:   active ? `${t.color}18` : "rgba(19,43,90,0.7)",
                  borderColor:  active ? `${t.color}60` : "rgba(91,141,217,0.15)",
                  boxShadow:    active ? `0 0 14px ${t.color}22` : "none",
                }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${t.color}20`, color: t.color }}>
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight"
                    style={{ color: active ? t.color : "#E8EEF7", fontFamily: "Barlow Condensed, sans-serif" }}>
                    {t.label}
                  </div>
                  <div className="text-[9px] text-[#7B9CC4] leading-tight truncate">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Template Picker (Flood / Earthquake / Medical only) */}
      {templates && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest transition-colors"
            style={{ color: showTemplates ? selected!.color : "#7B9CC4" }}>
            <FileText size={11} />
            02 — Use Template
            {showTemplates
              ? <ChevronUp size={11} className="ml-auto" />
              : <ChevronDown size={11} className="ml-auto" />}
          </button>
          {showTemplates && (
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {templates.map((tpl) => (
                <button key={tpl.label}
                  onClick={() => { setMessage(tpl.text); setShowTemplates(false); }}
                  className="text-left rounded-lg px-3 py-2 border text-[10px] font-mono transition-all hover:brightness-125"
                  style={{
                    background:   "rgba(19,43,90,0.8)",
                    borderColor:  `${selected!.color}30`,
                    color:        "#E8EEF7",
                  }}>
                  <span style={{ color: selected!.color }}>{tpl.label}</span>
                  <span className="ml-2 text-[#7B9CC4] truncate">{tpl.text.split("\n")[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Message Box */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#7B9CC4]">
          {templates ? "03" : "02"} — Message
        </span>
        <div className="rounded-xl border transition-colors"
          style={{ background: "#0F2040", borderColor: message ? "rgba(91,141,217,0.4)" : "rgba(91,141,217,0.18)" }}>
          <textarea
            id="sos-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={
              selected
                ? `Describe the ${selected.label.toLowerCase()} situation — location, people, severity…`
                : "e.g. Need medical assistance at sector 4B — 2 patients, critical"
            }
            className="w-full bg-transparent text-sm text-[#E8EEF7] placeholder-[#7B9CC4]/40 resize-none outline-none p-3 leading-relaxed"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[9px] font-mono text-[#7B9CC4]/50">{message.length}/500</span>
            {selected && (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider"
                style={{ background: `${selected.color}18`, color: selected.color }}>
                {selected.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GPS strip */}
      <div className="rounded-xl px-3 py-2 flex items-center gap-3 border"
        style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
        <Navigation size={13} className="text-[#22C55E] shrink-0" />
        <div className="flex-1">
          {gpsCoords ? (
            <div className="text-[9px] font-mono text-[#22C55E]">
              {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
            </div>
          ) : (
            <div className="text-[9px] font-mono text-[#7B9CC4]/70">GPS acquiring…</div>
          )}
          <div className="text-[9px] text-[#7B9CC4]/50">Location auto-attached to SOS</div>
        </div>
        {gpsCoords
          ? <CheckCircle2 size={13} className="text-[#22C55E] shrink-0" />
          : <WifiOff size={13} className="text-[#7B9CC4]/40 shrink-0" />}
      </div>

      {/* Offline queue notice */}
      {error && (
        <p className="text-[10px] text-[#F59E0B] font-mono px-1 flex items-center gap-1">
          <WifiOff size={10} className="shrink-0" />
          {error}
        </p>
      )}

      {/* SEND SOS Button */}
      <button
        onClick={handleSend}
        disabled={!canSend || sending}
        className="w-full rounded-xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          fontFamily: "Barlow Condensed, sans-serif",
          fontSize: "1.2rem",
          letterSpacing: "0.15em",
          padding: "1rem",
          background: canSend ? "linear-gradient(135deg, #EF4444, #DC2626)" : "#132B5A",
          color: "#ffffff",
          boxShadow: canSend ? "0 0 28px rgba(239,68,68,0.4), 0 4px 12px rgba(0,0,0,0.3)" : "none",
          border: canSend ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(91,141,217,0.2)",
        }}>
        {sending ? (
          <><Radio size={20} className="animate-pulse" /> Transmitting…</>
        ) : (
          <><Send size={20} /> SEND SOS</>
        )}
      </button>

      {!canSend && (
        <p className="text-[10px] text-[#7B9CC4]/60 text-center font-mono -mt-2">
          Select an emergency type above to enable
        </p>
      )}
    </div>
  );
}
