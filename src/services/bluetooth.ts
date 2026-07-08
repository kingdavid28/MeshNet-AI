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

export type MeshMessageType = 'register' | 'data' | 'route' | 'heartbeat' | 'sos' | 'emergency';

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

export interface EmergencyPacket {
  nodeId:        string;        // 6-byte printable id
  category:      string;        // war_zone | flood | earthquake | medical | fire | sos | evacuation
  lat:           number | null;
  lng:           number | null;
  battery:       number;        // 0-100
  timestamp:     number;        // epoch ms
  message?:      string;        // short, ≤ 100 bytes UTF-8
}

type EventMap = {
  connected:        BLEDevice;
  disconnected:     BLEDevice;
  deviceRegistered: MeshMessage;
  dataReceived:     MeshMessage;
  routeUpdate:      MeshMessage;
  heartbeat:        MeshMessage;
  sos:              MeshMessage;
  emergency:        MeshMessage;
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
  private _reconnectAttempts = 0;
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
   * Robust: retries GATT connect with exponential backoff, times out each step,
   * and auto-reconnects on unexpected disconnect up to MAX_RECONNECT_ATTEMPTS.
   */
  async connectToDevice(device: BLEDevice): Promise<boolean> {
    if (this.nativeDevice?.id !== device.id) {
      console.error('[BLE] Device not found — call discoverDevices() first');
      return false;
    }
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[BLE] Connecting to ${device.name ?? device.id} (attempt ${attempt + 1}/${MAX_RETRIES})`);

        // GATT connect with 10 s timeout
        this.server = await this.withTimeout(
          this.nativeDevice.gatt?.connect() ?? Promise.reject(new Error('GATT unavailable')),
          10_000,
          'GATT connect timeout'
        );
        if (!this.server) throw new Error('GATT server unavailable');

        const service = await this.withTimeout(
          this.server.getPrimaryService(MESH_SERVICE_UUID),
          8_000,
          'Get primary service timeout'
        );
        this.dataChar = await this.withTimeout(
          service.getCharacteristic(MESH_DATA_CHAR_UUID),
          8_000,
          'Get data characteristic timeout'
        );

        await this.withTimeout(
          this.dataChar.startNotifications(),
          8_000,
          'Start notifications timeout'
        );
        this.dataChar.addEventListener('characteristicvaluechanged', this.boundOnData);

        this._connected = true;
        this._reconnectAttempts = 0;
        console.log('[BLE] Connected — flushing', this.messageQueue.length, 'queued messages');
        this.emit('connected', device);

        await this.flushQueue();
        await this.sendRegistration();
        return true;
      } catch (error) {
        console.warn(`[BLE] Connection attempt ${attempt + 1} failed:`, error);
        this.cleanup();
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * (2 ** attempt);
          await this.sleep(delay);
        }
      }
    }
    console.error('[BLE] Connection failed after all retries');
    return false;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(reason)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  get pendingCount(): number { return this.messageQueue.length; }

  // ── Emergency packet API ───────────────────────────────────────────────────
  // Compact binary format for SOS over BLE when Wi-Fi / hotspot is unavailable.
  // Header (fixed 21 bytes) + optional short message (≤100 bytes UTF-8).
  // Header layout:
  //   0  : version (4 bits) + type (4 bits)   — 0x11 = v1 emergency
  //   1  : category id (0-15)
  //   2  : flags (bit 0 = has location, bit 1 = has message, bit 2 = has battery)
  // 3-8  : nodeId (6 ASCII bytes, space-padded)
  // 9-12 : lat  (int32 LE, scaled 1e6, 0x7FFFFFFF if null)
  // 13-16: lng  (int32 LE, scaled 1e6, 0x7FFFFFFF if null)
  //   17 : battery 0-100
  // 18-21: timestamp (uint32 LE, epoch seconds)
  // 22-23: message length (uint16 LE)
  // 24+  : message UTF-8 bytes

  static encodeEmergencyPacket(packet: EmergencyPacket): ArrayBuffer {
    const CATEGORY_IDS: Record<string, number> = {
      war_zone: 0, sos: 1, medical: 2, fire: 3, evacuation: 4,
      flood: 5, earthquake: 6,
    };
    const categoryId = CATEGORY_IDS[packet.category] ?? 1;
    const hasLocation = packet.lat != null && packet.lng != null;
    const hasMessage = (packet.message?.length ?? 0) > 0;
    const messageBytes = hasMessage ? new TextEncoder().encode(packet.message!.slice(0, 100)) : new Uint8Array(0);

    const flags = (hasLocation ? 0x01 : 0) | (hasMessage ? 0x02 : 0) | (packet.battery > 0 ? 0x04 : 0);
    const nodeId = packet.nodeId.slice(-6).padEnd(6, ' ').slice(0, 6);
    const nodeBytes = new TextEncoder().encode(nodeId);

    const lat = hasLocation ? Math.round(packet.lat! * 1_000_000) : 0x7FFFFFFF;
    const lng = hasLocation ? Math.round(packet.lng! * 1_000_000) : 0x7FFFFFFF;
    const ts = Math.floor(packet.timestamp / 1000);
    const battery = Math.max(0, Math.min(100, Math.round(packet.battery)));

    const buf = new ArrayBuffer(21 + messageBytes.length);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    dv.setUint8(0, 0x11);                 // v1 + emergency type
    dv.setUint8(1, categoryId);
    dv.setUint8(2, flags);
    u8.set(nodeBytes, 3);
    dv.setInt32(9, lat, true);
    dv.setInt32(13, lng, true);
    dv.setUint8(17, battery);
    dv.setUint32(18, ts, true);
    dv.setUint16(22, messageBytes.length, true);
    u8.set(messageBytes, 24);
    return buf;
  }

  static decodeEmergencyPacket(buffer: ArrayBufferLike): EmergencyPacket {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const CATEGORY_NAMES = ['war_zone', 'sos', 'medical', 'fire', 'evacuation', 'flood', 'earthquake'];
    const categoryId = dv.getUint8(1);
    const flags = dv.getUint8(2);
    const nodeId = new TextDecoder().decode(u8.slice(3, 9)).trimEnd();
    const latRaw = dv.getInt32(9, true);
    const lngRaw = dv.getInt32(13, true);
    const hasLocation = (flags & 0x01) !== 0;
    const hasMessage = (flags & 0x02) !== 0;
    const lat = hasLocation && latRaw !== 0x7FFFFFFF ? latRaw / 1_000_000 : null;
    const lng = hasLocation && lngRaw !== 0x7FFFFFFF ? lngRaw / 1_000_000 : null;
    const battery = dv.getUint8(17);
    const ts = dv.getUint32(18, true) * 1000;
    const msgLen = dv.getUint16(22, true);
    const message = hasMessage && msgLen > 0
      ? new TextDecoder().decode(u8.slice(24, 24 + msgLen))
      : undefined;

    return {
      nodeId,
      category: CATEGORY_NAMES[categoryId] ?? 'sos',
      lat,
      lng,
      battery,
      timestamp: ts,
      message,
    };
  }

  async sendEmergencyPacket(packet: EmergencyPacket): Promise<boolean> {
    const buf = BluetoothMeshService.encodeEmergencyPacket(packet);
    if (!this._connected || !this.dataChar) {
      this.messageQueue.push({
        type: 'emergency',
        deviceId: packet.nodeId,
        timestamp: packet.timestamp,
        payload: { packet },
      });
      return false;
    }
    try {
      await this.dataChar.writeValue(buf);
      return true;
    } catch (error) {
      console.error('[BLE] Emergency send failed, queuing:', error);
      this.messageQueue.push({
        type: 'emergency',
        deviceId: packet.nodeId,
        timestamp: packet.timestamp,
        payload: { packet },
      });
      return false;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async flushQueue(): Promise<void> {
    const pending = this.messageQueue.splice(0);
    for (const msg of pending) {
      if (msg.type === 'emergency' && msg.payload && (msg.payload as { packet?: EmergencyPacket }).packet) {
        const packet = (msg.payload as { packet: EmergencyPacket }).packet;
        await this.sendEmergencyPacket(packet);
      } else {
        await this.sendMeshMessage(msg);
      }
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
    const buffer = value.buffer;
    try {
      // Emergency packets use a compact binary header: high nibble = version 1,
      // low nibble = type 1 (emergency). 0x11 = v1 emergency.
      const firstByte = new DataView(buffer).getUint8(0);
      if ((firstByte & 0x0F) === 1 && (firstByte >> 4) === 1) {
        const packet = BluetoothMeshService.decodeEmergencyPacket(buffer);
        const msg: MeshMessage = {
          type: 'emergency',
          deviceId: packet.nodeId,
          timestamp: packet.timestamp,
          payload: packet,
        };
        this.emit('emergency', msg);
        return;
      }
      const msg = this.decode(buffer);
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
      case 'emergency': this.emit('emergency',        msg); break;
    }
  }

  private handleDisconnection(): void {
    console.log('[BLE] Device disconnected unexpectedly');
    const dev: BLEDevice = { id: this.nativeDevice?.id ?? '', name: this.nativeDevice?.name };
    this.cleanup();
    this.emit('disconnected', dev);

    // Auto-reconnect: emergency links must survive brief range drops.
    const MAX_RECONNECT_ATTEMPTS = 5;
    if (this.nativeDevice && this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this._reconnectAttempts++;
      const delay = Math.min(1_000 * (2 ** (this._reconnectAttempts - 1)), 8_000);
      console.log(`[BLE] Auto-reconnect attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
      setTimeout(() => {
        void this.connectToDevice(dev).then((ok) => {
          if (!ok) this._reconnectAttempts = 0; // stop retrying if explicit failure
        });
      }, delay);
    }
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
