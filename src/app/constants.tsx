import type { ReactNode } from "react";
import {
  AlertTriangle,
  Heart,
  MapPin,
  Radio,
  Home,
  Map,
  Bell,
  MessageCircle,
  Settings,
} from "lucide-react";
import type { AppMessage, Tab } from "./types";
import { getApiBase, getMeshSecret } from "../utils/env";

export const API_BASE = getApiBase();

export function meshHeaders(extra?: Record<string, string>): HeadersInit {
  const secret = getMeshSecret();
  return {
    "Content-Type": "application/json",
    ...(secret ? { "X-Mesh-Secret": secret } : {}),
    ...extra,
  };
}

export const MESSAGES: AppMessage[] = [
  { id: "m1", from: "MED-2", text: "Need insulin supplies at sector 4B. 2 patients.", time: "14:23", type: "medical", read: false },
  { id: "m2", from: "Alpha", text: "Route to shelter via Main St blocked. Use Oak Ave.", time: "14:18", type: "info", read: false },
  { id: "m3", from: "Unit 7", text: "GPS: 37.7749° N, 122.4194° W — Safe zone confirmed.", time: "14:09", type: "gps", read: true },
  { id: "m4", from: "Cmd", text: "ALERT: Gas leak reported near District 5. Evacuate.", time: "13:55", type: "alert", read: true },
];

export const msgTypeStyle: Record<string, string> = {
  alert: "border-l-[#EF4444] bg-[#EF4444]/10",
  medical: "border-l-[#F97316] bg-[#F97316]/10",
  info: "border-l-[#7B9CC4] bg-[#7B9CC4]/8",
  gps: "border-l-[#22C55E] bg-[#22C55E]/10",
};

export const msgTypeIcon: Record<string, ReactNode> = {
  alert: <AlertTriangle size={13} className="text-[#EF4444]" />,
  medical: <Heart size={13} className="text-[#F97316]" />,
  info: <Radio size={13} className="text-[#7B9CC4]" />,
  gps: <MapPin size={13} className="text-[#22C55E]" />,
};

export const ALERT_TYPE_MAP: Record<string, string> = {
  sos:     "sos",
  medical: "medical",
  safe:    "safe",
  hazard:  "hazard",
  supply:  "supply",
  locate:  "locate",
};

export const ALERT_MSG_CATEGORY: Record<string, "alert" | "medical" | "info" | "gps"> = {
  sos:     "alert",
  medical: "medical",
  safe:    "info",
  hazard:  "alert",
  supply:  "info",
  locate:  "gps",
};

export const ALERT_LABEL: Record<string, string> = {
  sos:     "🆘 SOS ALERT",
  medical: "🏥 MEDICAL EMERGENCY",
  safe:    "✅ I AM SAFE",
  hazard:  "⚠️ HAZARD REPORTED",
  supply:  "📦 NEEDS SUPPLIES",
  locate:  "📍 LOCATION BROADCAST",
};

export const NAV = [
  { id: "home" as Tab, label: "Home", icon: Home },
  { id: "alert" as Tab, label: "Alert", icon: Bell },
  { id: "map" as Tab, label: "Map", icon: Map },
  { id: "comms" as Tab, label: "Comms", icon: MessageCircle },
  { id: "protocols" as Tab, label: "Protocols", icon: Settings },
];

export const SIM_MODE = import.meta.env.VITE_SIM_MODE === "true";
export const TICK_MS = Number.parseInt(String(import.meta.env.VITE_SIM_TICK_MS ?? "5000"), 10);
