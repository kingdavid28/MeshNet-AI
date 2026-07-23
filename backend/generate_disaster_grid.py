"""
MeshNet AI - Disaster Grid Device Generator
backend/generate_disaster_grid.py

Generates 50-100 device coordinates for a 1km disaster grid.
Outputs CSV and JSON formats, and pushes to Cloudant database.

Usage:
    python generate_disaster_grid.py [--count 75] [--output disaster_grid]
"""

import csv
import json
import random
import argparse
from typing import List, Dict, Any
from datetime import datetime, timezone
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    # Try to import config, but handle missing MESH_SECRET gracefully
    import secrets
    os.environ.setdefault("MESH_SECRET", secrets.token_hex(32))
    from config import CLOUDANT_URL, CLOUDANT_API_KEY, CLOUDANT_DB
    from cryptography.fernet import Fernet
except (ImportError, SystemExit):
    print("Warning: config module not found or MESH_SECRET not set. Using defaults.")
    CLOUDANT_URL = os.getenv("CLOUDANT_URL", "")
    CLOUDANT_API_KEY = os.getenv("CLOUDANT_API_KEY", "")
    CLOUDANT_DB = os.getenv("CLOUDANT_DB", "mesh_nodes_db")


# Disaster grid parameters (1km x 1km area)
GRID_CENTER_LAT = 40.7128  # Example: New York City
GRID_CENTER_LNG = -74.0060
GRID_SIZE_KM = 1.0  # 1km grid
LAT_RANGE = GRID_SIZE_KM / 111.0  # ~0.009 degrees latitude
LNG_RANGE = GRID_SIZE_KM / (111.0 * 0.8)  # ~0.011 degrees longitude (adjusted for latitude)

DEVICE_TYPES = ["Smartphone", "Tablet", "Laptop", "IoT Sensor", "Emergency Beacon"]
STATUS_TYPES = ["active", "inactive", "emergency", "offline"]


def generate_device_coordinates(count: int = 75) -> List[Dict[str, Any]]:
    """
    Generate random device coordinates within a 1km disaster grid.
    
    Args:
        count: Number of devices to generate (default: 75)
        
    Returns:
        List of device dictionaries with coordinates and status
    """
    devices = []
    
    for i in range(count):
        # Generate random coordinates within grid
        lat = GRID_CENTER_LAT + random.uniform(-LAT_RANGE/2, LAT_RANGE/2)
        lng = GRID_CENTER_LNG + random.uniform(-LNG_RANGE/2, LNG_RANGE/2)
        
        # Generate device properties
        device_type = random.choice(DEVICE_TYPES)
        battery_level = random.randint(5, 100)
        
        # Status weighted towards active devices
        status_weights = [0.6, 0.15, 0.15, 0.1]  # active, inactive, emergency, offline
        status = random.choices(STATUS_TYPES, weights=status_weights)[0]
        
        # Adjust battery based on status
        if status == "offline":
            battery_level = 0
        elif status == "emergency":
            battery_level = max(battery_level, 20)  # Emergency devices have at least 20%
        
        device = {
            "node_id": f"NODE_{i+1:04d}",
            "device_type": device_type,
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "battery_level": battery_level,
            "status": status,
            "signal_strength": random.randint(30, 100) if status != "offline" else 0,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "registered": datetime.now(timezone.utc).isoformat()
        }
        
        devices.append(device)
    
    return devices


def save_to_csv(devices: List[Dict[str, Any]], filename: str) -> None:
    """
    Save device data to CSV file.
    
    Args:
        devices: List of device dictionaries
        filename: Output CSV filename
    """
    fieldnames = ["node_id", "device_type", "latitude", "longitude", 
                  "battery_level", "status", "signal_strength", "last_seen", "registered"]
    
    with open(filename, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(devices)
    
    print(f"✓ CSV saved to {filename}")


def save_to_json(devices: List[Dict[str, Any]], filename: str) -> None:
    """
    Save device data to JSON file.
    
    Args:
        devices: List of device dictionaries
        filename: Output JSON filename
    """
    with open(filename, 'w') as jsonfile:
        json.dump(devices, jsonfile, indent=2)
    
    print(f"✓ JSON saved to {filename}")


def push_to_cloudant(devices: List[Dict[str, Any]]) -> bool:
    """
    Push device data to IBM Cloudant database.
    
    Args:
        devices: List of device dictionaries
        
    Returns:
        True if successful, False otherwise
    """
    if not CLOUDANT_URL or not CLOUDANT_API_KEY:
        print("⚠ Cloudant credentials not configured. Skipping database push.")
        print("  Set CLOUDANT_URL and CLOUDANT_API_KEY environment variables.")
        return False
    
    try:
        import requests
        from requests.auth import HTTPBasicAuth
        
        # Extract credentials from URL
        # Expected format: https://apikey:password@account.cloudant.com
        if "@" in CLOUDANT_URL:
            auth_part = CLOUDANT_URL.split("//")[1].split("@")[0]
            api_key, api_pass = auth_part.split(":")
            base_url = CLOUDANT_URL.split("@")[1]
        else:
            print("⚠ Invalid Cloudant URL format. Expected: https://apikey:password@account.cloudant.com")
            return False
        
        db_url = f"https://{base_url}/{CLOUDANT_DB}"
        
        # Check if database exists
        auth = HTTPBasicAuth(api_key, api_pass)
        response = requests.get(db_url, auth=auth, timeout=10)
        
        if response.status_code == 404:
            print(f"⚠ Database '{CLOUDANT_DB}' does not exist. Creating...")
            create_response = requests.put(db_url, auth=auth, timeout=10)
            if create_response.status_code not in [201, 202]:
                print(f"✗ Failed to create database: {create_response.status_code}")
                return False
            print(f"✓ Database '{CLOUDANT_DB}' created")
        
        # Bulk insert documents
        docs_url = f"{db_url}/_bulk_docs"
        bulk_docs = {"docs": devices}
        
        response = requests.post(docs_url, json=bulk_docs, auth=auth, timeout=30)
        
        if response.status_code in [201, 202]:
            result = response.json()
            print(f"✓ Successfully pushed {len(devices)} devices to Cloudant")
            print(f"  Database: {CLOUDANT_DB}")
            if result:
                print(f"  Response: {result}")
            return True
        else:
            print(f"✗ Failed to push to Cloudant: {response.status_code}")
            print(f"  Error: {response.text}")
            return False
            
    except ImportError:
        print("⚠ requests library not available. Install with: pip install requests")
        return False
    except Exception as e:
        print(f"✗ Error pushing to Cloudant: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Generate disaster grid device coordinates")
    parser.add_argument("--count", type=int, default=75, help="Number of devices to generate (default: 75)")
    parser.add_argument("--output", type=str, default="disaster_grid", help="Output filename prefix (default: disaster_grid)")
    parser.add_argument("--no-cloudant", action="store_true", help="Skip Cloudant database push")
    parser.add_argument("--csv-only", action="store_true", help="Only generate CSV, skip JSON")
    
    args = parser.parse_args()
    
    print("="*60)
    print("MeshNet AI - Disaster Grid Device Generator")
    print("="*60)
    print(f"Generating {args.count} devices in 1km grid...")
    print(f"Grid center: {GRID_CENTER_LAT}, {GRID_CENTER_LNG}")
    print()
    
    # Generate devices
    devices = generate_device_coordinates(args.count)
    
    # Save to CSV
    csv_filename = f"{args.output}.csv"
    save_to_csv(devices, csv_filename)
    
    # Save to JSON
    if not args.csv_only:
        json_filename = f"{args.output}.json"
        save_to_json(devices, json_filename)
    
    # Push to Cloudant
    if not args.no_cloudant:
        print()
        print("Pushing to Cloudant database...")
        push_to_cloudant(devices)
    
    # Summary
    print()
    print("="*60)
    print("Generation Summary")
    print("="*60)
    print(f"Total devices: {len(devices)}")
    
    status_counts = {}
    for device in devices:
        status = device["status"]
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("\nStatus distribution:")
    for status, count in status_counts.items():
        print(f"  {status}: {count} ({count/len(devices)*100:.1f}%)")
    
    battery_avg = sum(d["battery_level"] for d in devices) / len(devices)
    print(f"\nAverage battery: {battery_avg:.1f}%")
    
    device_type_counts = {}
    for device in devices:
        dtype = device["device_type"]
        device_type_counts[dtype] = device_type_counts.get(dtype, 0) + 1
    
    print("\nDevice type distribution:")
    for dtype, count in device_type_counts.items():
        print(f"  {dtype}: {count}")
    
    print()
    print("✓ Disaster grid generation complete!")


if __name__ == "__main__":
    main()
