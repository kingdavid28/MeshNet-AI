"""
local_backend.py
────────────────────────────────────────────────────────────────────────────
Local Flask backend server for standalone Kivy app.

This module provides a local HTTP server that runs on the device,
replacing the need for a remote backend. It handles:
- Device registration and topology management
- Emergency contact database (local SQLite)
- Medical facilities and shelter data
- P2P mesh coordination
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import threading
import json
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import uuid
import os


@dataclass
class MeshNode:
    """Mesh network node data structure."""
    id: str
    label: str
    lat: float
    lng: float
    battery: int
    signal: int
    device: str
    role: str
    last_seen: str


@dataclass
class EmergencyContact:
    """Emergency contact data structure."""
    id: str
    name: str
    phone: str
    email: str
    category: str
    location: str
    medical_specialty: Optional[str] = None


class LocalBackend:
    """
    Local backend server for standalone operation.
    
    Runs Flask server on localhost with SQLite database for data persistence.
    """
    
    def __init__(self, port: int = 4000):
        self.port = port
        self.app = Flask(__name__)
        # CORS is enabled for local development - acceptable for standalone local backend
        CORS(self.app)
        self.db_path = os.path.join(os.path.dirname(__file__), 'local_data.db')
        self.nodes: Dict[str, MeshNode] = {}
        self._server_thread: Optional[threading.Thread] = None
        self._running = False
        
        # WebRTC signaling state (thread-safe)
        self._webrtc_lock = threading.Lock()
        self._webrtc_offers: Dict[str, List[Dict]] = {}
        self._webrtc_answers: Dict[str, List[Dict]] = {}
        self._webrtc_candidates: Dict[str, List[Dict]] = {}
        
        self._setup_routes()
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database with required tables."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Emergency contacts table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS emergency_contacts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    email TEXT,
                    category TEXT NOT NULL,
                    location TEXT,
                    medical_specialty TEXT
                )
            ''')
            
            # Medical facilities table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS medical_facilities (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    type TEXT,
                    phone TEXT,
                    address TEXT
                )
            ''')
            
            # Shelters table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS shelters (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    capacity INTEGER,
                    current_occupancy INTEGER,
                    phone TEXT,
                    address TEXT
                )
            ''')
            
            conn.commit()
            
            # Seed with sample data if empty
            self._seed_sample_data(cursor)
            conn.commit()
    
    def _seed_sample_data(self, cursor):
        """Seed database with sample emergency data."""
        # Check if data already exists
        cursor.execute('SELECT COUNT(*) FROM emergency_contacts')
        if cursor.fetchone()[0] > 0:
            return
        
        # Sample emergency contacts
        contacts = [
            ('1', 'Dr. John Smith', '+1234567890', 'john@hospital.com', 'medical', 'City Hospital', 'Emergency Medicine'),
            ('2', 'Fire Department', '+1234567891', 'fire@city.gov', 'fire', 'Central Station', None),
            ('3', 'Police Station', '+1234567892', 'police@city.gov', 'police', 'Downtown', None),
        ]
        
        cursor.executemany('''
            INSERT INTO emergency_contacts (id, name, phone, email, category, location, medical_specialty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', contacts)
        
        # Sample medical facilities
        facilities = [
            ('1', 'City General Hospital', 40.7128, -74.0060, 'hospital', '+1234567890', '123 Main St'),
            ('2', 'Urgent Care Center', 40.7138, -74.0070, 'clinic', '+1234567891', '456 Oak Ave'),
        ]
        
        cursor.executemany('''
            INSERT INTO medical_facilities (id, name, lat, lng, type, phone, address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', facilities)
        
        # Sample shelters
        shelters = [
            ('1', 'Emergency Shelter A', 40.7148, -74.0080, 100, 45, '+1234567892', '789 Pine Rd'),
            ('2', 'Community Center', 40.7158, -74.0090, 50, 20, '+1234567893', '321 Elm St'),
        ]
        
        cursor.executemany('''
            INSERT INTO shelters (id, name, lat, lng, capacity, current_occupancy, phone, address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', shelters)
    
    def _setup_routes(self):
        """Setup Flask routes for API endpoints."""
        
        @self.app.route('/api/mesh/register', methods=['POST'])
        def register_device():
            """Register a device in the mesh network."""
            data = request.json
            node_id = data.get('id', str(uuid.uuid4()))
            
            node = MeshNode(
                id=node_id,
                label=data.get('label', 'Unknown'),
                lat=data.get('lat', 0.0),
                lng=data.get('lng', 0.0),
                battery=data.get('battery', 100),
                signal=data.get('signal', 0),
                device=data.get('device', 'unknown'),
                role=data.get('role', 'peer'),
                last_seen=datetime.now().isoformat()
            )
            
            self.nodes[node_id] = node
            return jsonify({'success': True, 'node_id': node_id})
        
        @self.app.route('/api/mesh/topology', methods=['GET'])
        def get_topology():
            """Get current mesh network topology."""
            nodes_list = [asdict(node) for node in self.nodes.values()]
            return jsonify(nodes_list)
        
        @self.app.route('/api/mesh/nodes/<node_id>', methods=['GET'])
        def get_node(node_id: str):
            """Get specific node information."""
            if node_id in self.nodes:
                return jsonify(asdict(self.nodes[node_id]))
            return jsonify({'error': 'Node not found'}), 404
        
        @self.app.route('/api/mesh/nodes/<node_id>', methods=['PUT'])
        def update_node(node_id: str):
            """Update node information."""
            if node_id not in self.nodes:
                return jsonify({'error': 'Node not found'}), 404
            
            data = request.json
            node = self.nodes[node_id]
            
            if 'lat' in data:
                node.lat = data['lat']
            if 'lng' in data:
                node.lng = data['lng']
            if 'battery' in data:
                node.battery = data['battery']
            if 'signal' in data:
                node.signal = data['signal']
            if 'role' in data:
                node.role = data['role']
            
            node.last_seen = datetime.now().isoformat()
            
            return jsonify({'success': True})
        
        @self.app.route('/api/emergency/search', methods=['GET'])
        def search_contacts():
            """Search emergency contacts."""
            query = request.args.get('q', '')
            category = request.args.get('category', '')
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                if query and category:
                    cursor.execute('''
                        SELECT * FROM emergency_contacts 
                        WHERE (name LIKE ? OR location LIKE ?) AND category = ?
                    ''', (f'%{query}%', f'%{query}%', category))
                elif query:
                    cursor.execute('''
                        SELECT * FROM emergency_contacts 
                        WHERE name LIKE ? OR location LIKE ?
                    ''', (f'%{query}%', f'%{query}%'))
                elif category:
                    cursor.execute('''
                        SELECT * FROM emergency_contacts WHERE category = ?
                    ''', (category,))
                else:
                    cursor.execute('SELECT * FROM emergency_contacts')
                
                results = cursor.fetchall()
                contacts = []
                for row in results:
                    contacts.append({
                        'id': row[0],
                        'name': row[1],
                        'phone': row[2],
                        'email': row[3],
                        'category': row[4],
                        'location': row[5],
                        'medical_specialty': row[6]
                    })
                
                return jsonify(contacts)
        
        @self.app.route('/api/emergency/medical', methods=['GET'])
        def get_medical_facilities():
            """Get medical facilities near a location."""
            lat = float(request.args.get('lat', 0))
            lng = float(request.args.get('lng', 0))
            radius = float(request.args.get('radius', 10))
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM medical_facilities')
                results = cursor.fetchall()
                
                facilities = []
                for row in results:
                    # Simple distance calculation
                    distance = ((row[2] - lat)**2 + (row[3] - lng)**2)**0.5
                    if distance <= radius:
                        facilities.append({
                            'id': row[0],
                            'name': row[1],
                            'lat': row[2],
                            'lng': row[3],
                            'type': row[4],
                            'phone': row[5],
                            'address': row[6],
                            'distance': distance
                        })
                
                return jsonify(facilities)
        
        @self.app.route('/api/emergency/shelters', methods=['GET'])
        def get_shelters():
            """Get emergency shelters near a location."""
            lat = float(request.args.get('lat', 0))
            lng = float(request.args.get('lng', 0))
            radius = float(request.args.get('radius', 10))
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM shelters')
                results = cursor.fetchall()
                
                shelters = []
                for row in results:
                    # Simple distance calculation
                    distance = ((row[2] - lat)**2 + (row[3] - lng)**2)**0.5
                    if distance <= radius:
                        shelters.append({
                            'id': row[0],
                            'name': row[1],
                            'lat': row[2],
                            'lng': row[3],
                            'capacity': row[4],
                            'current_occupancy': row[5],
                            'phone': row[6],
                            'address': row[7],
                            'distance': distance
                        })
                
                return jsonify(shelters)
        
        @self.app.route('/api/emergency/sos', methods=['POST'])
        def send_sos():
            """Send SOS alert (stored locally for P2P distribution)."""
            data = request.json
            sos_id = str(uuid.uuid4())
            
            # In a real implementation, this would be distributed via P2P
            # For now, store in nodes as emergency role
            node_id = data.get('node_id')
            if node_id in self.nodes:
                self.nodes[node_id].role = 'emergency'
            
            return jsonify({'success': True, 'sos_id': sos_id})
        
        @self.app.route('/api/health', methods=['GET'])
        def health_check():
            """Health check endpoint."""
            return jsonify({
                'status': 'healthy',
                'nodes': len(self.nodes),
                'port': self.port
            })
        
        # ── WebRTC signaling endpoints ──────────────────────────────────────────
        
        @self.app.route('/api/webrtc/offer/<node_id>', methods=['GET'])
        @self.app.route('/api/webrtc/offer', methods=['GET'])
        def get_webrtc_offer(node_id='ALL'):
            """Get WebRTC offers for a target node."""
            with self._webrtc_lock:
                offers = self._webrtc_offers.get(node_id, [])
                # Clear read offers to act as a queue
                if node_id in self._webrtc_offers:
                    self._webrtc_offers[node_id] = []
            return jsonify({'offers': offers})
        
        @self.app.route('/api/webrtc/offer', methods=['POST'])
        def post_webrtc_offer():
            """Post WebRTC offer for a target node."""
            data = request.json
            target = data.get('target_node_id', 'ALL')
            offer = data.get('offer')
            sender = data.get('sender_node_id')
            
            if not offer:
                return jsonify({'error': 'Missing offer'}), 400
            
            with self._webrtc_lock:
                if target not in self._webrtc_offers:
                    self._webrtc_offers[target] = []
                self._webrtc_offers[target].append({
                    'sender_node_id': sender,
                    'offer': offer,
                    'timestamp': int(datetime.now().timestamp())
                })
            
            return jsonify({'status': 'SUCCESS'})
        
        @self.app.route('/api/webrtc/answer/<node_id>', methods=['GET'])
        @self.app.route('/api/webrtc/answer', methods=['GET'])
        def get_webrtc_answer(node_id='ALL'):
            """Get WebRTC answers for a target node."""
            with self._webrtc_lock:
                answers = self._webrtc_answers.get(node_id, [])
                if node_id in self._webrtc_answers:
                    self._webrtc_answers[node_id] = []
            return jsonify({'answers': answers})
        
        @self.app.route('/api/webrtc/answer', methods=['POST'])
        def post_webrtc_answer():
            """Post WebRTC answer for a target node."""
            data = request.json
            target = data.get('target_node_id', 'ALL')
            answer = data.get('answer')
            sender = data.get('sender_node_id')
            
            if not answer:
                return jsonify({'error': 'Missing answer'}), 400
            
            with self._webrtc_lock:
                if target not in self._webrtc_answers:
                    self._webrtc_answers[target] = []
                self._webrtc_answers[target].append({
                    'sender_node_id': sender,
                    'answer': answer
                })
            
            return jsonify({'status': 'SUCCESS'})
        
        @self.app.route('/api/webrtc/candidates/<node_id>', methods=['GET'])
        @self.app.route('/api/webrtc/candidates', methods=['GET'])
        def get_webrtc_candidates(node_id='ALL'):
            """Get WebRTC ICE candidates for a target node."""
            with self._webrtc_lock:
                candidates = self._webrtc_candidates.get(node_id, [])
                if node_id in self._webrtc_candidates:
                    self._webrtc_candidates[node_id] = []
            return jsonify({'candidates': candidates})
        
        @self.app.route('/api/webrtc/candidates', methods=['POST'])
        def post_webrtc_candidate():
            """Post WebRTC ICE candidate for a target node."""
            data = request.json
            target = data.get('target_node_id', 'ALL')
            candidate = data.get('candidate')
            sender = data.get('sender_node_id')
            
            if not candidate:
                return jsonify({'error': 'Missing candidate'}), 400
            
            with self._webrtc_lock:
                if target not in self._webrtc_candidates:
                    self._webrtc_candidates[target] = []
                self._webrtc_candidates[target].append({
                    'sender_node_id': sender,
                    'candidate': candidate
                })
            
            return jsonify({'status': 'SUCCESS'})
    
    def start(self):
        """Start the local backend server."""
        if self._running:
            return
        
        self._running = True
        self._server_thread = threading.Thread(
            target=self._run_server,
            daemon=True
        )
        self._server_thread.start()
        print(f"[LocalBackend] Server started on port {self.port}")
    
    def _run_server(self):
        """Run the Flask server."""
        self.app.run(host='127.0.0.1', port=self.port, debug=False, use_reloader=False)
    
    def stop(self):
        """Stop the local backend server."""
        self._running = False
        if self._server_thread:
            self._server_thread.join(timeout=2)
        print("[LocalBackend] Server stopped")
    
    def get_url(self) -> str:
        """Get the local backend URL."""
        return f"http://127.0.0.1:{self.port}"


# Singleton instance
_local_backend: Optional[LocalBackend] = None


def get_local_backend(port: int = 4000) -> LocalBackend:
    """Get the singleton local backend instance."""
    global _local_backend
    if _local_backend is None:
        _local_backend = LocalBackend(port)
    return _local_backend
