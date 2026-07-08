// ─── BLE ROLE CLARIFICATION ──────────────────────────────────────────────────
// Web Bluetooth API (and Electron's Chromium renderer) supports ONLY the
// GATT Central role: scan → connect → read/write characteristics.
//
// GATT Peripheral role (advertise + accept connections) is NOT available in
// any browser. This is a deliberate W3C/browser security decision — advertising
// requires OS-level Bluetooth HCI access that browsers do not expose.
//
// For MeshNet this means:
//   • Desktop (Electron renderer): Central — scans for nearby victim phones.
//   • Victim phones: Must run the Capacitor native build (Android/iOS) which
//     uses @capacitor-community/bluetooth-le in Peripheral mode to advertise
//     the MeshNet GATT service. Chrome on Android also supports advertising
//     via the experimental Web Bluetooth Scanning API (flag-gated).
//
// Summary: BLE in this file = scan + connect only. Hotspot remains the primary
// auto-discovery channel; BLE is a supplementary direct-connect channel.
// ─────────────────────────────────────────────────────────────────────────────

// Must match MESH_SERVICE_UUID in MeshDiscoveryPlugin.kt and capacitor.config.ts.
// The Kotlin plugin advertises 0000FEED; the desktop Central must filter on the same UUID.
export const MESH_SERVICE_UUID      = '0000feed-0000-1000-8000-00805f9b34fb'; // NOSONAR
export const MESH_DATA_CHAR_UUID    = '0000fee1-0000-1000-8000-00805f9b34fb'; // notify + write
export const MESH_CONTROL_CHAR_UUID = '0000fee2-0000-1000-8000-00805f9b34fb'; // write-without-response

export type MeshMessageType = 'register' | 'data' | 'route' | 'heartbeat' | 'sos';

export interface MeshMessage {
  type: MeshMessageType;
  deviceId: string;
  timestamp: number;
  payload?: unknown;
}

export interface BLEDevice {
  id: string;
  name: string | undefined;
  rssi?: number;
}

type EventMap = {
  connected:        BLEDevice;
  disconnected:     BLEDevice;
  deviceRegistered: MeshMessage;
  dataReceived:     MeshMessage;
  routeUpdate:      MeshMessage;
  heartbeat:        MeshMessage;
  sos:              MeshMessage;
};

// ─── Typed mini event-emitter ─────────────────────────────────────────────────
class TypedEmitter<T extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof T, ((data: T[keyof T]) => void)[]>();

  on<K extends keyof T>(event: K, cb: (data: T[K]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb as (data: T[keyof T]) => void);
    this.listeners.set(event, list);
  }

  off<K extends keyof T>(event: K, cb: (data: T[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(cb as (data: T[keyof T]) => void);
    if (idx !== -1) list.splice(idx, 1);
  }

  protected emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

// ─── BLE Central service ──────────────────────────────────────────────────────
export class BluetoothMeshService extends TypedEmitter<EventMap> {
  private nativeDevice: (BluetoothDevice & { gatt?: BluetoothRemoteGATTServer }) | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private dataChar: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly messageQueue: MeshMessage[] = [];
  private _connected = false;
  private readonly boundOnDisconnect: () => void;
  private readonly boundOnData: (e: Event) => void;

  constructor() {
    super();
    this.boundOnDisconnect = this.handleDisconnection.bind(this);
    this.boundOnData       = this.handleData.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Opens the browser BLE device picker filtered to MeshNet service UUID.
   * Returns the chosen device or null if the user cancelled.
   *
   * NOTE: Must be called from a user-gesture handler (button click).
   */
  async discoverDevices(): Promise<BLEDevice[]> {
    if (!BluetoothMeshService.isSupported()) {
      console.warn('[BLE] Web Bluetooth not supported in this context');
      return [];
    }
    try {
      console.log('[BLE] Opening device picker…');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [MESH_SERVICE_UUID] }],
        optionalServices: [MESH_CONTROL_CHAR_UUID],
      });
      console.log('[BLE] Device selected:', device.name ?? device.id);
      this.nativeDevice = device;
      device.addEventListener('gattserverdisconnected', this.boundOnDisconnect);
      return [{ id: device.id, name: device.name }];
    } catch (error) {
      // DOMException: User cancelled the requestDevice() chooser → not an error
      if ((error as DOMException).name !== 'NotFoundError') {
        console.error('[BLE] Discovery error:', error);
      }
      return [];
    }
  }

  /**
   * Connect to a previously discovered device and set up GATT notifications.
   */
  async connectToDevice(device: BLEDevice): Promise<boolean> {
    if (this.nativeDevice?.id !== device.id) {
      console.error('[BLE] Device not found — call discoverDevices() first');
      return false;
    }
    try {
      console.log('[BLE] Connecting to', device.name ?? device.id);
      this.server = (await this.nativeDevice.gatt?.connect()) ?? null;
      if (!this.server) throw new Error('GATT server unavailable');

      const service  = await this.server.getPrimaryService(MESH_SERVICE_UUID);
      this.dataChar  = await service.getCharacteristic(MESH_DATA_CHAR_UUID);

      await this.dataChar.startNotifications();
      this.dataChar.addEventListener('characteristicvaluechanged', this.boundOnData);

      this._connected = true;
      console.log('[BLE] Connected — flushing', this.messageQueue.length, 'queued messages');
      this.emit('connected', device);

      await this.flushQueue();
      await this.sendRegistration();
      return true;
    } catch (error) {
      console.error('[BLE] Connection failed:', error);
      this.cleanup();
      return false;
    }
  }

  async sendMeshMessage(message: MeshMessage): Promise<void> {
    if (!this._connected || !this.dataChar) {
      this.messageQueue.push(message);
      return;
    }
    try {
      await this.dataChar.writeValue(this.encode(message));
    } catch (error) {
      console.error('[BLE] Send failed, queuing:', error);
      this.messageQueue.push(message);
    }
  }

  async disconnect(): Promise<void> {
    this.nativeDevice?.removeEventListener('gattserverdisconnected', this.boundOnDisconnect);
    this.dataChar?.removeEventListener('characteristicvaluechanged', this.boundOnData);
    if (this.server?.connected) this.server.disconnect();
    this.cleanup();
    console.log('[BLE] Disconnected');
  }

  get connected(): boolean { return this._connected; }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async flushQueue(): Promise<void> {
    const pending = this.messageQueue.splice(0);
    for (const msg of pending) {
      await this.sendMeshMessage(msg);
    }
  }

  private async sendRegistration(): Promise<void> {
    const deviceId = this.localDeviceId();
    await this.sendMeshMessage({ type: 'register', deviceId, timestamp: Date.now() });
    await this.registerWithBackend(deviceId);
  }

  private async registerWithBackend(deviceId: string): Promise<void> {
    try {
      const res = await fetch('http://localhost:4000/api/mesh/register', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mesh-Secret': localStorage.getItem('mesh-secret') ?? '',
        },
        body: JSON.stringify({
          id:      deviceId,
          label:   `BLE ${deviceId.slice(-6)}`,
          device:  'smartphone',
          role:    'peer',
          signal:  80,
          batteryPercentage: 100,
          bluetoothStatus: true,
          wifiStatus: false,
          os: null,
          lat: null,
          lng: null,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) console.log('[BLE] Registered with backend');
    } catch (error) {
      console.warn('[BLE] Backend registration failed (offline?):', error);
    }
  }

  private handleData(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    try {
      const msg = this.decode(value.buffer);
      this.dispatch(msg);
    } catch (error) {
      console.error('[BLE] Failed to parse incoming data:', error);
    }
  }

  private dispatch(msg: MeshMessage): void {
    switch (msg.type) {
      case 'register':  this.emit('deviceRegistered', msg); break;
      case 'data':      this.emit('dataReceived',     msg); break;
      case 'route':     this.emit('routeUpdate',      msg); break;
      case 'heartbeat': this.emit('heartbeat',        msg); break;
      case 'sos':       this.emit('sos',              msg); break;
    }
  }

  private handleDisconnection(): void {
    console.log('[BLE] Device disconnected unexpectedly');
    const dev: BLEDevice = { id: this.nativeDevice?.id ?? '', name: this.nativeDevice?.name };
    this.cleanup();
    this.emit('disconnected', dev);
  }

  private cleanup(): void {
    this._connected = false;
    this.server    = null;
    this.dataChar  = null;
  }

  private encode(msg: MeshMessage): ArrayBuffer {
    return new Uint8Array(new TextEncoder().encode(JSON.stringify(msg))).buffer;
  }

  private decode(buf: ArrayBufferLike): MeshMessage {
    return JSON.parse(new TextDecoder().decode(buf)) as MeshMessage;
  }

  private localDeviceId(): string {
    let id = localStorage.getItem('mesh-device-id');
    if (!id) {
      id = `ble-${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem('mesh-device-id', id);
    }
    return id;
  }

  // ── Static helpers ──────────────────────────────────────────────────────────

  /** Web Bluetooth is only available in secure contexts (HTTPS / Electron). */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }
}
