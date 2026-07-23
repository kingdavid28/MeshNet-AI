"""
MeshNet AI - Mock Node Topology for Algorithm Testing
backend/nodes_mock.py

Sample device network topology for testing routing algorithms.
Contains 5-6 sample devices with varying ranges, battery percentages, and operational statuses.
"""

# MeshNet AI - Mock Node Topology for Algorithm Testing
simulated_network = [
    {
        "node_id": "Node_001",
        "device_type": "Smartphone",
        "battery_level": 92,
        "is_active": True,
        "has_weather_hq_signal": True  # Headquarter anchor point
    },
    {
        "node_id": "Node_002",
        "device_type": "Smartphone",
        "battery_level": 45,
        "is_active": True,
        "has_weather_hq_signal": False
    },
    {
        "node_id": "Node_003",
        "device_type": "Tablet",
        "battery_level": 12,  # Low battery node test
        "is_active": True,
        "has_weather_hq_signal": False
    },
    {
        "node_id": "Node_004",
        "device_type": "Laptop",
        "battery_level": 88,
        "is_active": False,  # Dead node test
        "has_weather_hq_signal": False
    },
    {
        "node_id": "Node_005",
        "device_type": "Smartphone",
        "battery_level": 67,
        "is_active": True,
        "has_weather_hq_signal": False
    },
    {
        "node_id": "Node_006",
        "device_type": "Tablet",
        "battery_level": 34,
        "is_active": True,
        "has_weather_hq_signal": True  # Secondary anchor point
    }
]

if __name__ == "__main__":
    print(f"Successfully loaded {len(simulated_network)} test nodes into the Mesh environment.")
    print("\nNode Summary:")
    for node in simulated_network:
        status = "✓ Active" if node["is_active"] else "✗ Inactive"
        hq = "📡 HQ" if node["has_weather_hq_signal"] else ""
        battery_icon = "🔋" if node["battery_level"] > 50 else "⚠️" if node["battery_level"] > 20 else "🔴"
        print(f"  {node['node_id']}: {node['device_type']} | {battery_icon} {node['battery_level']}% | {status} {hq}")
