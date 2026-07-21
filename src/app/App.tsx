import { useState, useEffect } from "react";
import { Radio, Wifi, Download, RefreshCw } from "lucide-react";
import DashboardLayout from "./components/DashboardLayout";
import { StatusBar } from "./components/StatusBar";
import { HomeTab } from "./components/HomeTab";
import { AlertTab } from "./components/AlertTab";
import { MapTab } from "./components/MapTab";
import { CommsTab } from "./components/CommsTab";
import { ProtocolsTab } from "./components/ProtocolsTab";
import { BLEScanner } from "../components/BLEScanner";
import { useCloudantNodes } from "./hooks/useCloudantNodes";
import { useNetworkDiscovery } from "./hooks/useNetworkDiscovery";
import { NAV, MESSAGES } from "./constants";
import type { Tab } from "./types";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const { backend, discovering, error, rediscover } = useNetworkDiscovery();

  // PWA Install Prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  // Render the full desktop dashboard on wide screens; mobile shell on narrow.
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const { nodes: liveNodes } = useCloudantNodes(10_000);
  const peerCount = liveNodes.length;

  if (isDesktop) {
    return <DashboardLayout />;
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 40% 20%, #0F2347 0%, #060E1C 70%)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        className="relative w-full max-w-[390px] flex flex-col overflow-hidden"
        style={{
          background: "#0B1D3A",
          minHeight: "100svh",
          maxHeight: "100svh",
          borderLeft: "1px solid rgba(91,141,217,0.15)",
          borderRight: "1px solid rgba(91,141,217,0.15)",
        }}
      >
        {/* Top bar */}
        <div className="shrink-0 border-b border-[rgba(91,141,217,0.12)]">
          <StatusBar nodeCount={peerCount} />
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center">
                <Radio size={16} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <div
                  className="text-base font-black text-[#E8EEF7] leading-none tracking-wider uppercase"
                  style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                >
                  MeshNet AI
                </div>
                <div className="text-[9px] font-mono text-[#7B9CC4] tracking-widest uppercase">
                  Emergency Routing v2.4
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20">
              <Wifi size={11} className="text-[#22C55E]" />
              <span className="text-[10px] font-mono text-[#22C55E] uppercase tracking-wider">Offline</span>
            </div>
          </div>
        </div>

        {/* PWA Install Prompt */}
        {showInstallPrompt && (
          <div className="shrink-0 mx-4 mt-3 p-3 rounded-lg bg-[#F97316]/10 border border-[#F97316]/30 flex items-center gap-3">
            <Download size={18} className="text-[#F97316] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#E8EEF7]">Install MeshNet</div>
              <div className="text-[10px] text-[#7B9CC4]">Add to home screen for offline access</div>
            </div>
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded bg-[#F97316] text-white text-xs font-semibold"
            >
              Install
            </button>
            <button
              onClick={() => setShowInstallPrompt(false)}
              className="px-2 py-1.5 text-[#7B9CC4] text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Network Discovery Status */}
        {!backend && !isDesktop && (
          <div className="shrink-0 mx-4 mt-3 p-3 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/30 flex items-center gap-3">
            {discovering ? (
              <RefreshCw size={18} className="text-[#3B82F6] shrink-0 animate-spin" />
            ) : (
              <Wifi size={18} className="text-[#3B82F6] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#E8EEF7]">
                {discovering ? 'Discovering MeshNet...' : 'No MeshNet Found'}
              </div>
              <div className="text-[10px] text-[#7B9CC4]">
                {discovering ? 'Scanning local network...' : error || 'Connect to Wi-Fi hotspot'}
              </div>
            </div>
            {!discovering && (
              <button
                onClick={rediscover}
                className="px-3 py-1.5 rounded bg-[#3B82F6] text-white text-xs font-semibold"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Scrollable content — hidden when the map tab is active. */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "none", display: tab === "map" ? "none" : undefined }}
        >
          {/* BLE Scanner for credential exchange */}
          {!backend && !isDesktop && (
            <div className="mx-4 mt-3">
              <BLEScanner />
            </div>
          )}

          {tab === "home" && <HomeTab liveNodes={liveNodes} />}
          {tab === "alert" && <AlertTab nodeCount={peerCount} />}
          {tab === "comms" && <CommsTab />}
          {tab === "protocols" && <ProtocolsTab />}
        </div>

        {/* Map tab is a flex sibling so Leaflet gets a fixed-height parent. */}
        {tab === "map" && (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <MapTab />
          </div>
        )}

        {/* Bottom navigation */}
        <div
          className="shrink-0 border-t border-[rgba(91,141,217,0.15)] bg-[#0A1526]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              const isAlert = id === "alert";
              const unread = id === "comms" ? MESSAGES.filter((m) => !m.read).length : 0;

              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${
                    active ? "text-[#F97316]" : "text-[#7B9CC4]"
                  }`}
                >
                  {isAlert && !active && (
                    <div className="absolute top-2 w-10 h-10 rounded-full bg-[#F97316]/10 flex items-center justify-center -mt-1">
                      <div className="w-10 h-10 rounded-full border border-[#F97316]/25 animate-ping absolute" />
                    </div>
                  )}
                  <div className="relative">
                    <Icon
                      size={20}
                      strokeWidth={active ? 2.5 : 1.8}
                      className={isAlert && !active ? "text-[#F97316]/70" : ""}
                    />
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#F97316] text-white text-[9px] font-bold flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-widest ${active ? "font-bold" : ""}`}
                    style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                  >
                    {label}
                  </span>
                  {active && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#F97316] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
