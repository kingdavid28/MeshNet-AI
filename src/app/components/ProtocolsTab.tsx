import { useState, useEffect } from "react";
import { BluetoothScanner } from "../../components/BluetoothScanner";
import { WebRTCManager } from "../../components/WebRTCManager";
import { HotspotManager } from "../../components/HotspotManager";
import { NetworkStatus } from "../../components/NetworkStatus";
import { EmergencyMode } from "../../components/EmergencyMode";
import { MeshNetDiscovery } from "../../components/MeshNetDiscovery";
import { DataEntryForm } from "./DataEntryForm";
import { DatabaseTest } from "./DatabaseTest";
import { getSQLiteService } from "../../services/sqliteService";
import { getApiBase } from "../../utils/env";
import { RefreshCw, Check, X } from "lucide-react";

export function ProtocolsTab() {
  const [activeProtocol, setActiveProtocol] = useState<'ble' | 'webrtc' | 'hotspot' | 'data' | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; synced: number; errors: string[] } | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    setIsElectron(!!(window as any).electronAPI);
    // Load current backend URL
    const currentUrl = localStorage.getItem('meshnet_backend_url') || getApiBase();
    setBackendUrl(currentUrl);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const sqliteService = getSQLiteService();
      const apiBase = getApiBase();
      if (!apiBase) {
        setSyncResult({ success: false, synced: 0, errors: ['No backend URL configured. Please set backend URL above.'] });
        return;
      }
      const result = await sqliteService.syncFromBackend(apiBase);
      setSyncResult(result);
      console.log('[ProtocolsTab] Sync result:', result);
    } catch (error) {
      setSyncResult({ success: false, synced: 0, errors: [error instanceof Error ? error.message : String(error)] });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveBackendUrl = async () => {
    setSavingUrl(true);
    try {
      localStorage.setItem('meshnet_backend_url', backendUrl);
      console.log('[ProtocolsTab] Backend URL saved:', backendUrl);
      // Reload the page to apply the new backend URL
      window.location.reload();
    } catch (error) {
      console.error('[ProtocolsTab] Failed to save backend URL:', error);
    } finally {
      setSavingUrl(false);
    }
  };

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
      {!isElectron && <MeshNetDiscovery />}

      {/* Backend URL Configuration */}
      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#7B9CC4] uppercase tracking-widest">Backend URL</span>
          <span className="text-[10px] font-mono text-[#7B9CC4]">
            {backendUrl || 'Not configured (Pure P2P)'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="http://192.168.1.100:4000"
            className="flex-1 bg-[#0D1F3A] border border-[rgba(91,141,217,0.3)] rounded-lg px-3 py-2 text-xs text-[#E8EEF7] placeholder-[#7B9CC4] focus:outline-none focus:border-[#5B8DD9]"
          />
          <button
            onClick={handleSaveBackendUrl}
            disabled={savingUrl}
            className="bg-[#5B8DD9] hover:bg-[#4A7BC8] disabled:bg-[#132B5A] disabled:text-[#7B9CC4] text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            {savingUrl ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="text-[10px] text-[#7B9CC4] mt-2">
          Enter LAN IP of backend server (e.g., http://192.168.1.100:4000). Leave empty for pure P2P mode.
        </p>
      </div>

      {/* Backend Sync Button */}
      <div className="rounded-xl bg-[#132B5A] border border-[rgba(91,141,217,0.2)] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#7B9CC4] uppercase tracking-widest">Backend Sync</span>
          {syncResult && (
            <div className="flex items-center gap-1">
              {syncResult.success ? (
                <Check size={14} className="text-[#22C55E]" />
              ) : (
                <X size={14} className="text-[#EF4444]" />
              )}
              <span className="text-[10px] font-mono text-[#7B9CC4]">
                {syncResult.synced} synced
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full bg-[#5B8DD9] hover:bg-[#4A7BC8] disabled:bg-[#132B5A] disabled:text-[#7B9CC4] text-white text-sm font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync from Backend"}
        </button>
        {syncResult && syncResult.errors.length > 0 && (
          <div className="mt-2 text-[10px] text-[#EF4444]">
            {syncResult.errors[0]}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {/* BLE - Only on mobile devices */}
        {!isElectron && (
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
        )}
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
        <button
          onClick={() => setActiveProtocol('data')}
          className={`p-3 rounded-lg border-2 transition-all ${
            activeProtocol === 'data'
              ? 'bg-[#F97316] border-[#F97316]'
              : 'bg-[#132B5A] border-[rgba(91,141,217,0.2)]'
          }`}
        >
          <div className="text-2xl mb-1">📊</div>
          <div className="text-xs font-bold text-[#E8EEF7]">Data</div>
        </button>
      </div>

      {activeProtocol === 'ble' && !isElectron && (
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
      {activeProtocol === 'data' && (
        <div className="animate-fadeIn">
          <DataEntryForm />
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

      <DatabaseTest />

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
