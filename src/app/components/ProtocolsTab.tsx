import { useState, useEffect } from "react";
import { BluetoothScanner } from "../../components/BluetoothScanner";
import { WebRTCManager } from "../../components/WebRTCManager";
import { HotspotManager } from "../../components/HotspotManager";
import { NetworkStatus } from "../../components/NetworkStatus";
import { EmergencyMode } from "../../components/EmergencyMode";
import { MeshNetDiscovery } from "../../components/MeshNetDiscovery";

export function ProtocolsTab() {
  const [activeProtocol, setActiveProtocol] = useState<'ble' | 'webrtc' | 'hotspot' | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setIsElectron(!!(window as any).electronAPI);
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2
          className="text-lg font-bold text-[#E8EEF7] uppercase tracking-widest"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Connection Protocols
        </h2>
        <p className="text-xs text-[#7B9CC4]">Select a protocol to manage mesh connections</p>
      </div>

      {/* MeshNet Discovery - Only on mobile devices (desktop/Electron is hotspot host) */}
      {!isDesktop && !isElectron && <MeshNetDiscovery />}

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setActiveProtocol('ble')}
          className={`p-3 rounded-lg border-2 transition-all ${
            activeProtocol === 'ble'
              ? 'bg-[#F97316] border-[#F97316]'
              : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)]'
          }`}
        >
          <div className="text-2xl mb-1">📡</div>
          <div className="text-xs font-bold text-[#E8EEF7]">BLE</div>
        </button>
        <button
          onClick={() => setActiveProtocol('webrtc')}
          className={`p-3 rounded-lg border-2 transition-all ${
            activeProtocol === 'webrtc'
              ? 'bg-[#F97316] border-[#F97316]'
              : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)]'
          }`}
        >
          <div className="text-2xl mb-1">🔗</div>
          <div className="text-xs font-bold text-[#E8EEF7]">WebRTC</div>
        </button>
        <button
          onClick={() => setActiveProtocol('hotspot')}
          className={`p-3 rounded-lg border-2 transition-all ${
            activeProtocol === 'hotspot'
              ? 'bg-[#F97316] border-[#F97316]'
              : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)]'
          }`}
        >
          <div className="text-2xl mb-1">📶</div>
          <div className="text-xs font-bold text-[#E8EEF7]">Hotspot</div>
        </button>
      </div>

      {activeProtocol === 'ble' && (
        <div className="animate-fadeIn">
          <BluetoothScanner />
        </div>
      )}
      {activeProtocol === 'webrtc' && (
        <div className="animate-fadeIn">
          <WebRTCManager />
        </div>
      )}
      {activeProtocol === 'hotspot' && (
        <div className="animate-fadeIn">
          <HotspotManager />
        </div>
      )}

      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4">
        <h3
          className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest mb-3"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Network Status
        </h3>
        <NetworkStatus />
      </div>

      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-4">
        <h3
          className="text-sm font-bold text-[#E8EEF7] uppercase tracking-widest mb-3"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Emergency Mode
        </h3>
        <EmergencyMode />
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
