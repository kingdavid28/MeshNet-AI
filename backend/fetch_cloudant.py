"""
MeshNet AI - Cloudant Data Fetching Script
backend/fetch_cloudant.py

Fetches disaster node data from IBM Cloudant database with local JSON fallback.
Supports both Cloudant API and local file reading for development/testing.

Usage:
    python fetch_cloudant.py [--local] [--file disaster_grid.json]
    
Environment Variables:
    CLOUDANT_URL: Full Cloudant URL with credentials (https://apikey:password@account.cloudant.com)
    CLOUDANT_DB: Database name (default: mesh_nodes_db)
"""

import requests
import json
import os
import argparse
from typing import List, Dict, Any, Optional
from requests.auth import HTTPBasicAuth


# Default configuration
DEFAULT_DB_NAME = "mesh_nodes_db"
DEFAULT_LOCAL_FILE = "disaster_grid.json"
CLOUDANT_URL = os.getenv("CLOUDANT_URL", "")
CLOUDANT_DB = os.getenv("CLOUDANT_DB", DEFAULT_DB_NAME)


def fetch_from_cloudant(url: str, db_name: str) -> List[Dict[str, Any]]:
    """
    Fetch disaster node data from IBM Cloudant database.
    
    Args:
        url: Cloudant instance URL with credentials
        db_name: Database name to fetch from
        
    Returns:
        List of node documents from the database
        
    Raises:
        ValueError: If URL format is invalid
        requests.RequestException: If HTTP request fails
    """
    if not url:
        raise ValueError("CLOUDANT_URL environment variable not set")
    
    # Extract credentials from URL
    # Expected format: https://apikey:password@account.cloudant.com
    if "@" not in url:
        raise ValueError("Invalid Cloudant URL format. Expected: https://apikey:password@account.cloudant.com")
    
    auth_part = url.split("//")[1].split("@")[0]
    api_key, api_pass = auth_part.split(":")
    base_url = url.split("@")[1]
    
    # Cloudant API endpoint to fetch all documents
    db_url = f"https://{base_url}/{db_name}/_all_docs?include_docs=true"
    
    auth = HTTPBasicAuth(api_key, api_pass)
    
    try:
        response = requests.get(db_url, auth=auth, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            # Extract documents from Cloudant response
            nodes = [row['doc'] for row in data.get('rows', []) if 'doc' in row]
            print(f"✓ Successfully fetched {len(nodes)} nodes from Cloudant database '{db_name}'")
            return nodes
        elif response.status_code == 404:
            raise ValueError(f"Database '{db_name}' not found. Please create it first.")
        else:
            raise requests.RequestException(f"HTTP {response.status_code}: {response.text}")
            
    except requests.Timeout:
        raise requests.RequestException("Request timed out after 30 seconds")
    except requests.ConnectionError:
        raise requests.RequestException("Failed to connect to Cloudant. Check network and URL.")


def fetch_from_local(file_path: str) -> List[Dict[str, Any]]:
    """
    Fetch disaster node data from local JSON file.
    
    Args:
        file_path: Path to local JSON file
        
    Returns:
        List of node documents from the file
        
    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file is not valid JSON
    """
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        # Handle both array format and Cloudant export format
        if isinstance(data, list):
            nodes = data
        elif isinstance(data, dict) and 'docs' in data:
            nodes = data['docs']
        elif isinstance(data, dict) and 'rows' in data:
            nodes = [row.get('doc', row) for row in data['rows']]
        else:
            raise ValueError("Unknown JSON format. Expected array or Cloudant export format.")
        
        print(f"✓ Successfully loaded {len(nodes)} nodes from local file '{file_path}'")
        return nodes
        
    except FileNotFoundError:
        raise FileNotFoundError(f"Local file not found: {file_path}")
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(f"Invalid JSON in file: {e}")


def fetch_disaster_data(use_local: bool = False, local_file: str = DEFAULT_LOCAL_FILE) -> List[Dict[str, Any]]:
    """
    Fetch disaster node data with automatic fallback.
    
    Tries Cloudant first, falls back to local JSON if Cloudant fails or local mode is forced.
    
    Args:
        use_local: Force local file mode
        local_file: Path to local JSON file
        
    Returns:
        List of node documents
    """
    if use_local:
        print("Using local file mode...")
        return fetch_from_local(local_file)
    
    # Try Cloudant first
    if CLOUDANT_URL:
        try:
            print("Attempting Cloudant connection...")
            return fetch_from_cloudant(CLOUDANT_URL, CLOUDANT_DB)
        except Exception as e:
            print(f"⚠ Cloudant connection failed: {e}")
            print("Falling back to local file...")
    
    # Fallback to local file
    try:
        return fetch_from_local(local_file)
    except FileNotFoundError:
        print(f"⚠ Local file not found: {local_file}")
        print("\nTo fix this:")
        print("1. Set CLOUDANT_URL environment variable, or")
        print("2. Ensure disaster_grid.json exists in the current directory")
        raise


def print_node_summary(nodes: List[Dict[str, Any]]) -> None:
    """
    Print a summary of fetched node data.
    
    Args:
        nodes: List of node documents
    """
    if not nodes:
        print("No nodes found.")
        return
    
    print("\n" + "="*60)
    print("Node Data Summary")
    print("="*60)
    print(f"Total nodes: {len(nodes)}")
    
    # Count by status
    status_counts = {}
    for node in nodes:
        status = node.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("\nStatus distribution:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count} ({count/len(nodes)*100:.1f}%)")
    
    # Count by device type
    type_counts = {}
    for node in nodes:
        dtype = node.get("device_type", "unknown")
        type_counts[dtype] = type_counts.get(dtype, 0) + 1
    
    print("\nDevice type distribution:")
    for dtype, count in sorted(type_counts.items()):
        print(f"  {dtype}: {count}")
    
    # Battery statistics
    batteries = [node.get("battery_level", 0) for node in nodes if node.get("battery_level", 0) > 0]
    if batteries:
        avg_battery = sum(batteries) / len(batteries)
        critical = sum(1 for b in batteries if b < 20)
        print(f"\nBattery statistics:")
        print(f"  Average: {avg_battery:.1f}%")
        print(f"  Critical (<20%): {critical} ({critical/len(batteries)*100:.1f}%)")


def main():
    parser = argparse.ArgumentParser(description="Fetch disaster node data from Cloudant or local file")
    parser.add_argument("--local", action="store_true", help="Force local file mode")
    parser.add_argument("--file", type=str, default=DEFAULT_LOCAL_FILE, 
                       help=f"Local JSON file path (default: {DEFAULT_LOCAL_FILE})")
    parser.add_argument("--summary-only", action="store_true", help="Only print summary, not individual nodes")
    parser.add_argument("--count", type=int, help="Limit number of nodes to print")
    
    args = parser.parse_args()
    
    print("="*60)
    print("MeshNet AI - Disaster Data Fetcher")
    print("="*60)
    
    try:
        nodes = fetch_disaster_data(use_local=args.local, local_file=args.file)
        
        # Print summary
        print_node_summary(nodes)
        
        # Print individual nodes if requested
        if not args.summary_only:
            print("\n" + "="*60)
            print("Node Details")
            print("="*60)
            
            limit = args.count if args.count else len(nodes)
            for i, node in enumerate(nodes[:limit]):
                print(f"\n[{i+1}] {node.get('node_id', 'Unknown')}")
                print(f"  Type: {node.get('device_type', 'Unknown')}")
                print(f"  Location: ({node.get('latitude', 0):.6f}, {node.get('longitude', 0):.6f})")
                print(f"  Battery: {node.get('battery_level', 0)}%")
                print(f"  Status: {node.get('status', 'Unknown')}")
                print(f"  Signal: {node.get('signal_strength', 0)}%")
        
        print("\n✓ Data fetch complete!")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
