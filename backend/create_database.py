"""
SQLite Database Initialization Script for Emergency Contacts
backend/create_database.py

Creates a SQLite database with tables for storing emergency contact information
and related data for offline access during disasters.

Usage:
    python create_database.py
"""

import sqlite3
from pathlib import Path
from typing import Optional


def create_database(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Create SQLite database with emergency contact tables.
    
    Args:
        db_path: Path to database file. Defaults to backend/emergency_contacts.db
        
    Returns:
        SQLite connection object
    """
    if db_path is None:
        db_path = Path(__file__).parent / "emergency_contacts.db"
    
    db_path = Path(db_path)
    
    # Remove existing database if it exists
    if db_path.exists():
        print(f"Removing existing database: {db_path}")
        db_path.unlink()
    
    # Create new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Creating database at: {db_path}")
    
    # Create emergency_contacts table
    cursor.execute("""
        CREATE TABLE emergency_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            organization TEXT,
            role TEXT,
            location TEXT,
            latitude REAL,
            longitude REAL,
            category TEXT,
            availability TEXT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
    """)
    
    # Create index on name for faster search
    cursor.execute("""
        CREATE INDEX idx_emergency_contacts_name 
        ON emergency_contacts(name)
    """)
    
    # Create index on location for geographic search
    cursor.execute("""
        CREATE INDEX idx_emergency_contacts_location 
        ON emergency_contacts(location)
    """)
    
    # Create index on category for filtering
    cursor.execute("""
        CREATE INDEX idx_emergency_contacts_category 
        ON emergency_contacts(category)
    """)
    
    # Create index on availability for filtering active contacts
    cursor.execute("""
        CREATE INDEX idx_emergency_contacts_availability 
        ON emergency_contacts(availability)
    """)
    
    # Create disaster_resources table
    cursor.execute("""
        CREATE TABLE disaster_resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            location TEXT,
            latitude REAL,
            longitude REAL,
            capacity INTEGER,
            current_occupancy INTEGER DEFAULT 0,
            contact_phone TEXT,
            status TEXT DEFAULT 'active',
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create index on resource type
    cursor.execute("""
        CREATE INDEX idx_disaster_resources_type 
        ON disaster_resources(type)
    """)
    
    # Create index on resource status
    cursor.execute("""
        CREATE INDEX idx_disaster_resources_status 
        ON disaster_resources(status)
    """)
    
    # Create medical_facilities table
    cursor.execute("""
        CREATE TABLE medical_facilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            location TEXT,
            latitude REAL,
            longitude REAL,
            beds_total INTEGER,
            beds_available INTEGER,
            contact_phone TEXT,
            emergency_services BOOLEAN DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create index on facility type
    cursor.execute("""
        CREATE INDEX idx_medical_facilities_type 
        ON medical_facilities(type)
    """)
    
    # Create shelter_locations table
    cursor.execute("""
        CREATE TABLE shelter_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT,
            latitude REAL,
            longitude REAL,
            capacity INTEGER,
            current_occupancy INTEGER DEFAULT 0,
            facilities TEXT,
            contact_phone TEXT,
            accepts_pets BOOLEAN DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create index on shelter capacity
    cursor.execute("""
        CREATE INDEX idx_shelter_locations_capacity 
        ON shelter_locations(capacity)
    """)
    
    # Create search_history table for tracking searches
    cursor.execute("""
        CREATE TABLE search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            search_query TEXT NOT NULL,
            search_type TEXT,
            results_count INTEGER,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create index on search timestamp
    cursor.execute("""
        CREATE INDEX idx_search_history_timestamp 
        ON search_history(timestamp)
    """)
    
    conn.commit()
    print("Database tables created successfully")
    
    return conn


def main():
    """Main entry point for database creation."""
    try:
        conn = create_database()
        print("\n✅ Database initialization complete")
        print(f"Database location: {Path(__file__).parent / 'emergency_contacts.db'}")
        conn.close()
    except Exception as e:
        print(f"\n❌ Error creating database: {e}")
        raise


if __name__ == "__main__":
    main()
