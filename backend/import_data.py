"""
JSON-to-SQLite Data Import Script for Emergency Contacts
backend/import_data.py

Imports emergency contact data from JSON files into the SQLite database.
Supports multiple data formats and provides validation.

Usage:
    python import_data.py --file data.json
    python import_data.py --file contacts.json --type emergency_contacts
    python import_data.py --directory ./data
"""

import json
import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List
import argparse


def get_database_path() -> Path:
    """Get the default database path."""
    return Path(__file__).parent / "emergency_contacts.db"


def import_emergency_contacts(conn: sqlite3.Connection, data: List[Dict[str, Any]]) -> int:
    """
    Import emergency contacts from JSON data.
    
    Args:
        conn: SQLite connection
        data: List of contact dictionaries
        
    Returns:
        Number of records imported
    """
    cursor = conn.cursor()
    imported = 0
    
    for contact in data:
        try:
            cursor.execute("""
                INSERT INTO emergency_contacts (
                    name, phone, email, organization, role, location,
                    latitude, longitude, category, availability, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                contact.get('name'),
                contact.get('phone'),
                contact.get('email'),
                contact.get('organization'),
                contact.get('role'),
                contact.get('location'),
                contact.get('latitude'),
                contact.get('longitude'),
                contact.get('category'),
                contact.get('availability', 'available'),
                contact.get('notes')
            ))
            imported += 1
        except Exception as e:
            print(f"Error importing contact {contact.get('name', 'unknown')}: {e}")
    
    conn.commit()
    return imported


def import_disaster_resources(conn: sqlite3.Connection, data: List[Dict[str, Any]]) -> int:
    """
    Import disaster resources from JSON data.
    
    Args:
        conn: SQLite connection
        data: List of resource dictionaries
        
    Returns:
        Number of records imported
    """
    cursor = conn.cursor()
    imported = 0
    
    for resource in data:
        try:
            cursor.execute("""
                INSERT INTO disaster_resources (
                    name, type, location, latitude, longitude, capacity,
                    current_occupancy, contact_phone, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                resource.get('name'),
                resource.get('type'),
                resource.get('location'),
                resource.get('latitude'),
                resource.get('longitude'),
                resource.get('capacity'),
                resource.get('current_occupancy', 0),
                resource.get('contact_phone'),
                resource.get('status', 'active')
            ))
            imported += 1
        except Exception as e:
            print(f"Error importing resource {resource.get('name', 'unknown')}: {e}")
    
    conn.commit()
    return imported


def import_medical_facilities(conn: sqlite3.Connection, data: List[Dict[str, Any]]) -> int:
    """
    Import medical facilities from JSON data.
    
    Args:
        conn: SQLite connection
        data: List of facility dictionaries
        
    Returns:
        Number of records imported
    """
    cursor = conn.cursor()
    imported = 0
    
    for facility in data:
        try:
            cursor.execute("""
                INSERT INTO medical_facilities (
                    name, type, location, latitude, longitude, beds_total,
                    beds_available, contact_phone, emergency_services
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                facility.get('name'),
                facility.get('type'),
                facility.get('location'),
                facility.get('latitude'),
                facility.get('longitude'),
                facility.get('beds_total'),
                facility.get('beds_available'),
                facility.get('contact_phone'),
                facility.get('emergency_services', 0)
            ))
            imported += 1
        except Exception as e:
            print(f"Error importing facility {facility.get('name', 'unknown')}: {e}")
    
    conn.commit()
    return imported


def import_shelter_locations(conn: sqlite3.Connection, data: List[Dict[str, Any]]) -> int:
    """
    Import shelter locations from JSON data.
    
    Args:
        conn: SQLite connection
        data: List of shelter dictionaries
        
    Returns:
        Number of records imported
    """
    cursor = conn.cursor()
    imported = 0
    
    for shelter in data:
        try:
            cursor.execute("""
                INSERT INTO shelter_locations (
                    name, location, latitude, longitude, capacity,
                    current_occupancy, facilities, contact_phone, accepts_pets
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                shelter.get('name'),
                shelter.get('location'),
                shelter.get('latitude'),
                shelter.get('longitude'),
                shelter.get('capacity'),
                shelter.get('current_occupancy', 0),
                shelter.get('facilities'),
                shelter.get('contact_phone'),
                shelter.get('accepts_pets', 0)
            ))
            imported += 1
        except Exception as e:
            print(f"Error importing shelter {shelter.get('name', 'unknown')}: {e}")
    
    conn.commit()
    return imported


def import_json_file(file_path: Path, data_type: str, db_path: Optional[Path] = None) -> int:
    """
    Import data from a JSON file into the database.
    
    Args:
        file_path: Path to JSON file
        data_type: Type of data (emergency_contacts, disaster_resources, etc.)
        db_path: Path to database file
        
    Returns:
        Number of records imported
    """
    if db_path is None:
        db_path = get_database_path()
    
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}. Run create_database.py first.")
    
    # Load JSON data
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Handle both single object and array
    if isinstance(data, dict):
        data = [data]
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    
    # Import based on type
    importers = {
        'emergency_contacts': import_emergency_contacts,
        'disaster_resources': import_disaster_resources,
        'medical_facilities': import_medical_facilities,
        'shelter_locations': import_shelter_locations
    }
    
    importer = importers.get(data_type)
    if not importer:
        conn.close()
        raise ValueError(f"Unknown data type: {data_type}. Valid types: {list(importers.keys())}")
    
    imported = importer(conn, data)
    conn.close()
    
    return imported


def import_directory(directory: Path, db_path: Optional[Path] = None) -> Dict[str, int]:
    """
    Import all JSON files from a directory.
    
    Args:
        directory: Path to directory containing JSON files
        db_path: Path to database file
        
    Returns:
        Dictionary mapping file types to import counts
    """
    results = {}
    
    for json_file in directory.glob('*.json'):
        # Determine data type from filename
        filename = json_file.stem.lower()
        
        if 'contact' in filename:
            data_type = 'emergency_contacts'
        elif 'resource' in filename:
            data_type = 'disaster_resources'
        elif 'medical' in filename or 'hospital' in filename:
            data_type = 'medical_facilities'
        elif 'shelter' in filename:
            data_type = 'shelter_locations'
        else:
            print(f"Skipping {json_file.name}: cannot determine data type")
            continue
        
        try:
            count = import_json_file(json_file, data_type, db_path)
            results[data_type] = results.get(data_type, 0) + count
            print(f"✅ Imported {count} records from {json_file.name} as {data_type}")
        except Exception as e:
            print(f"❌ Failed to import {json_file.name}: {e}")
    
    return results


def create_sample_data(output_path: Path) -> None:
    """
    Create sample JSON data files for testing.
    
    Args:
        output_path: Directory to write sample files
    """
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Sample emergency contacts
    emergency_contacts = [
        {
            "name": "Dr. Maria Santos",
            "phone": "+63-917-123-4567",
            "email": "maria.santos@hospital.gov",
            "organization": "Manila General Hospital",
            "role": "Emergency Response Coordinator",
            "location": "Manila, Philippines",
            "latitude": 14.5995,
            "longitude": 120.9842,
            "category": "medical",
            "availability": "available",
            "notes": "Specializes in disaster response"
        },
        {
            "name": "Fire Chief Juan Dela Cruz",
            "phone": "+63-918-234-5678",
            "email": "j.delacruz@fire.gov",
            "organization": "Bureau of Fire Protection",
            "role": "Fire Chief",
            "location": "Quezon City, Philippines",
            "latitude": 14.6760,
            "longitude": 121.0437,
            "category": "fire",
            "availability": "available",
            "notes": "24/7 emergency response"
        }
    ]
    
    with open(output_path / "emergency_contacts.json", 'w') as f:
        json.dump(emergency_contacts, f, indent=2)
    
    # Sample disaster resources
    disaster_resources = [
        {
            "name": "Central Warehouse",
            "type": "supplies",
            "location": "Makati, Philippines",
            "latitude": 14.5547,
            "longitude": 121.0244,
            "capacity": 10000,
            "current_occupancy": 5000,
            "contact_phone": "+63-919-345-6789",
            "status": "active"
        }
    ]
    
    with open(output_path / "disaster_resources.json", 'w') as f:
        json.dump(disaster_resources, f, indent=2)
    
    # Sample medical facilities
    medical_facilities = [
        {
            "name": "St. Luke's Medical Center",
            "type": "hospital",
            "location": "Quezon City, Philippines",
            "latitude": 14.6328,
            "longitude": 121.0365,
            "beds_total": 500,
            "beds_available": 150,
            "contact_phone": "+63-920-456-7890",
            "emergency_services": 1
        }
    ]
    
    with open(output_path / "medical_facilities.json", 'w') as f:
        json.dump(medical_facilities, f, indent=2)
    
    # Sample shelter locations
    shelter_locations = [
        {
            "name": "Evacuation Center A",
            "location": "Pasig, Philippines",
            "latitude": 14.5764,
            "longitude": 121.0851,
            "capacity": 500,
            "current_occupancy": 200,
            "facilities": "Food, Water, Medical",
            "contact_phone": "+63-921-567-8901",
            "accepts_pets": 1
        }
    ]
    
    with open(output_path / "shelter_locations.json", 'w') as f:
        json.dump(shelter_locations, f, indent=2)
    
    print(f"✅ Sample data created in {output_path}")


def main():
    """Main entry point for data import."""
    parser = argparse.ArgumentParser(description='Import emergency contact data from JSON to SQLite')
    parser.add_argument('--file', type=Path, help='JSON file to import')
    parser.add_argument('--type', choices=['emergency_contacts', 'disaster_resources', 'medical_facilities', 'shelter_locations'],
                       help='Type of data to import')
    parser.add_argument('--directory', type=Path, help='Directory containing JSON files')
    parser.add_argument('--db', type=Path, help='Database file path')
    parser.add_argument('--create-sample', type=Path, help='Create sample data files in specified directory')
    
    args = parser.parse_args()
    
    try:
        if args.create_sample:
            create_sample_data(args.create_sample)
        elif args.file:
            if not args.type:
                # Auto-detect type from filename
                filename = args.file.stem.lower()
                if 'contact' in filename:
                    args.type = 'emergency_contacts'
                elif 'resource' in filename:
                    args.type = 'disaster_resources'
                elif 'medical' in filename or 'hospital' in filename:
                    args.type = 'medical_facilities'
                elif 'shelter' in filename:
                    args.type = 'shelter_locations'
                else:
                    parser.error("--type is required when filename doesn't indicate type")
            
            count = import_json_file(args.file, args.type, args.db)
            print(f"\n✅ Imported {count} records from {args.file.name}")
        elif args.directory:
            results = import_directory(args.directory, args.db)
            total = sum(results.values())
            print(f"\n✅ Imported {total} total records from {args.directory}")
            for data_type, count in results.items():
                print(f"   {data_type}: {count}")
        else:
            parser.print_help()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise


if __name__ == "__main__":
    main()
