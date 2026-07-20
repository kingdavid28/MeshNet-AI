/**
 * BLE Module for MeshNet Credential Exchange
 * 
 * This module handles BLE advertising for the MeshNet desktop app.
 * It advertises the MeshNet service with hotspot credentials (SSID + password).
 * 
 * Phone Flow:
 * 1. Phone scans for BLE devices with MeshNet service UUID
 * 2. Phone connects to BLE peripheral
 * 3. Phone reads credentials characteristic
 * 4. Phone displays credentials for manual WiFi connection
 */

const noble = require('@abandonware/noble');

const MESHNET_SERVICE_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';
const CREDENTIALS_CHARACTERISTIC_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';

class BLEModule {
  constructor() {
    this.peripheral = null;
    this.service = null;
    this.characteristic = null;
    this.advertising = false;
    this.credentials = null;
  }

  /**
   * Initialize BLE module
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      noble.on('stateChange', (state) => {
        console.log('[BLE] State changed to:', state);
        if (state === 'poweredOn') {
          resolve();
        } else if (state === 'poweredOff') {
          reject(new Error('Bluetooth is powered off'));
        }
      });

      noble.on('error', (error) => {
        console.error('[BLE] Error:', error);
      });
    });
  }

  /**
   * Start advertising MeshNet service with credentials
   */
  async startAdvertising(credentials) {
    try {
      console.log('[BLE] Starting advertising with credentials:', { ssid: credentials.ssid, password: '***' });
      this.credentials = credentials;

      // Stop any existing advertising
      if (this.advertising) {
        await this.stopAdvertising();
      }

      // Create service and characteristic
      const service = new noble.Service({
        uuid: MESHNET_SERVICE_UUID,
        characteristics: [
          new noble.Characteristic({
            uuid: CREDENTIALS_CHARACTERISTIC_UUID,
            properties: ['read'],
            value: this.encodeCredentials(credentials),
            onReadRequest: (offset, callback) => {
              console.log('[BLE] Credentials read request');
              const data = this.encodeCredentials(credentials);
              callback(this.Result.SUCCESS, data.slice(offset, offset + 20));
            }
          })
        ]
      });

      // Start advertising
      noble.startAdvertising(service, (error) => {
        if (error) {
          console.error('[BLE] Advertising error:', error);
          throw error;
        }
        console.log('[BLE] Advertising started');
        this.advertising = true;
        this.service = service;
      });

      return { success: true };
    } catch (error) {
      console.error('[BLE] Failed to start advertising:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising() {
    try {
      if (this.advertising) {
        noble.stopAdvertising(() => {
          console.log('[BLE] Advertising stopped');
          this.advertising = false;
          this.service = null;
        });
      }
      return { success: true };
    } catch (error) {
      console.error('[BLE] Failed to stop advertising:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Encode credentials as JSON bytes
   */
  encodeCredentials(credentials) {
    const json = JSON.stringify({
      ssid: credentials.ssid,
      password: credentials.password,
      version: '1.0'
    });
    return Buffer.from(json, 'utf-8');
  }

  /**
   * Check if currently advertising
   */
  isAdvertising() {
    return this.advertising;
  }
}

module.exports = new BLEModule();
