import { useState, useEffect, useCallback, useRef } from 'react';
import { BluetoothMeshService, BLEDevice, MeshMessage } from '../services/bluetooth';
import { meshDeviceEmitter } from './NetworkStatus';

interface BluetoothScannerProps {
  // Optional externally-managed service instance. When provided, the scanner
  // shares that instance with the parent (e.g. DashboardLayout SOS portal).
  service?: BluetoothMeshService | null;
}

// One shared service instance per mount — recreated on remount.
function useBluetoothService(external?: BluetoothMeshService | null) {
  const ref = useRef<BluetoothMeshService | null>(null);
  if (external) return external;
  ref.current ??= new BluetoothMeshService();
  return ref.current;
}

export function BluetoothScanner({ service }: Readonly<BluetoothScannerProps>) {
  const svc = useBluetoothService(service);
  const [supported]      = useState(() => BluetoothMeshService.isSupported());
  const [scanning,       setScanning]       = useState(false);
  const [connecting,     setConnecting]     = useState(false);
  const [device,         setDevice]         = useState<BLEDevice | null>(null);
  const [connected,      setConnected]      = useState(false);
  const [lastMsg,        setLastMsg]        = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [emergencyQueue, setEmergencyQueue] = useState(0);

  useEffect(() => {
    const onConnected    = (d: BLEDevice)      => { setDevice(d); setConnected(true); setError(null); meshDeviceEmitter.updateCount(1); };
    const onDisconnected = (_d: BLEDevice)     => { setConnected(false); setLastMsg(null); meshDeviceEmitter.updateCount(0); };
    const onData         = (m: MeshMessage)    => setLastMsg(`${m.type} from ${m.deviceId}`);
    const onSos          = (m: MeshMessage)    => setLastMsg(`🆘 SOS from ${m.deviceId}`);
    const onEmergency    = (m: MeshMessage)    => {
      const packet = (m.payload as { lat?: number; lng?: number; message?: string } | undefined) ?? {};
      const loc = packet.lat != null && packet.lng != null
        ? `${packet.lat.toFixed(5)}, ${packet.lng.toFixed(5)}`
        : 'no GPS';
      const suffix = packet.message ? ` — ${packet.message}` : '';
      setLastMsg(`🆘 EMERGENCY from ${m.deviceId} @ ${loc}${suffix}`);
    };
    const updateQueue = () => setEmergencyQueue(svc.pendingCount);

    svc.on('connected',    onConnected);
    svc.on('disconnected', onDisconnected);
    svc.on('dataReceived', onData);
    svc.on('sos',          onSos);
    svc.on('emergency',    onEmergency);

    // Poll queue length so UI can show pending emergency packets
    const id = setInterval(updateQueue, 1_000);
    updateQueue();

    return () => {
      svc.off('connected',    onConnected);
      svc.off('disconnected', onDisconnected);
      svc.off('dataReceived', onData);
      svc.off('sos',          onSos);
      svc.off('emergency',    onEmergency);
      clearInterval(id);
      svc.disconnect();
      meshDeviceEmitter.updateCount(0);
    };
  }, [svc]);

  const handleScan = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      const found = await svc.discoverDevices();
      if (found.length === 0) {
        setError('No MeshNet device selected. Make sure the victim\'s phone is advertising the MeshNet BLE service.');
        return;
      }
      const picked = found[0];
      setDevice(picked);
      setConnecting(true);
      const ok = await svc.connectToDevice(picked);
      if (!ok) setError('Connected to device but GATT setup failed. Ensure the MeshNet app is running on the phone.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      setConnecting(false);
    }
  }, [svc]);

  const handleDisconnect = useCallback(async () => {
    await svc.disconnect();
    setDevice(null);
    setConnected(false);
  }, [svc]);

  const handleSendSos = useCallback(async () => {
    await svc.sendMeshMessage({
      type:     'sos',
      deviceId: localStorage.getItem('mesh-device-id') ?? 'desktop',
      timestamp: Date.now(),
      payload:  { message: 'Emergency SOS from MeshNet desktop node' },
    });
    setLastMsg('SOS sent');
  }, [svc]);

  if (!supported) {
    return (
      <div className="p-4 bg-[#0D1B36] rounded-xl border border-red-800 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-red-400 text-sm font-bold">Web Bluetooth Not Available</p>
        </div>
        <p className="text-[#7B9CC4] text-xs">
          Web Bluetooth requires <strong className="text-[#E8EEF7]">Chrome / Edge / Electron</strong> running in a secure context (HTTPS or localhost).
          It is not available in Firefox or Safari.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#0D1B36] rounded-xl border border-[rgba(91,141,217,0.2)] space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-gray-600'}`} />
          <div>
            <p className="text-[#E8EEF7] font-bold text-sm uppercase tracking-widest">BLE Mesh — Central</p>
            <p className="text-[#7B9CC4] text-xs">
              {connected ? `Connected to ${device?.name ?? device?.id}` : 'Scan to connect to a nearby MeshNet node'}
            </p>
          </div>
        </div>
        {connected && (
          <button
            onClick={handleDisconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 flex gap-2 items-start">
          <span className="text-red-400 shrink-0">⚠</span>
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {/* Last message */}
      {lastMsg && (
        <div className="rounded-lg bg-[#132B5A] p-2 flex gap-2 items-center">
          <span className="text-green-400 shrink-0 text-xs">▶</span>
          <p className="text-[#7B9CC4] text-xs font-mono">{lastMsg}</p>
        </div>
      )}

      {/* Emergency queue banner */}
      {emergencyQueue > 0 && (
        <div className="rounded-lg border border-amber-700 bg-amber-900/20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 shrink-0 text-xs">⏳</span>
            <p className="text-amber-300 text-xs font-bold">
              {emergencyQueue} emergency packet{emergencyQueue > 1 ? 's' : ''} queued for BLE
            </p>
          </div>
          <span className="text-[10px] text-amber-400 font-mono">auto-flush on connect</span>
        </div>
      )}

      {/* Connected state */}
      {connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-900/20 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📱</span>
              <div>
                <p className="text-white font-semibold text-sm">{device?.name ?? 'MeshNet Node'}</p>
                <p className="text-gray-400 text-xs font-mono">{device?.id}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-green-800 space-y-1">
              <p className="text-green-400 text-xs">✓ GATT connected — receiving mesh messages</p>
              <p className="text-green-400 text-xs">✓ Auto-flushing queued emergency packets</p>
            </div>
          </div>
          <button
            onClick={handleSendSos}
            className="w-full bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-bold transition-colors"
          >
            🆘 Send SOS via BLE
          </button>
        </div>
      ) : (
        /* Disconnected state */
        <div className="space-y-3">
          <button
            onClick={handleScan}
            disabled={scanning || connecting}
            className="w-full bg-[#F97316] hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {scanning || connecting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {scanning ? 'Opening picker…' : 'Connecting…'}
              </>
            ) : (
              '📡 Scan for Nearby MeshNet Nodes'
            )}
          </button>

          {emergencyQueue > 0 && (
            <p className="text-amber-400 text-[10px] font-mono text-center">
              Connect to a MeshNet device to flush {emergencyQueue} queued emergency packet{emergencyQueue > 1 ? 's' : ''}
            </p>
          )}

          {/* How-it-works callout */}
          <div className="rounded-lg bg-[#132B5A] p-4 space-y-2">
            <p className="text-[#E8EEF7] text-xs font-bold uppercase tracking-widest">How it works</p>
            <ol className="space-y-2 list-none">
              {[
                'Victim\'s phone runs the MeshNet Capacitor app (Android/iOS) — it advertises the MeshNet GATT service over BLE.',
                'Tap "Scan" above — your browser shows only phones advertising that service.',
                'Select the phone. This desktop becomes a BLE Central, connects to the phone\'s GATT server, and registers it as a relay node.',
                'Messages and SOS alerts are relayed bidirectionally over the BLE link.',
              ].map((step, i) => (
                <li key={step.slice(0, 24)} className="flex gap-3">
                  <span className="text-[#F97316] font-bold shrink-0 text-xs">{i + 1}.</span>
                  <span className="text-[#7B9CC4] text-xs">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-[rgba(91,141,217,0.15)] bg-[rgba(91,141,217,0.05)] p-3 flex gap-2 items-start">
            <span className="text-[#7B9CC4] shrink-0 text-xs">ℹ</span>
            <p className="text-[#7B9CC4] text-xs">
              <strong className="text-[#E8EEF7]">BLE range: ~10–30 m.</strong> For longer range, use the{' '}
              <strong className="text-[#E8EEF7]">Hotspot</strong> tab — phones within Wi-Fi range (~50 m) join automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
