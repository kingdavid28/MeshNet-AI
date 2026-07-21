/**
 * Permission Request Utility for Capacitor Android
 * 
 * Handles runtime permission requests for location, Bluetooth, and notifications
 * required for MeshNet functionality on mobile devices.
 */

import { Capacitor } from '@capacitor/core';

export interface PermissionStatus {
  granted: boolean;
  denied: boolean;
  neverAskAgain: boolean;
}

export interface PermissionResult {
  location: PermissionStatus;
  bluetooth: PermissionStatus;
  notifications: PermissionStatus;
}

/**
 * Check if running on native platform (Android/iOS)
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Request location permissions (fine and coarse)
 * Required for BLE scanning on Android < 12
 */
export async function requestLocationPermissions(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    // Browser/Web: location permissions handled by browser
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    // For Capacitor, we use the native bridge
    // This is a simplified version - in production, use @capacitor/geolocation
    const result = await (window as any).capacitor.Plugins.Permissions.request({
      name: 'LOCATION',
    });
    
    return {
      granted: result.state === 'granted',
      denied: result.state === 'denied',
      neverAskAgain: result.state === 'never_ask_again',
    };
  } catch (error) {
    console.error('[Permissions] Location request failed:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request Bluetooth permissions (scan, advertise, connect)
 * Required for BLE functionality on Android 12+
 */
export async function requestBluetoothPermissions(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    // Browser: Web Bluetooth API has its own permission model
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    // Request BLUETOOTH_SCAN permission
    const scanResult = await (window as any).capacitor.Plugins.Permissions.request({
      name: 'BLUETOOTH_SCAN',
    });

    // Request BLUETOOTH_ADVERTISE permission
    const advertiseResult = await (window as any).capacitor.Plugins.Permissions.request({
      name: 'BLUETOOTH_ADVERTISE',
    });

    // Request BLUETOOTH_CONNECT permission
    const connectResult = await (window as any).capacitor.Plugins.Permissions.request({
      name: 'BLUETOOTH_CONNECT',
    });

    const allGranted = 
      scanResult.state === 'granted' &&
      advertiseResult.state === 'granted' &&
      connectResult.state === 'granted';

    return {
      granted: allGranted,
      denied: !allGranted,
      neverAskAgain: 
        scanResult.state === 'never_ask_again' ||
        advertiseResult.state === 'never_ask_again' ||
        connectResult.state === 'never_ask_again',
    };
  } catch (error) {
    console.error('[Permissions] Bluetooth request failed:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request notification permissions (Android 13+)
 * Required for emergency alerts and background notifications
 */
export async function requestNotificationPermissions(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    // Browser: Notification API handled by browser
    return { granted: true, denied: false, neverAskAgain: false };
  }

  try {
    const result = await (window as any).capacitor.Plugins.Permissions.request({
      name: 'POST_NOTIFICATIONS',
    });

    return {
      granted: result.state === 'granted',
      denied: result.state === 'denied',
      neverAskAgain: result.state === 'never_ask_again',
    };
  } catch (error) {
    console.error('[Permissions] Notification request failed:', error);
    return { granted: false, denied: true, neverAskAgain: false };
  }
}

/**
 * Request all required permissions for MeshNet functionality
 */
export async function requestAllPermissions(): Promise<PermissionResult> {
  const location = await requestLocationPermissions();
  const bluetooth = await requestBluetoothPermissions();
  const notifications = await requestNotificationPermissions();

  return { location, bluetooth, notifications };
}

/**
 * Check if all required permissions are granted
 */
export function areAllPermissionsGranted(result: PermissionResult): boolean {
  return result.location.granted && result.bluetooth.granted && result.notifications.granted;
}

/**
 * Get user-friendly error message for denied permissions
 */
export function getPermissionErrorMessage(result: PermissionResult): string {
  const missing: string[] = [];

  if (!result.location.granted) {
    missing.push('Location');
  }
  if (!result.bluetooth.granted) {
    missing.push('Bluetooth');
  }
  if (!result.notifications.granted) {
    missing.push('Notifications');
  }

  if (missing.length === 0) return '';

  return `Required permissions denied: ${missing.join(', ')}. Please enable them in app settings for full MeshNet functionality.`;
}
