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

export function useDeviceLocation(): DeviceLocation {
  const [loc, setLoc] = useState<DeviceLocation>(INITIAL);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLoc({
        lat: null, lng: null, accuracy: null,
        status: "unavailable",
        error: "Geolocation is not supported by this browser",
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

        setLoc((prev) => ({
          lat:      prev.lat,   // keep last known position on error
          lng:      prev.lng,
          accuracy: prev.accuracy,
          status,
          error: message,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout:            15_000,   // 15 s before timeout error
        maximumAge:         30_000,   // accept cached position up to 30 s old
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return loc;
}
