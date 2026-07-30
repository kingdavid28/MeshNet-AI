"""
routing.py
────────────────────────────────────────────────────────────────────────────
Schema normalizer for parsing backend node data from the Express server.

This module provides robust JSON parsing that normalizes different backend schemas
into a consistent internal format for the Kivy application.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime


@dataclass
class MeshNode:
    """Normalized mesh node data structure."""
    id: str
    label: str
    lat: float
    lng: float
    battery: int
    signal: int
    device: str
    role: str
    bluetooth_status: bool
    wifi_status: bool
    last_seen: Optional[datetime] = None


def parse_backend_node(data: Dict[str, Any]) -> Optional[MeshNode]:
    """
    Parse and normalize backend node data from various schema formats.
    
    Handles different backend response formats:
    - Standard format: {id, label, lat, lng, battery, signal, device, role, ...}
    - Legacy format: {node_id, name, latitude, longitude, ...}
    - Nested format: {data: {id, label, ...}}
    
    Args:
        data: Raw JSON dictionary from backend
        
    Returns:
        MeshNode object if parsing succeeds, None otherwise
        
    Examples:
        >>> parse_backend_node({"id": "node1", "label": "Test", "lat": 0.0, "lng": 0.0, "battery": 100, "signal": 80, "device": "smartphone", "role": "peer"})
        MeshNode(id='node1', label='Test', lat=0.0, lng=0.0, battery=100, signal=80, device='smartphone', role='peer', bluetooth_status=False, wifi_status=False, last_seen=None)
        
        >>> parse_backend_node({"node_id": "node1", "name": "Test", "latitude": 0.0, "longitude": 0.0})
        MeshNode(id='node1', label='Test', lat=0.0, lng=0.0, battery=100, signal=80, device='unknown', role='peer', bluetooth_status=False, wifi_status=False, last_seen=None)
    """
    if not data or not isinstance(data, dict):
        return None
    
    # Handle nested data format
    if "data" in data and isinstance(data["data"], dict):
        data = data["data"]
    
    # Extract ID with fallback to legacy field names
    node_id = (
        data.get("id") or
        data.get("node_id") or
        data.get("nodeId") or
        data.get("_id") or
        ""
    )
    
    if not node_id:
        return None
    
    # Extract label with fallbacks
    label = (
        data.get("label") or
        data.get("name") or
        data.get("display_name") or
        data.get("displayName") or
        f"Node {node_id[:8]}"
    )
    
    # Extract coordinates with type conversion
    lat = _safe_float(data.get("lat") or data.get("latitude") or 0.0)
    lng = _safe_float(data.get("lng") or data.get("longitude") or 0.0)
    
    # Extract numeric fields with defaults
    battery = _safe_int(data.get("battery") or data.get("batteryPercentage") or 100, 0, 100)
    signal = _safe_int(data.get("signal") or data.get("rssi") or 80, 0, 100)
    
    # Extract device type
    device = (
        data.get("device") or
        data.get("device_type") or
        data.get("deviceType") or
        "unknown"
    )
    
    # Extract role
    role = (
        data.get("role") or
        data.get("type") or
        "peer"
    )
    
    # Extract boolean status fields
    bluetooth_status = _safe_bool(data.get("bluetooth_status") or data.get("bluetoothStatus") or False)
    wifi_status = _safe_bool(data.get("wifi_status") or data.get("wifiStatus") or False)
    
    # Parse timestamp if available
    last_seen = None
    if "last_seen" in data or "lastSeen" in data:
        timestamp = data.get("last_seen") or data.get("lastSeen")
        if timestamp:
            try:
                if isinstance(timestamp, (int, float)):
                    last_seen = datetime.fromtimestamp(timestamp)
                elif isinstance(timestamp, str):
                    last_seen = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
    
    return MeshNode(
        id=node_id,
        label=label,
        lat=lat,
        lng=lng,
        battery=battery,
        signal=signal,
        device=device,
        role=role,
        bluetooth_status=bluetooth_status,
        wifi_status=wifi_status,
        last_seen=last_seen
    )


def parse_backend_nodes(data: Any) -> List[MeshNode]:
    """
    Parse a list of backend nodes or a single node.
    
    Args:
        data: List of dictionaries or single dictionary
        
    Returns:
        List of MeshNode objects
    """
    if not data:
        return []
    
    if isinstance(data, list):
        nodes = []
        for item in data:
            node = parse_backend_node(item)
            if node:
                nodes.append(node)
        return nodes
    
    if isinstance(data, dict):
        # Check if it's a list wrapper
        if "nodes" in data and isinstance(data["nodes"], list):
            return parse_backend_nodes(data["nodes"])
        if "data" in data and isinstance(data["data"], list):
            return parse_backend_nodes(data["data"])
        # Single node
        node = parse_backend_node(data)
        return [node] if node else []
    
    return []


def _safe_float(value: Any) -> float:
    """Safely convert value to float, returning 0.0 on failure."""
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def _safe_int(value: Any, min_val: int = 0, max_val: int = 100) -> int:
    """Safely convert value to int with clamping."""
    try:
        result = int(value)
        return max(min_val, min(max_val, result))
    except (ValueError, TypeError):
        return min_val


def _safe_bool(value: Any) -> bool:
    """Safely convert value to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.lower() in ("true", "1", "yes", "on")
    return False
