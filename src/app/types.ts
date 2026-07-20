import type { ReactNode } from "react";

export type Tab = "home" | "alert" | "map" | "comms" | "protocols";
export type DeviceKind = "self" | "smartphone" | "laptop";
export type Protocol = "wifi" | "bluetooth";

export interface CanvasNode {
  id: string;
  label: string;
  name: string;
  x: number;
  y: number;
  device: DeviceKind;
  role: "self" | "peer" | "relay";
  signal: number;
  lastSeen: string;
  os?: string;
}

export interface CanvasEdge {
  a: string;
  b: string;
  protocol: Protocol;
}

export interface AppMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  type: "alert" | "medical" | "info" | "gps";
  read: boolean;
}

export interface LocalMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  type: AppMessage["type"];
  read: boolean;
}

export type MsgTypeStyle = Record<string, string>;
export type MsgTypeIcon = Record<string, ReactNode>;
