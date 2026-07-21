/**
 * Native Feature Fallback Utility
 * 
 * Provides graceful degradation when native features are unavailable
 * (e.g., running in browser vs native mobile app)
 */

import { Capacitor } from '@capacitor/core';

export interface NativeFeatureResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isNative: boolean;
}

/**
 * Execute a native function with fallback to browser/web implementation
 */
export async function withNativeFallback<T>(
  nativeFn: () => Promise<T>,
  webFallbackFn: () => Promise<T>,
  featureName: string
): Promise<NativeFeatureResult<T>> {
  const isNative = Capacitor.isNativePlatform();

  try {
    if (isNative) {
      const data = await nativeFn();
      return { success: true, data, isNative: true };
    } else {
      const data = await webFallbackFn();
      return { success: true, data, isNative: false };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[NativeFallback] ${featureName} failed:`, errorMessage);
    
    // Try web fallback if native failed
    if (isNative) {
      try {
        const data = await webFallbackFn();
        console.warn(`[NativeFallback] ${featureName} native failed, using web fallback`);
        return { success: true, data, isNative: false };
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return { 
          success: false, 
          error: `${featureName} unavailable: ${errorMessage}. Web fallback also failed: ${fallbackMessage}`,
          isNative: false 
        };
      }
    }
    
    return { 
      success: false, 
      error: `${featureName} unavailable: ${errorMessage}`,
      isNative: false 
    };
  }
}

/**
 * Check if a native feature is available
 */
export function isNativeFeatureAvailable(featureName: string): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  // Check if the plugin is registered
  const plugins = (window as any).capacitor?.Plugins;
  if (!plugins) {
    return false;
  }

  // Check for specific plugin
  switch (featureName) {
    case 'bluetooth':
      return !!plugins.BluetoothLe || !!plugins.MeshDiscovery;
    case 'geolocation':
      return !!plugins.Geolocation;
    case 'network':
      return !!plugins.Network;
    case 'local-notifications':
      return !!plugins.LocalNotifications;
    default:
      return false;
  }
}

/**
 * Get user-friendly message for unavailable feature
 */
export function getFeatureUnavailableMessage(featureName: string): string {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  if (!isNative) {
    return `${featureName} requires native mobile app. Some features may be limited in browser mode.`;
  }

  if (platform === 'android') {
    return `${featureName} requires Android permissions. Please check app settings.`;
  }

  if (platform === 'ios') {
    return `${featureName} requires iOS permissions. Please check app settings.`;
  }

  return `${featureName} is not available on this platform.`;
}

/**
 * Wrap async function with error handling and logging
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string
): Promise<NativeFeatureResult<T>> {
  try {
    const data = await fn();
    return { success: true, data, isNative: Capacitor.isNativePlatform() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SafeAsync] ${context} failed:`, errorMessage);
    return { 
      success: false, 
      error: `${context} failed: ${errorMessage}`,
      isNative: Capacitor.isNativePlatform() 
    };
  }
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/**
 * Check if device has required hardware
 */
export function hasRequiredHardware(): {
  bluetooth: boolean;
  location: boolean;
  network: boolean;
} {
  // This is a basic check - in production, use Capacitor device plugin
  return {
    bluetooth: 'bluetooth' in navigator || Capacitor.isNativePlatform(),
    location: 'geolocation' in navigator || Capacitor.isNativePlatform(),
    network: 'navigator' in window && 'onLine' in navigator || Capacitor.isNativePlatform(),
  };
}
