"""
Offline Emergency Contact Search Functionality
backend/search_database.py

Provides search functionality for emergency contacts stored in SQLite database.
Supports various search types: name, location, category, geographic proximity.

Usage:
    python search_database.py --query "hospital" --type name
    python search_database.py --location "Manila" --radius 10
    python search_database.py --category medical
"""

import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import argparse
import math


def get_database_path() -> Path:
    """Get the default database path."""
    return Path(__file__).parent / "emergency_contacts.db"


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth.
    
    Args:
        lat1, lon1: Latitude and longitude of first point
        lat2, lon2: Latitude and longitude of second point
        
    Returns:
        Distance in kilometers
    """
    # Earth radius in kilometers
    R = 6371.0
    
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # Differences
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    # Haversine formula
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def search_by_name(conn: sqlite3.Connection, query: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search emergency contacts by name.
    
    Args:
        conn: SQLite connection
        query: Search query (partial name match)
        limit: Maximum number of results
        
    Returns:
        List of matching contacts
    """
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, phone, email, organization, role, location,
               latitude, longitude, category, availability, notes, last_updated
        FROM emergency_contacts
        WHERE name LIKE ?
        ORDER BY name
        LIMIT ?
    """, (f"%{query}%", limit))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_by_location(conn: sqlite3.Connection, query: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search emergency contacts by location.
    
    Args:
        conn: SQLite connection
        query: Location name (partial match)
        limit: Maximum number of results
        
    Returns:
        List of matching contacts
    """
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, phone, email, organization, role, location,
               latitude, longitude, category, availability, notes, last_updated
        FROM emergency_contacts
        WHERE location LIKE ?
        ORDER BY location
        LIMIT ?
    """, (f"%{query}%", limit))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_by_category(conn: sqlite3.Connection, category: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search emergency contacts by category.
    
    Args:
        conn: SQLite connection
        category: Category to filter by
        limit: Maximum number of results
        
    Returns:
        List of matching contacts
    """
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, phone, email, organization, role, location,
               latitude, longitude, category, availability, notes, last_updated
        FROM emergency_contacts
        WHERE category = ?
        ORDER BY name
        LIMIT ?
    """, (category, limit))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_by_availability(conn: sqlite3.Connection, availability: str = 'available', limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search emergency contacts by availability status.
    
    Args:
        conn: SQLite connection
        availability: Availability status (default: 'available')
        limit: Maximum number of results
        
    Returns:
        List of matching contacts
    """
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, phone, email, organization, role, location,
               latitude, longitude, category, availability, notes, last_updated
        FROM emergency_contacts
        WHERE availability = ?
        ORDER BY name
        LIMIT ?
    """, (availability, limit))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_by_proximity(conn: sqlite3.Connection, lat: float, lon: float, radius_km: float, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search emergency contacts within a geographic radius.
    
    Args:
        conn: SQLite connection
        lat: Center latitude
        lon: Center longitude
        radius_km: Search radius in kilometers
        limit: Maximum number of results
        
    Returns:
        List of contacts within radius, sorted by distance
    """
    cursor = conn.cursor()
    
    # Get all contacts with coordinates
    cursor.execute("""
        SELECT id, name, phone, email, organization, role, location,
               latitude, longitude, category, availability, notes, last_updated
        FROM emergency_contacts
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        contact = dict(zip(columns, row))
        distance = haversine_distance(lat, lon, contact['latitude'], contact['longitude'])
        
        if distance <= radius_km:
            contact['distance_km'] = round(distance, 2)
            results.append(contact)
    
    # Sort by distance
    results.sort(key=lambda x: x['distance_km'])
    
    return results[:limit]


def search_medical_facilities(conn: sqlite3.Connection, query: Optional[str] = None, 
                              limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search medical facilities.
    
    Args:
        conn: SQLite connection
        query: Optional search query for name or location
        limit: Maximum number of results
        
    Returns:
        List of medical facilities
    """
    cursor = conn.cursor()
    
    if query:
        cursor.execute("""
            SELECT id, name, type, location, latitude, longitude, beds_total,
                   beds_available, contact_phone, emergency_services, last_updated
            FROM medical_facilities
            WHERE name LIKE ? OR location LIKE ?
            ORDER BY name
            LIMIT ?
        """, (f"%{query}%", f"%{query}%", limit))
    else:
        cursor.execute("""
            SELECT id, name, type, location, latitude, longitude, beds_total,
                   beds_available, contact_phone, emergency_services, last_updated
            FROM medical_facilities
            ORDER BY name
            LIMIT ?
        """, (limit,))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_shelters(conn: sqlite3.Connection, query: Optional[str] = None, 
                    accepts_pets: Optional[bool] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search shelter locations.
    
    Args:
        conn: SQLite connection
        query: Optional search query for name or location
        accepts_pets: Filter by pet acceptance
        limit: Maximum number of results
        
    Returns:
        List of shelter locations
    """
    cursor = conn.cursor()
    
    if query and accepts_pets is not None:
        cursor.execute("""
            SELECT id, name, location, latitude, longitude, capacity,
                   current_occupancy, facilities, contact_phone, accepts_pets, last_updated
            FROM shelter_locations
            WHERE (name LIKE ? OR location LIKE ?) AND accepts_pets = ?
            ORDER BY capacity DESC
            LIMIT ?
        """, (f"%{query}%", f"%{query}%", 1 if accepts_pets else 0, limit))
    elif query:
        cursor.execute("""
            SELECT id, name, location, latitude, longitude, capacity,
                   current_occupancy, facilities, contact_phone, accepts_pets, last_updated
            FROM shelter_locations
            WHERE name LIKE ? OR location LIKE ?
            ORDER BY capacity DESC
            LIMIT ?
        """, (f"%{query}%", f"%{query}%", limit))
    elif accepts_pets is not None:
        cursor.execute("""
            SELECT id, name, location, latitude, longitude, capacity,
                   current_occupancy, facilities, contact_phone, accepts_pets, last_updated
            FROM shelter_locations
            WHERE accepts_pets = ?
            ORDER BY capacity DESC
            LIMIT ?
        """, (1 if accepts_pets else 0, limit))
    else:
        cursor.execute("""
            SELECT id, name, location, latitude, longitude, capacity,
                   current_occupancy, facilities, contact_phone, accepts_pets, last_updated
            FROM shelter_locations
            ORDER BY capacity DESC
            LIMIT ?
        """, (limit,))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def search_disaster_resources(conn: sqlite3.Connection, resource_type: Optional[str] = None,
                               status: str = 'active', limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search disaster resources.
    
    Args:
        conn: SQLite connection
        resource_type: Optional resource type filter
        status: Status filter (default: 'active')
        limit: Maximum number of results
        
    Returns:
        List of disaster resources
    """
    cursor = conn.cursor()
    
    if resource_type:
        cursor.execute("""
            SELECT id, name, type, location, latitude, longitude, capacity,
                   current_occupancy, contact_phone, status, last_updated
            FROM disaster_resources
            WHERE type = ? AND status = ?
            ORDER BY name
            LIMIT ?
        """, (resource_type, status, limit))
    else:
        cursor.execute("""
            SELECT id, name, type, location, latitude, longitude, capacity,
                   current_occupancy, contact_phone, status, last_updated
            FROM disaster_resources
            WHERE status = ?
            ORDER BY name
            LIMIT ?
        """, (status, limit))
    
    columns = [desc[0] for desc in cursor.description]
    results = []
    
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    
    return results


def log_search(conn: sqlite3.Connection, search_query: str, search_type: str, results_count: int) -> None:
    """
    Log a search query to the search history.
    
    Args:
        conn: SQLite connection
        search_query: The search query
        search_type: Type of search performed
        results_count: Number of results returned
    """
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO search_history (search_query, search_type, results_count)
        VALUES (?, ?, ?)
    """, (search_query, search_type, results_count))
    
    conn.commit()


def print_results(results: List[Dict[str, Any]], title: str = "Search Results") -> None:
    """
    Print search results in a formatted way.
    
    Args:
        results: List of result dictionaries
        title: Title for the results
    """
    print(f"\n{title}")
    print("=" * len(title))
    print(f"Found {len(results)} result(s)\n")
    
    if not results:
        print("No results found.")
        return
    
    for i, result in enumerate(results, 1):
        print(f"{i}. {result.get('name', 'N/A')}")
        
        # Print relevant fields based on result type
        if 'phone' in result:
            print(f"   Phone: {result.get('phone', 'N/A')}")
        if 'location' in result:
            print(f"   Location: {result.get('location', 'N/A')}")
        if 'category' in result:
            print(f"   Category: {result.get('category', 'N/A')}")
        if 'availability' in result:
            print(f"   Availability: {result.get('availability', 'N/A')}")
        if 'distance_km' in result:
            print(f"   Distance: {result.get('distance_km')} km")
        if 'type' in result:
            print(f"   Type: {result.get('type', 'N/A')}")
        if 'capacity' in result:
            print(f"   Capacity: {result.get('capacity', 'N/A')}")
        if 'beds_available' in result:
            print(f"   Beds Available: {result.get('beds_available', 'N/A')}")
        
        print()


def main():
    """Main entry point for database search."""
    parser = argparse.ArgumentParser(description='Search emergency contacts database')
    
    # Search type options
    parser.add_argument('--type', choices=['name', 'location', 'category', 'availability', 'proximity',
                                          'medical', 'shelter', 'resources'],
                       help='Type of search to perform')
    
    # Search query options
    parser.add_argument('--query', type=str, help='Search query string')
    parser.add_argument('--category', type=str, help='Category filter (for category search)')
    parser.add_argument('--availability', type=str, default='available', help='Availability status')
    
    # Geographic search options
    parser.add_argument('--lat', type=float, help='Center latitude for proximity search')
    parser.add_argument('--lon', type=float, help='Center longitude for proximity search')
    parser.add_argument('--radius', type=float, default=10, help='Search radius in kilometers')
    
    # Shelter-specific options
    parser.add_argument('--pets', action='store_true', help='Filter shelters that accept pets')
    
    # Resource-specific options
    parser.add_argument('--resource-type', type=str, help='Resource type filter')
    parser.add_argument('--status', type=str, default='active', help='Resource status filter')
    
    # General options
    parser.add_argument('--limit', type=int, default=50, help='Maximum number of results')
    parser.add_argument('--db', type=Path, help='Database file path')
    parser.add_argument('--json', action='store_true', help='Output results as JSON')
    
    args = parser.parse_args()
    
    # Get database path
    db_path = args.db if args.db else get_database_path()
    
    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        print("Run create_database.py first to create the database.")
        return
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    
    try:
        results = []
        search_type = args.type or 'name'
        search_query = args.query or ''
        
        # Perform search based on type
        if search_type == 'name':
            if not args.query:
                parser.error("--query is required for name search")
            results = search_by_name(conn, args.query, args.limit)
            
        elif search_type == 'location':
            if not args.query:
                parser.error("--query is required for location search")
            results = search_by_location(conn, args.query, args.limit)
            
        elif search_type == 'category':
            category = args.category or args.query
            if not category:
                parser.error("--category or --query is required for category search")
            results = search_by_category(conn, category, args.limit)
            
        elif search_type == 'availability':
            results = search_by_availability(conn, args.availability, args.limit)
            
        elif search_type == 'proximity':
            if args.lat is None or args.lon is None:
                parser.error("--lat and --lon are required for proximity search")
            results = search_by_proximity(conn, args.lat, args.lon, args.radius, args.limit)
            
        elif search_type == 'medical':
            results = search_medical_facilities(conn, args.query, args.limit)
            
        elif search_type == 'shelter':
            accepts_pets = args.pets if args.pets else None
            results = search_shelters(conn, args.query, accepts_pets, args.limit)
            
        elif search_type == 'resources':
            resource_type = args.resource_type
            results = search_disaster_resources(conn, resource_type, args.status, args.limit)
        
        # Log the search
        log_search(conn, search_query, search_type, len(results))
        
        # Output results
        if args.json:
            import json
            print(json.dumps(results, indent=2, default=str))
        else:
            print_results(results, f"{search_type.title()} Search Results")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
