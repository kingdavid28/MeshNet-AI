"""
hotspot.py
────────────────────────────────────────────────────────────────────────────
Hotspot management module for MeshNet-AI Kivy application.

This module provides WiFi hotspot management functionality using plyer
for cross-platform hotspot control on Android devices.
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass
import threading
from kivy.clock import Clock


@dataclass
class HotspotConfig:
    """Hotspot configuration data structure."""
    ssid: str
    password: str
    security: str = "WPA2-PSK"
    channel: int = 6
    max_connections: int = 10


@dataclass
class HotspotStatus:
    """Hotspot status data structure."""
    is_active: bool
    ssid: Optional[str] = None
    connected_devices: int = 0
    ip_address: Optional[str] = None


class HotspotService:
    """
    WiFi hotspot service for managing emergency hotspot.
    
    Uses plyer for cross-platform hotspot control on Android.
    Provides manual hotspot setup instructions for Android 11+.
    """
    
    def __init__(self):
        self._current_config: Optional[HotspotConfig] = None
        self._is_active = False
        self._connected_devices = 0
        self._status_lock = threading.Lock()
        self._android_version = self._get_android_version()
        
    def _get_android_version(self) -> int:
        """Get Android version number."""
        try:
            from android import __version__ as android_version
            if isinstance(android_version, int):
                return android_version
            # Parse version string like "11.0.0"
            if isinstance(android_version, str):
                return int(android_version.split('.')[0])
        except Exception:
            pass
        return 10  # Default to Android 10
    
    def activate_hotspot(self, config: Optional[HotspotConfig] = None) -> Dict[str, Any]:
        """
        Activate WiFi hotspot.
        
        Args:
            config: Optional hotspot configuration
            
        Returns:
            Dictionary with success status and any error messages
        """
        if config:
            self._current_config = config
        elif not self._current_config:
            self._current_config = HotspotConfig(
                ssid="MeshNet-Emergency",
                password="12345678"
            )
        
        # Android 11+ requires manual hotspot setup
        if self._android_version >= 11:
            return {
                "success": False,
                "manual_required": True,
                "message": "Android 11+ requires manual hotspot setup in Settings",
                "instructions": self._get_manual_instructions()
            }
        
        try:
            from plyer import wifi
            
            # Try to activate hotspot using plyer
            wifi.enable()
            
            # Configure hotspot
            wifi.configure(
                ssid=self._current_config.ssid,
                password=self._current_config.password,
                security=self._current_config.security
            )
            
            with self._status_lock:
                self._is_active = True
            
            return {
                "success": True,
                "message": "Hotspot activated successfully"
            }
            
        except ImportError:
            # plyer not available, return mock success for testing
            with self._status_lock:
                self._is_active = True
            
            return {
                "success": True,
                "message": "Hotspot activated (mock mode - plyer not available)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to activate hotspot: {e}"
            }
    
    def deactivate_hotspot(self) -> Dict[str, Any]:
        """
        Deactivate WiFi hotspot.
        
        Returns:
            Dictionary with success status
        """
        try:
            from plyer import wifi
            
            wifi.disable()
            
            with self._status_lock:
                self._is_active = False
                self._connected_devices = 0
            
            return {
                "success": True,
                "message": "Hotspot deactivated successfully"
            }
            
        except ImportError:
            with self._status_lock:
                self._is_active = False
                self._connected_devices = 0
            
            return {
                "success": True,
                "message": "Hotspot deactivated (mock mode)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to deactivate hotspot: {e}"
            }
    
    def get_status(self) -> HotspotStatus:
        """
        Get current hotspot status.
        
        Returns:
            HotspotStatus object
        """
        with self._status_lock:
            return HotspotStatus(
                is_active=self._is_active,
                ssid=self._current_config.ssid if self._current_config else None,
                connected_devices=self._connected_devices
            )
    
    def is_active(self) -> bool:
        """Check if hotspot is active."""
        with self._status_lock:
            return self._is_active
    
    def get_config(self) -> Optional[HotspotConfig]:
        """Get current hotspot configuration."""
        return self._current_config
    
    def update_connected_devices(self, count: int):
        """
        Update the number of connected devices.
        
        Args:
            count: Number of connected devices
        """
        with self._status_lock:
            self._connected_devices = count
    
    def _get_manual_instructions(self) -> list:
        """
        Get manual hotspot setup instructions for Android 11+.
        
        Returns:
            List of instruction strings
        """
        return [
            "Open device Settings",
            "Go to Network & Internet",
            "Tap Hotspot & Tethering",
            "Tap Wi-Fi Hotspot",
            "Set hotspot name to: " + (self._current_config.ssid if self._current_config else "MeshNet-Emergency"),
            "Set password to: " + (self._current_config.password if self._current_config else "12345678"),
            "Enable Wi-Fi Hotspot",
            "Return to this app and confirm hotspot is active"
        ]
    
    def open_system_settings(self) -> bool:
        """
        Open system hotspot settings.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            from android import mActivity
            from jnius import autoclass
            
            intent_class = autoclass('android.content.Intent')
            settings_class = autoclass('android.provider.Settings')
            
            intent = intent_class(settings_class.ACTION_TETHER_SETTINGS)
            mActivity.startActivity(intent)
            
            return True
        except Exception as e:
            print(f"[HotspotService] Failed to open settings: {e}")
            return False


# Singleton instance
_hotspot_service: Optional[HotspotService] = None


def get_hotspot_service() -> HotspotService:
    """Get the singleton hotspot service instance."""
    global _hotspot_service
    if _hotspot_service is None:
        _hotspot_service = HotspotService()
    return _hotspot_service
