import json
import random
from datetime import datetime

# Generate 25 realistic test nodes
devices = ["smartphone", "laptop"]
roles = ["peer", "relay"]
oses = ["Android 14", "Android 13", "iOS 17.5", "iOS 16.7", "Windows 11", "macOS Sonoma 14", "Ubuntu 24.04", "Ubuntu 22.04"]

# Base coordinates around Cebu City, Philippines
base_lat = 10.3157
base_lng = 123.8854

nodes = []
for i in range(25):
    device = random.choice(devices)
    role = random.choice(roles)
    os = random.choice(oses)
    
    # Random coordinates within ~5km radius
    lat = base_lat + random.uniform(-0.05, 0.05)
    lng = base_lng + random.uniform(-0.05, 0.05)
    
    node = {
        "id": f"node-{i+1:03d}",
        "label": f"Node-{i+1}",
        "name": f"Device-{i+1}",
        "device": device,
        "role": role,
        "signal": random.randint(40, 100),
        "battery_percentage": random.randint(20, 100),
        "bluetooth_status": 1 if random.random() > 0.3 else 0,
        "wifi_status": 1 if random.random() > 0.4 else 0,
        "os": os,
        "lat": round(lat, 6),
        "lng": round(lng, 6)
    }
    nodes.append(node)

# Save to JSON file
with open("nodes.json", "w") as f:
    json.dump(nodes, f, indent=2)

print(f"Generated {len(nodes)} nodes in nodes.json")
