/**
 * Native BLE Service using @capacitor-community/bluetooth-le
 * 
 * Provides reliable BLE functionality on Android/iOS through Capacitor
 * This supplements the Web Bluetooth API for better mobile support.
 * 
 * API Documentation: https://github.com/capacitor-community/bluetooth-le
 */

import { BleClient, ScanResult, BleDevice } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

export interface NativeBLEDevice {
  deviceId: string;
  name?: string;
  rssi?: number;
}

export interface NativeBLEScanOptions {
  serviceUuids?: string[];
  allowDuplicates?: boolean;
  callback?: (device: NativeBLEDevice) => void;
}

/**
 * Check if native BLE is available
 */
export function isNativeBLEAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Initialize native BLE client
 * Requests location permission on Android and Bluetooth permission on iOS
 */
export async function initializeNativeBLE(): Promise<boolean> {
  if (!isNativeBLEAvailable()) {
    console.log('[NativeBLE] Not on native platform, using Web Bluetooth');
    return false;
  }

  try {
    await BleClient.initialize();
    console.log('[NativeBLE] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[NativeBLE] Initialization failed:', error);
    return false;
  }
}

/**
 * Check if Bluetooth is enabled
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  if (!isNativeBLEAvailable()) {
    return true; // Browser assumes Bluetooth is available
  }

  try {
    return await BleClient.isEnabled();
  } catch (error) {
    console.error('[NativeBLE] Check enabled failed:', error);
    return false;
  }
}

/**
 * Request user to enable Bluetooth (Android only)
 */
export async function requestEnableBluetooth(): Promise<void> {
  if (!isNativeBLEAvailable()) {
    return;
  }

  try {
    await BleClient.requestEnable();
  } catch (error) {
    console.error('[NativeBLE] Request enable failed:', error);
    throw error;
  }
}

/**
 * Start BLE scanning for MeshNet devices
 */
export async function startNativeBLEScan(
  options: NativeBLEScanOptions = {}
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    const scanOptions: any = {};
    
    if (options.serviceUuids && options.serviceUuids.length > 0) {
      scanOptions.services = options.serviceUuids;
    }
    
    if (options.allowDuplicates !== undefined) {
      scanOptions.allowDuplicatesKey = options.allowDuplicates;
    }

    await BleClient.requestLEScan(scanOptions, (result: ScanResult) => {
      const device: NativeBLEDevice = {
        deviceId: result.device.deviceId,
        name: result.device.name,
        rssi: result.rssi,
      };

      if (options.callback) {
        options.callback(device);
      }
    });

    console.log('[NativeBLE] Scan started');
  } catch (error) {
    console.error('[NativeBLE] Scan failed:', error);
    throw error;
  }
}

/**
 * Stop BLE scanning
 */
export async function stopNativeBLEScan(): Promise<void> {
  if (!isNativeBLEAvailable()) {
    return;
  }

  try {
    await BleClient.stopLEScan();
    console.log('[NativeBLE] Scan stopped');
  } catch (error) {
    console.error('[NativeBLE] Stop scan failed:', error);
  }
}

/**
 * Connect to a BLE device
 */
export async function connectNativeBLEDevice(
  deviceId: string,
  onDisconnect?: (deviceId: string) => void
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    await BleClient.connect(deviceId, onDisconnect);
    console.log('[NativeBLE] Connected to device:', deviceId);
  } catch (error) {
    console.error('[NativeBLE] Connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from a BLE device
 */
export async function disconnectNativeBLEDevice(deviceId: string): Promise<void> {
  if (!isNativeBLEAvailable()) {
    return;
  }

  try {
    await BleClient.disconnect(deviceId);
    console.log('[NativeBLE] Disconnected from device:', deviceId);
  } catch (error) {
    console.error('[NativeBLE] Disconnect failed:', error);
  }
}

/**
 * Read a characteristic value
 */
export async function readCharacteristic(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string
): Promise<DataView> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    const result = await BleClient.read(deviceId, serviceUuid, characteristicUuid);
    return result;
  } catch (error) {
    console.error('[NativeBLE] Read characteristic failed:', error);
    throw error;
  }
}

/**
 * Write to a characteristic
 */
export async function writeCharacteristic(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string,
  value: DataView
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    await BleClient.write(deviceId, serviceUuid, characteristicUuid, value);
    console.log('[NativeBLE] Write successful');
  } catch (error) {
    console.error('[NativeBLE] Write failed:', error);
    throw error;
  }
}

/**
 * Write to a characteristic without response
 */
export async function writeCharacteristicWithoutResponse(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string,
  value: DataView
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    await BleClient.writeWithoutResponse(deviceId, serviceUuid, characteristicUuid, value);
    console.log('[NativeBLE] Write without response successful');
  } catch (error) {
    console.error('[NativeBLE] Write without response failed:', error);
    throw error;
  }
}

/**
 * Get connected devices
 */
export async function getConnectedDevices(serviceUuids?: string[]): Promise<BleDevice[]> {
  if (!isNativeBLEAvailable()) {
    return [];
  }

  try {
    const services = serviceUuids || [];
    const devices = await BleClient.getConnectedDevices(services);
    return devices;
  } catch (error) {
    console.error('[NativeBLE] Get connected devices failed:', error);
    return [];
  }
}

/**
 * Get services of a connected device
 */
export async function getDeviceServices(deviceId: string): Promise<any[]> {
  if (!isNativeBLEAvailable()) {
    return [];
  }

  try {
    const services = await BleClient.getServices(deviceId);
    return services;
  } catch (error) {
    console.error('[NativeBLE] Get services failed:', error);
    return [];
  }
}

/**
 * Start notifications for a characteristic
 */
export async function startNotifications(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string,
  callback: (value: DataView) => void
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    throw new Error('Native BLE not available on this platform');
  }

  try {
    await BleClient.startNotifications(deviceId, serviceUuid, characteristicUuid, callback);
    console.log('[NativeBLE] Notifications started');
  } catch (error) {
    console.error('[NativeBLE] Start notifications failed:', error);
    throw error;
  }
}

/**
 * Stop notifications for a characteristic
 */
export async function stopNotifications(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string
): Promise<void> {
  if (!isNativeBLEAvailable()) {
    return;
  }

  try {
    await BleClient.stopNotifications(deviceId, serviceUuid, characteristicUuid);
    console.log('[NativeBLE] Notifications stopped');
  } catch (error) {
    console.error('[NativeBLE] Stop notifications failed:', error);
  }
}
