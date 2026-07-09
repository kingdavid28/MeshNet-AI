/**
 * useDeviceLocation
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscribes to the browser Geolocation API via watchPosition and returns the
 * device's live coordinates.  Handles all permission/error states gracefully.
 *
 * Returns
 * ───────
 *  lat / lng   — current WGS-84 coordinates (null until first fix)
 *  accuracy    — horizontal accuracy in metres (null until first fix)
 *  status      — "idle" | "acquiring" | "ok" | "denied" | "unavailable" | "timeout"
 *  error       — human-readable error string (null when status is "ok")
 *
 * The hook calls watchPosition once on mount and clears the watch on unmount.
 * It does NOT poll — the browser pushes updates whenever the position changes.
 */

import { useState, useEffect } from "react";

export type LocationStatus =
  | "idle"        // not yet requested
  | "acquiring"   // requested, waiting for first fix
  | "ok"          // have a valid position
  | "denied"      // user denied permission
  | "unavailable" // position unavailable (hardware/network)
  | "timeout";    // timed out waiting for fix

export interface DeviceLocation {
  lat:      number | null;
  lng:      number | null;
  accuracy: number | null;  // metres
  status:   LocationStatus;
  error:    string | null;
}

const INITIAL: DeviceLocation = {
  lat:      null,
  lng:      null,
  accuracy: null,
  status:   "idle",
  error:    null,
};

// Electron IPC fallback — used when Chromium's geolocation fails (Google 403)
async function tryElectronLocation(): Promise<DeviceLocation | null> {
  const api = (window as Record<string, any>).electronAPI;
  if (!api?.getLocation) return null;
  try {
    const result = await api.getLocation() as { success: boolean; lat?: number; lng?: number; accuracy?: number | null; error?: string };
    if (result.success && result.lat != null && result.lng != null) {
      return { lat: result.lat, lng: result.lng, accuracy: result.accuracy ?? null, status: "ok", error: null };
    }
  } catch { /* ignore */ }
  return null;
}

function isElectronLocationAvailable(): boolean {
  return !!(window as Record<string, any>).electronAPI?.getLocation;
}

export function useDeviceLocation(): DeviceLocation {
  const [loc, setLoc] = useState<DeviceLocation>(INITIAL);

  useEffect(() => {
    // In the Electron desktop app, always use the Windows Location API IPC
    // first. Chromium's browser geolocation hits Google's network location
    // service and returns 403 without a Google API key.
    if (isElectronLocationAvailable()) {
      setLoc((prev) => ({ ...prev, status: "acquiring" }));
      tryElectronLocation().then((elLoc) => {
        setLoc(elLoc ?? {
          lat: null, lng: null, accuracy: null,
          status: "unavailable",
          error: "Electron location unavailable",
        });
      });
      return;
    }

    if (!("geolocation" in navigator)) {
      setLoc((prev) => ({ ...prev, status: "acquiring" }));
      tryElectronLocation().then((elLoc) => {
        setLoc(elLoc ?? {
          lat: null, lng: null, accuracy: null,
          status: "unavailable",
          error: "Geolocation is not supported by this browser",
        });
      });
      return;
    }

    setLoc((prev) => ({ ...prev, status: "acquiring" }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLoc({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          status:   "ok",
          error:    null,
        });
      },
      (err) => {
        let status: LocationStatus = "unavailable";
        let message = err.message;

        if (err.code === err.PERMISSION_DENIED) {
          status  = "denied";
          message = "Location access denied — please allow location in browser settings";
        } else if (err.code === err.TIMEOUT) {
          status  = "timeout";
          message = "Location request timed out";
        }

        // Browser geolocation failed — try Electron IPC (Windows Location API)
        tryElectronLocation().then((elLoc) => {
          if (elLoc) {
            setLoc(elLoc);
          } else {
            setLoc((prev) => ({
              lat:      prev.lat,
              lng:      prev.lng,
              accuracy: prev.accuracy,
              status,
              error: message,
            }));
          }
        });
      },
      {
        enableHighAccuracy: true,
        timeout:            15_000,
        maximumAge:         30_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return loc;
}
