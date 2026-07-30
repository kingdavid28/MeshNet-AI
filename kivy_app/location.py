"""
location.py
────────────────────────────────────────────────────────────────────────────
GPS/location tracking module for MeshNet-AI Kivy application.

This module provides GPS location tracking using plyer for cross-platform
location access on Android devices.
"""

from typing import Optional, Tuple
from dataclasses import dataclass
from kivy.clock import Clock
import threading
import time


@dataclass
class LocationData:
    """GPS location data structure."""
    latitude: float
    longitude: float
    accuracy: float
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    timestamp: Optional[float] = None


class LocationService:
    """
    GPS location service for tracking device position.
    
    Uses plyer for cross-platform location access on Android.
    Provides continuous location updates with configurable accuracy.
    """
    
    def __init__(self):
        self._current_location: Optional[LocationData] = None
        self._is_tracking = False
        self._tracking_thread: Optional[threading.Thread] = None
        self._should_stop = False
        self._location_lock = threading.Lock()
        self._update_interval = 5.0  # seconds
        self._on_location_update = None
        
    def start_tracking(self, callback=None, interval=5.0):
        """
        Start continuous GPS location tracking.
        
        Args:
            callback: Optional callback function for location updates
            interval: Update interval in seconds (default: 5.0)
        """
        with self._location_lock:
            if self._is_tracking:
                return
            
            self._is_tracking = True
            self._should_stop = False
            self._update_interval = interval
            self._on_location_update = callback
        
        self._tracking_thread = threading.Thread(
            target=self._tracking_loop,
            daemon=True
        )
        self._tracking_thread.start()
    
    def stop_tracking(self):
        """Stop GPS location tracking."""
        with self._location_lock:
            self._should_stop = True
            self._is_tracking = False
        
        if self._tracking_thread and self._tracking_thread.is_alive():
            self._tracking_thread.join(timeout=2)
    
    def get_current_location(self) -> Optional[LocationData]:
        """
        Get the most recent location data.
        
        Returns:
            LocationData object if available, None otherwise
        """
        with self._location_lock:
            return self._current_location
    
    def get_coordinates(self) -> Tuple[float, float]:
        """
        Get current latitude and longitude.
        
        Returns:
            Tuple of (latitude, longitude) or (0.0, 0.0) if not available
        """
        location = self.get_current_location()
        if location:
            return (location.latitude, location.longitude)
        return (0.0, 0.0)
    
    def _tracking_loop(self):
        """Background thread for continuous location updates."""
        while not self._should_stop:
            try:
                location = self._get_location_from_provider()
                
                if location:
                    with self._location_lock:
                        self._current_location = location
                    
                    if self._on_location_update:
                        Clock.schedule_once(
                            lambda dt: self._on_location_update(location)
                        )
                
                time.sleep(self._update_interval)
                
            except Exception as e:
                print(f"[LocationService] Error in tracking loop: {e}")
                time.sleep(self._update_interval)
    
    def _get_location_from_provider(self) -> Optional[LocationData]:
        """
        Get location from platform provider (plyer).
        
        Returns:
            LocationData object if location available, None otherwise
        """
        try:
            from plyer import gps
            
            # Try to get location from GPS
            gps.configure()
            gps.start()
            
            # Wait a bit for GPS to get a fix
            time.sleep(2)
            
            loc = gps.get_location()
            
            if loc and 'lat' in loc and 'lon' in loc:
                location = LocationData(
                    latitude=float(loc['lat']),
                    longitude=float(loc['lon']),
                    accuracy=float(loc.get('accuracy', 0.0)),
                    altitude=float(loc.get('altitude', 0.0)) if 'altitude' in loc else None,
                    speed=float(loc.get('speed', 0.0)) if 'speed' in loc else None,
                    heading=float(loc.get('bearing', 0.0)) if 'bearing' in loc else None,
                    timestamp=time.time()
                )
                
                gps.stop()
                return location
            
            gps.stop()
            return None
            
        except ImportError:
            print("[LocationService] plyer not available, using mock location")
            # Return mock location for testing
            return LocationData(
                latitude=14.5995,
                longitude=120.9842,
                accuracy=10.0,
                timestamp=time.time()
            )
        except Exception as e:
            print(f"[LocationService] Error getting location: {e}")
            return None
    
    def is_tracking(self) -> bool:
        """Check if location tracking is active."""
        with self._location_lock:
            return self._is_tracking
    
    def cleanup(self):
        """Cleanup resources."""
        self.stop_tracking()


# Singleton instance
_location_service: Optional[LocationService] = None


def get_location_service() -> LocationService:
    """Get the singleton location service instance."""
    global _location_service
    if _location_service is None:
        _location_service = LocationService()
    return _location_service
