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
  {
    id: "1",
    from: "Command Center",
    text: "Emergency response team deployed to Sector 4",
    time: "08:30",
    type: "info",
    read: false,
  },
  {
    id: "2", 
    from: "Medical Unit",
    text: "🏥 MEDICAL EMERGENCY · 3 patients need transport · GPS 14.5602°N 121.0234°E",
    time: "08:15",
    type: "medical",
    read: false,
  },
  {
    id: "3",
    from: "Node-Alpha",
    text: "✅ I AM SAFE · All personnel accounted for",
    time: "08:00",
    type: "info",
    read: true,
  },
]; // Demo messages for testing

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

export const SIM_MODE = false; // Force production mode - no simulation
export const TICK_MS = 5000;
