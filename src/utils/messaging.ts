/**
 * MeshNet-AI — messaging.ts
 * ==========================
 * Offline Emergency Messaging Engine ported from Python to TypeScript
 * 
 * Provides:
 * - BroadcastEngine: hop-by-hop SOS packet propagation simulation
 * - HandshakeLogger: encrypted JSON log of every successful route
 * - XOR stream cipher with base64 encoding for offline encryption
 */

// ── XOR stream cipher (lightweight offline obfuscation) ──────────────────────
// Key is stored in the app; in production this would be derived from a device
// hardware identifier or a user-supplied passphrase via PBKDF2.
const CIPHER_KEY = 'MeshNetAI-OfflineKey-2025';

function xorCipher(data: Uint8Array, key: string): Uint8Array {
  const keyBytes = new TextEncoder().encode(key);
  const keyLen = keyBytes.length;
  const result = new Uint8Array(data.length);
  
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBytes[i % keyLen];
  }
  
  return result;
}

export function encryptPayload(plaintext: string): string {
  const raw = new TextEncoder().encode(plaintext);
  const ciphered = xorCipher(raw, CIPHER_KEY);
  const encoded = btoa(String.fromCodePoint(...ciphered));
  return encoded;
}

export function decryptPayload(ciphertext: string): string {
  const decoded = atob(ciphertext);
  const raw = new Uint8Array(decoded.split('').map(c => c.codePointAt(0)!));
  const deciphered = xorCipher(raw, CIPHER_KEY);
  return new TextDecoder().decode(deciphered);
}

// ── Packet dataclass ──────────────────────────────────────────────────────────

export interface SOSPacket {
  packet_id: string;
  scenario: string;
  message: string;
  origin_node: string;
  path: string[];
  created_at: string;
}

export interface SOSPacketDict {
  packet_id: string;
  scenario: string;
  message: string;
  origin_node: string;
  path: string[];
  created_at: string;
}

export class SOSPacket {
  constructor(
    public scenario: string,
    public message: string,
    public origin_node: string,
    public path: string[]
  ) {
    this.packet_id = `SOS-${Date.now()}`;
    this.scenario = scenario;
    this.message = message;
    this.origin_node = origin_node;
    this.path = [...path];
    this.created_at = new Date().toISOString();
  }

  toDict(): SOSPacketDict {
    return {
      packet_id: this.packet_id,
      scenario: this.scenario,
      message: this.message,
      origin_node: this.origin_node,
      path: this.path,
      created_at: this.created_at,
    };
  }
}

// ── Broadcast engine ──────────────────────────────────────────────────────────

export type HopCallback = (hopIndex: number, nodeId: string, status: 'TX' | 'RX') => void;
export type CompleteCallback = (packet: SOSPacket, success: boolean) => void;

export class BroadcastEngine {
  static readonly HOP_DELAY_SECONDS = 1.0; // propagation delay per hop

  private readonly _logger: HandshakeLogger;
  private _active = false;
  private _abortController: AbortController | null = null;

  constructor(logger: HandshakeLogger) {
    this._logger = logger;
  }

  /**
   * Launch the propagation simulation.
   * Returns a promise that resolves when broadcast completes.
   */
  async broadcast(
    packet: SOSPacket,
    onHop?: HopCallback,
    onComplete?: CompleteCallback
  ): Promise<void> {
    this._abortController = new AbortController();
    this._active = true;
    let success = true;

    console.log(`[MSG] Broadcasting ${packet.packet_id} over ${packet.path.length} hops.`);

    try {
      for (let idx = 0; idx < packet.path.length; idx++) {
        const nodeId = packet.path[idx];

        if (this._abortController.signal.aborted) {
          console.warn(`[MSG] Broadcast aborted at hop ${idx}.`);
          success = false;
          break;
        }

        // ── TX event ──────────────────────────────────────────────────────
        if (onHop) {
          onHop(idx, nodeId, 'TX');
        }
        console.debug(`[MSG] Hop ${idx} → TX to ${nodeId}`);

        // ── Propagation delay ─────────────────────────────────────────────
        await this.delay(BroadcastEngine.HOP_DELAY_SECONDS * 1000);

        if (this._abortController.signal.aborted) {
          success = false;
          break;
        }

        // ── RX event ──────────────────────────────────────────────────────
        if (onHop) {
          onHop(idx, nodeId, 'RX');
        }
        console.debug(`[MSG] Hop ${idx} → RX at ${nodeId}`);
      }

      // ── Persist result ────────────────────────────────────────────────────
      if (success) {
        await this._logger.append(packet);
      }
    } catch (error) {
      console.error('[MSG] Broadcast error:', error);
      success = false;
    }

    // ── Completion callback ───────────────────────────────────────────────
    if (onComplete) {
      onComplete(packet, success);
    }

    this._active = false;
    console.log(`[MSG] Broadcast ${packet.packet_id} finished. success=${success}`);
  }

  abort(): void {
    if (this._abortController) {
      this._abortController.abort();
      console.log('[MSG] Broadcast abort requested.');
    }
  }

  isActive(): boolean {
    return this._active;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Handshake logger ──────────────────────────────────────────────────────────

export interface LogRecord {
  ts: string;
  payload: string;
}

export class HandshakeLogger {
  private readonly _path: string;
  private _lock = Promise.resolve(); // Simple promise-based lock

  constructor(logPath: string = 'handshake_log.enc') {
    this._path = logPath;
  }

  /**
   * Encrypt and append packet to the handshake log.
   */
  async append(packet: SOSPacket): Promise<void> {
    await this._lock;
    const lockPromise = (async () => {
      try {
        const records = await this.loadRaw();
        const plaintext = JSON.stringify(packet.toDict());
        records.push({
          ts: new Date().toISOString(),
          payload: encryptPayload(plaintext),
        });
        await this.saveRaw(records);
        console.log(`[LOG] Appended record for ${packet.packet_id}.`);
      } catch (error_) {
        console.error('[LOG] Failed to append record:', error_);
        throw error_;
      }
    })();
    this._lock = lockPromise;
    await lockPromise;
  }

  /**
   * Decrypt and return all stored packet dicts.
   */
  async readAll(): Promise<SOSPacketDict[]> {
    await this._lock;
    const records = await this.loadRaw();

    const results: SOSPacketDict[] = [];
    for (const rec of records) {
      try {
        const plain = decryptPayload(rec.payload);
        results.push(JSON.parse(plain));
      } catch (error_) {
        console.warn('[LOG] Failed to decrypt record:', error_);
      }
    }
    return results;
  }

  /**
   * Wipe the entire log file (irreversible).
   */
  async clear(): Promise<void> {
    await this._lock;
    const lockPromise = (async () => {
      try {
        await this.saveRaw([]);
        console.log('[LOG] Handshake log cleared.');
      } catch (error_) {
        console.error('[LOG] Failed to clear log:', error_);
        throw error_;
      }
    })();
    this._lock = lockPromise;
    await lockPromise;
  }

  /**
   * Return the number of stored records without decrypting them.
   */
  async recordCount(): Promise<number> {
    await this._lock;
    const records = await this.loadRaw();
    return records.length;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async loadRaw(): Promise<LogRecord[]> {
    try {
      // For Capacitor/React Native, we'd use File API or Capacitor Storage
      // For now, using localStorage as a fallback
      const data = localStorage.getItem(this._path);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error_) {
      console.error('[LOG] Failed to load log:', error_);
      return [];
    }
  }

  private async saveRaw(records: LogRecord[]): Promise<void> {
    try {
      // For Capacitor/React Native, we'd use File API or Capacitor Storage
      // For now, using localStorage as a fallback
      localStorage.setItem(this._path, JSON.stringify(records, null, 2));
    } catch (error_) {
      console.error('[LOG] Failed to save log:', error_);
      throw error_;
    }
  }
}

// ── Export singleton instance ───────────────────────────────────────────────

export const handshakeLogger = new HandshakeLogger();
export const broadcastEngine = new BroadcastEngine(handshakeLogger);
