"""
MeshNet AI - Mock Node Topology for Algorithm Testing
backend/nodes_mock.py

Sample device network topology for testing routing algorithms.
Contains 5-6 sample devices with varying ranges, battery percentages, and operational statuses.
"""

from typing import List, Dict, Any

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


def get_active_nodes(network: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filter network to return only active nodes with sufficient battery.
    
    Args:
        network: List of node dictionaries with is_active and battery_level keys
        
    Returns:
        List of nodes where is_active is True AND battery_level > 15
        
    This ensures emergency messages are not routed through dead or low-battery devices.
    """
    return [
        node for node in network
        if node.get("is_active", False) and node.get("battery_level", 0) > 15
    ]


if __name__ == "__main__":
    print(f"Successfully loaded {len(simulated_network)} test nodes into the Mesh environment.")
    print("\nNode Summary:")
    for node in simulated_network:
        status = "✓ Active" if node["is_active"] else "✗ Inactive"
        hq = "📡 HQ" if node["has_weather_hq_signal"] else ""
        battery_icon = "🔋" if node["battery_level"] > 50 else "⚠️" if node["battery_level"] > 20 else "🔴"
        print(f"  {node['node_id']}: {node['device_type']} | {battery_icon} {node['battery_level']}% | {status} {hq}")
    
    # Test the filtering function
    print("\n" + "="*60)
    print("Testing get_active_nodes() filter:")
    print("="*60)
    active_nodes = get_active_nodes(simulated_network)
    print(f"\nFiltered to {len(active_nodes)} active nodes (battery > 15%):")
    for node in active_nodes:
        print(f"  ✓ {node['node_id']}: {node['device_type']} | Battery: {node['battery_level']}%")
    
    # Show filtered out nodes
    filtered_out = [node for node in simulated_network if node not in active_nodes]
    if filtered_out:
        print(f"\nFiltered out {len(filtered_out)} nodes (inactive or low battery):")
        for node in filtered_out:
            reason = "inactive" if not node["is_active"] else f"low battery ({node['battery_level']}%)"
            print(f"  ✗ {node['node_id']}: {node['device_type']} - {reason}")
