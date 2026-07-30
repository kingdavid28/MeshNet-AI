"""
emergency.py
────────────────────────────────────────────────────────────────────────────
Emergency/SOS functionality for MeshNet-AI Kivy application.

This module provides SOS alert sending, medical requests, and emergency
communication features matching the React app functionality.
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass
import requests
import threading
from kivy.clock import Clock


@dataclass
class SOSAlert:
    """SOS alert data structure."""
    node_id: str
    name: str
    message: str
    latitude: float
    longitude: float
    device: str
    timestamp: float
    severity: str = "high"


@dataclass
class MedicalRequest:
    """Medical request data structure."""
    node_id: str
    name: str
    condition: str
    severity: str  # low, medium, high, critical
    latitude: float
    longitude: float
    timestamp: float


class EmergencyService:
    """
    Emergency service for SOS alerts and medical requests.
    
    Communicates with the Express backend to send emergency alerts
    and retrieve emergency contact information.
    """
    
    def __init__(self, backend_url: str = "http://localhost:4000"):
        self.backend_url = backend_url
        self._mesh_secret = "meshnet-secret"  # Should match backend config
        self._node_id = "kivy-device"
        self._device_name = "Kivy Device"
        
    def send_sos_alert(self, message: str, lat: float, lng: float, 
                       name: Optional[str] = None) -> bool:
        """
        Send SOS alert to the backend.
        
        Args:
            message: Emergency message
            lat: Latitude
            lng: Longitude
            name: Optional name (defaults to device name)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            from location import get_location_service
            location_service = get_location_service()
            
            # Use provided coordinates or current location
            if abs(lat) < 0.001 and abs(lng) < 0.001:
                current_lat, current_lng = location_service.get_coordinates()
                lat, lng = current_lat, current_lng
            
            payload = {
                "id": self._node_id,
                "label": name or self._device_name,
                "name": name or self._device_name,
                "device": "smartphone",
                "role": "peer",
                "signal": 100,
                "batteryPercentage": 100,
                "bluetoothStatus": False,
                "wifiStatus": True,
                "lat": lat,
                "lng": lng,
                "message": message,
                "emergency": True
            }
            
            response = requests.post(
                f"{self.backend_url}/api/mesh/register",
                headers={
                    "Content-Type": "application/json",
                    "X-Mesh-Secret": self._mesh_secret
                },
                json=payload,
                timeout=10
            )
            
            return response.status_code == 200
            
        except Exception as e:
            print(f"[EmergencyService] Failed to send SOS: {e}")
            return False
    
    def send_medical_request(self, condition: str, severity: str,
                            lat: float, lng: float, name: Optional[str] = None) -> bool:
        """
        Send medical request to the backend.
        
        Args:
            condition: Medical condition description
            severity: Severity level (low, medium, high, critical)
            lat: Latitude
            lng: Longitude
            name: Optional name
            
        Returns:
            True if successful, False otherwise
        """
        try:
            from location import get_location_service
            location_service = get_location_service()
            
            # Use provided coordinates or current location
            if abs(lat) < 0.001 and abs(lng) < 0.001:
                current_lat, current_lng = location_service.get_coordinates()
                lat, lng = current_lat, current_lng
            
            payload = {
                "id": self._node_id,
                "label": name or self._device_name,
                "name": name or self._device_name,
                "device": "smartphone",
                "role": "peer",
                "signal": 100,
                "batteryPercentage": 100,
                "bluetoothStatus": False,
                "wifiStatus": True,
                "lat": lat,
                "lng": lng,
                "medical_request": {
                    "condition": condition,
                    "severity": severity
                }
            }
            
            response = requests.post(
                f"{self.backend_url}/api/mesh/register",
                headers={
                    "Content-Type": "application/json",
                    "X-Mesh-Secret": self._mesh_secret
                },
                json=payload,
                timeout=10
            )
            
            return response.status_code == 200
            
        except Exception as e:
            print(f"[EmergencyService] Failed to send medical request: {e}")
            return False
    
    def search_emergency_contacts(self, query: str, search_type: str = "name",
                                 limit: int = 50) -> list:
        """
        Search emergency contacts in the offline database.
        
        Args:
            query: Search query
            search_type: Type of search (name, location, category, proximity)
            limit: Maximum results
            
        Returns:
            List of emergency contact dictionaries
        """
        try:
            params = {
                "type": search_type,
                "query": query,
                "limit": limit
            }
            
            response = requests.get(
                f"{self.backend_url}/api/emergency/search",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            
            return []
            
        except Exception as e:
            print(f"[EmergencyService] Failed to search contacts: {e}")
            return []
    
    def get_medical_facilities(self, query: Optional[str] = None,
                               limit: int = 50) -> list:
        """
        Get medical facilities from the offline database.
        
        Args:
            query: Optional search query
            limit: Maximum results
            
        Returns:
            List of medical facility dictionaries
        """
        try:
            params = {"limit": limit}
            if query:
                params["query"] = query
            
            response = requests.get(
                f"{self.backend_url}/api/emergency/medical",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            
            return []
            
        except Exception as e:
            print(f"[EmergencyService] Failed to get medical facilities: {e}")
            return []
    
    def get_shelters(self, query: Optional[str] = None, accepts_pets: bool = False,
                    limit: int = 50) -> list:
        """
        Get shelter locations from the offline database.
        
        Args:
            query: Optional search query
            accepts_pets: Filter by pet acceptance
            limit: Maximum results
            
        Returns:
            List of shelter dictionaries
        """
        try:
            params = {"limit": limit}
            if query:
                params["query"] = query
            if accepts_pets:
                params["pets"] = "true"
            
            response = requests.get(
                f"{self.backend_url}/api/emergency/shelters",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            
            return []
            
        except Exception as e:
            print(f"[EmergencyService] Failed to get shelters: {e}")
            return []
    
    def set_node_info(self, node_id: str, device_name: str):
        """
        Set device identification information.
        
        Args:
            node_id: Unique node identifier
            device_name: Human-readable device name
        """
        self._node_id = node_id
        self._device_name = device_name
    
    def set_backend_url(self, url: str):
        """
        Update backend URL.
        
        Args:
            url: New backend URL
        """
        self.backend_url = url


# Singleton instance
_emergency_service: Optional[EmergencyService] = None


def get_emergency_service() -> EmergencyService:
    """Get the singleton emergency service instance."""
    global _emergency_service
    if _emergency_service is None:
        _emergency_service = EmergencyService()
    return _emergency_service
