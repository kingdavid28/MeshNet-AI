"""
test_routing.py
────────────────────────────────────────────────────────────────────────────
Unit tests for the routing module schema normalizer.

Tests the parse_backend_node and parse_backend_nodes functions with various
backend schema formats to ensure robust parsing.
"""

import pytest
from datetime import datetime
from routing import parse_backend_node, parse_backend_nodes, MeshNode


class TestParseBackendNode:
    """Test suite for parse_backend_node function."""
    
    def test_standard_format(self):
        """Test parsing standard backend format."""
        data = {
            "id": "node1",
            "label": "Test Node",
            "lat": 37.7749,
            "lng": -122.4194,
            "battery": 85,
            "signal": 90,
            "device": "smartphone",
            "role": "peer",
            "bluetooth_status": True,
            "wifi_status": False
        }
        
        node = parse_backend_node(data)
        
        assert node is not None
        assert node.id == "node1"
        assert node.label == "Test Node"
        assert node.lat == 37.7749
        assert node.lng == -122.4194
        assert node.battery == 85
        assert node.signal == 90
        assert node.device == "smartphone"
        assert node.role == "peer"
        assert node.bluetooth_status is True
        assert node.wifi_status is False
    
    def test_legacy_format(self):
        """Test parsing legacy backend format."""
        data = {
            "node_id": "node2",
            "name": "Legacy Node",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "batteryPercentage": 75,
            "rssi": 70
        }
        
        node = parse_backend_node(data)
        
        assert node is not None
        assert node.id == "node2"
        assert node.label == "Legacy Node"
        assert node.lat == 40.7128
        assert node.lng == -74.0060
        assert node.battery == 75
        assert node.signal == 70
        assert node.device == "unknown"
        assert node.role == "peer"
    
    def test_nested_format(self):
        """Test parsing nested data format."""
        data = {
            "data": {
                "id": "node3",
                "label": "Nested Node",
                "lat": 51.5074,
                "lng": -0.1278,
                "battery": 100,
                "signal": 95,
                "device": "laptop",
                "role": "relay"
            }
        }
        
        node = parse_backend_node(data)
        
        assert node is not None
        assert node.id == "node3"
        assert node.label == "Nested Node"
        assert node.lat == 51.5074
        assert node.lng == -0.1278
        assert node.battery == 100
        assert node.signal == 95
        assert node.device == "laptop"
        assert node.role == "relay"
    
    def test_missing_id(self):
        """Test handling missing ID field."""
        data = {
            "label": "No ID Node",
            "lat": 0.0,
            "lng": 0.0
        }
        
        node = parse_backend_node(data)
        assert node is None
    
    def test_empty_data(self):
        """Test handling empty data."""
        assert parse_backend_node({}) is None
        assert parse_backend_node(None) is None
        assert parse_backend_node([]) is None
    
    def test_invalid_data_type(self):
        """Test handling invalid data types."""
        assert parse_backend_node("invalid") is None
        assert parse_backend_node(123) is None
        assert parse_backend_node(True) is None
    
    def test_coordinate_defaults(self):
        """Test default values for coordinates."""
        data = {
            "id": "node4",
            "label": "Default Coords"
        }
        
        node = parse_backend_node(data)
        
        assert node is not None
        assert node.lat == 0.0
        assert node.lng == 0.0
    
    def test_battery_clamping(self):
        """Test battery value clamping to valid range."""
        data = {
            "id": "node5",
            "label": "Clamp Test",
            "battery": 150  # Above max
        }
        
        node = parse_backend_node(data)
        assert node.battery == 100
        
        data["battery"] = -10  # Below min
        node = parse_backend_node(data)
        assert node.battery == 0
    
    def test_signal_clamping(self):
        """Test signal value clamping to valid range."""
        data = {
            "id": "node6",
            "label": "Signal Test",
            "signal": 150  # Above max
        }
        
        node = parse_backend_node(data)
        assert node.signal == 100
        
        data["signal"] = -10  # Below min
        node = parse_backend_node(data)
        assert node.signal == 0
    
    def test_boolean_parsing(self):
        """Test boolean field parsing from various formats."""
        # Boolean true
        data = {
            "id": "node7",
            "label": "Bool Test",
            "bluetooth_status": True,
            "wifi_status": "true"
        }
        node = parse_backend_node(data)
        assert node.bluetooth_status is True
        assert node.wifi_status is True
        
        # Boolean false
        data["bluetooth_status"] = False
        data["wifi_status"] = "false"
        node = parse_backend_node(data)
        assert node.bluetooth_status is False
        assert node.wifi_status is False
        
        # Numeric boolean
        data["bluetooth_status"] = 1
        data["wifi_status"] = 0
        node = parse_backend_node(data)
        assert node.bluetooth_status is True
        assert node.wifi_status is False
    
    def test_timestamp_parsing(self):
        """Test timestamp parsing."""
        # Unix timestamp
        data = {
            "id": "node8",
            "label": "Timestamp Test",
            "last_seen": 1704067200  # 2024-01-01 00:00:00 UTC
        }
        node = parse_backend_node(data)
        assert node.last_seen is not None
        assert isinstance(node.last_seen, datetime)
        
        # ISO string
        data["last_seen"] = "2024-01-01T00:00:00Z"
        node = parse_backend_node(data)
        assert node.last_seen is not None
        
        # Invalid timestamp
        data["last_seen"] = "invalid"
        node = parse_backend_node(data)
        assert node.last_seen is None
    
    def test_label_fallbacks(self):
        """Test label field fallback options."""
        data = {"id": "node9"}
        
        # No label - should use ID prefix
        node = parse_backend_node(data)
        assert node.label == "Node node9"
        
        # name field
        data["name"] = "Name Field"
        node = parse_backend_node(data)
        assert node.label == "Name Field"
        
        # display_name field
        del data["name"]
        data["display_name"] = "Display Name"
        node = parse_backend_node(data)
        assert node.label == "Display Name"
    
    def test_device_type_fallbacks(self):
        """Test device type field fallback options."""
        data = {"id": "node10", "label": "Device Test"}
        
        node = parse_backend_node(data)
        assert node.device == "unknown"
        
        # Test device_type fallback
        data["device_type"] = "tablet"
        node = parse_backend_node(data)
        assert node.device == "tablet"
        
        # Test deviceType fallback (when device_type is not present)
        del data["device_type"]
        data["deviceType"] = "desktop"
        node = parse_backend_node(data)
        assert node.device == "desktop"


class TestParseBackendNodes:
    """Test suite for parse_backend_nodes function."""
    
    def test_list_of_nodes(self):
        """Test parsing a list of nodes."""
        data = [
            {"id": "node1", "label": "Node 1", "lat": 0.0, "lng": 0.0},
            {"id": "node2", "label": "Node 2", "lat": 1.0, "lng": 1.0},
            {"id": "node3", "label": "Node 3", "lat": 2.0, "lng": 2.0}
        ]
        
        nodes = parse_backend_nodes(data)
        
        assert len(nodes) == 3
        assert nodes[0].id == "node1"
        assert nodes[1].id == "node2"
        assert nodes[2].id == "node3"
    
    def test_single_node(self):
        """Test parsing a single node."""
        data = {"id": "node1", "label": "Single Node", "lat": 0.0, "lng": 0.0}
        
        nodes = parse_backend_nodes(data)
        
        assert len(nodes) == 1
        assert nodes[0].id == "node1"
    
    def test_nested_list_wrapper(self):
        """Test parsing nested list wrapper format."""
        data = {
            "nodes": [
                {"id": "node1", "label": "Node 1", "lat": 0.0, "lng": 0.0},
                {"id": "node2", "label": "Node 2", "lat": 1.0, "lng": 1.0}
            ]
        }
        
        nodes = parse_backend_nodes(data)
        
        assert len(nodes) == 2
    
    def test_data_list_wrapper(self):
        """Test parsing data list wrapper format."""
        data = {
            "data": [
                {"id": "node1", "label": "Node 1", "lat": 0.0, "lng": 0.0}
            ]
        }
        
        nodes = parse_backend_nodes(data)
        
        assert len(nodes) == 1
    
    def test_empty_list(self):
        """Test parsing empty list."""
        assert parse_backend_nodes([]) == []
    
    def test_none_input(self):
        """Test parsing None input."""
        assert parse_backend_nodes(None) == []
    
    def test_invalid_input(self):
        """Test parsing invalid input types."""
        assert parse_backend_nodes("invalid") == []
        assert parse_backend_nodes(123) == []
    
    def test_mixed_valid_invalid(self):
        """Test parsing list with valid and invalid entries."""
        data = [
            {"id": "node1", "label": "Valid", "lat": 0.0, "lng": 0.0},
            {"label": "Invalid - no ID"},
            {"id": "node2", "label": "Valid 2", "lat": 1.0, "lng": 1.0},
            None
        ]
        
        nodes = parse_backend_nodes(data)
        
        assert len(nodes) == 2
        assert nodes[0].id == "node1"
        assert nodes[1].id == "node2"


class TestMeshNode:
    """Test suite for MeshNode dataclass."""
    
    def test_meshnode_creation(self):
        """Test creating a MeshNode instance."""
        node = MeshNode(
            id="test1",
            label="Test Node",
            lat=37.7749,
            lng=-122.4194,
            battery=85,
            signal=90,
            device="smartphone",
            role="peer",
            bluetooth_status=True,
            wifi_status=False
        )
        
        assert node.id == "test1"
        assert node.label == "Test Node"
        assert node.lat == 37.7749
        assert node.lng == -122.4194
        assert node.battery == 85
        assert node.signal == 90
        assert node.device == "smartphone"
        assert node.role == "peer"
        assert node.bluetooth_status is True
        assert node.wifi_status is False
        assert node.last_seen is None
    
    def test_meshnode_with_timestamp(self):
        """Test creating a MeshNode with timestamp."""
        timestamp = datetime(2024, 1, 1, 0, 0, 0)
        node = MeshNode(
            id="test2",
            label="Test Node",
            lat=0.0,
            lng=0.0,
            battery=100,
            signal=100,
            device="laptop",
            role="relay",
            bluetooth_status=False,
            wifi_status=True,
            last_seen=timestamp
        )
        
        assert node.last_seen == timestamp


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
