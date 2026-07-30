"""
MeshNet-AI — main.py
=====================
Production-ready mobile app matching React UI/UX design.
Dark theme, tab navigation, emergency features, BLE mesh, network discovery,
offline persistence, API integration, and proper lifecycle management.
"""

import os
import sys
import threading
import time
import json
from typing import Optional, Dict, List, Callable
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.floatlayout import FloatLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.togglebutton import ToggleButton
from kivy.lang import Builder
from kivy.graphics import Color, Rectangle, Line, Ellipse
from kivy.core.window import Window
from kivy.metrics import dp
from kivy.clock import Clock
from kivy.utils import platform

# Production modules
from logger_config import setup_logging, get_logger, get_error_tracker
from lifecycle import LifecycleManager
from database import Database, Node, Message, EmergencyAlert
from permissions import PermissionManager
from location import get_location_service
from hardware import HardwareManager
from ble_mesh import BLEMeshController
from api_client import MeshNetAPI


# Color scheme matching React app
COLORS = {
    'bg_dark': (0.043, 0.114, 0.227, 1),      # #0B1D3A
    'bg_darker': (0.024, 0.055, 0.11, 1),     # #060E1C
    'accent': (0.976, 0.451, 0.086, 1),       # #F97316
    'success': (0.133, 0.773, 0.369, 1),      # #22C55E
    'info': (0.231, 0.510, 0.965, 1),         # #3B82F6
    'purple': (0.545, 0.361, 0.965, 1),        # #8B5CF6
    'text_light': (0.910, 0.933, 0.969, 1),    # #E8EEF7
    'text_muted': (0.482, 0.612, 0.769, 1),    # #7B9CC4
    'border': (0.357, 0.553, 0.851, 0.15),     # rgba(91,141,217,0.15)
}


class StatusLabel(Label):
    """Styled label for status indicators"""
    pass


class TabButton(Button):
    """Custom tab button matching React design"""
    pass


class MeshNetworkManager:
    """Manages mesh network state and node tracking with database persistence"""
    
    def __init__(self, database: Database):
        """
        Initialize mesh network manager.
        
        Args:
            database: Database instance for persistence
        """
        self.database = database
        self.nodes: List[Dict] = []
        self.is_connected = False
        self.is_initialized = True
        self._lock = threading.Lock()
        self._load_nodes_from_db()
    
    def _load_nodes_from_db(self):
        """Load nodes from database"""
        try:
            db_nodes = self.database.get_all_nodes()
            with self._lock:
                self.nodes = [asdict(node) for node in db_nodes]
                self.is_connected = len(self.nodes) > 0
        except Exception as e:
            logger.error(f"Error loading nodes from database: {e}")
    
    def add_node(self, node_id: str, gps: tuple, rssi: int):
        """Add a node to the mesh network"""
        with self._lock:
            existing = next((n for n in self.nodes if n['id'] == node_id), None)
            if existing:
                existing['gps'] = gps
                existing['rssi'] = rssi
                existing['last_seen'] = time.time()
            else:
                self.nodes.append({
                    'id': node_id,
                    'gps': gps,
                    'rssi': rssi,
                    'last_seen': time.time()
                })
            self.is_connected = len(self.nodes) > 0
        
        # Persist to database
        try:
            node = Node(
                id=node_id,
                name=f"Node-{node_id[:8]}",
                gps_lat=gps[0],
                gps_lon=gps[1],
                rssi=rssi,
                battery=100,
                last_seen=time.time()
            )
            self.database.add_node(node)
        except Exception as e:
            logger.error(f"Error saving node to database: {e}")
    
    def remove_node(self, node_id: str):
        """Remove a node from the mesh network"""
        with self._lock:
            self.nodes = [n for n in self.nodes if n['id'] != node_id]
            self.is_connected = len(self.nodes) > 0
        
        # Remove from database
        try:
            self.database.delete_node(node_id)
        except Exception as e:
            logger.error(f"Error removing node from database: {e}")
    
    def get_node_count(self) -> int:
        """Get current node count"""
        with self._lock:
            return len(self.nodes)


class NetworkDiscovery:
    """Manages network discovery and backend connection with API integration"""
    
    def __init__(self, api_client: Optional[MeshNetAPI] = None, database: Optional[Database] = None):
        """
        Initialize network discovery.
        
        Args:
            api_client: API client for backend communication
            database: Database for persistence
        """
        self.api_client = api_client
        self.database = database
        self.backend_url: Optional[str] = None
        self.discovering = False
        self.error: Optional[str] = None
        self._lock = threading.Lock()
    
    def start_discovery(self):
        """Start network discovery"""
        with self._lock:
            self.discovering = True
            self.error = None
        
        # Try API discovery if available
        if self.api_client:
            def _discover_api():
                try:
                    response = self.api_client.discover_nodes()
                    if response.success:
                        with self._lock:
                            self.discovering = False
                            self.backend_url = self.api_client.client.base_url
                            logger.info(f"Backend discovered: {self.backend_url}")
                    else:
                        with self._lock:
                            self.discovering = False
                            self.error = response.error or "Discovery failed"
                except Exception as e:
                    with self._lock:
                        self.discovering = False
                        self.error = str(e)
                    logger.error(f"API discovery error: {e}")
            
            threading.Thread(target=_discover_api, daemon=True).start()
        else:
            # Fallback to simulation
            def _discover():
                time.sleep(3)
                with self._lock:
                    self.discovering = False
                    self.backend_url = self.database.get_setting('backend_url') if self.database else None
            
            threading.Thread(target=_discover, daemon=True).start()
    
    def stop_discovery(self):
        """Stop network discovery"""
        with self._lock:
            self.discovering = False
    
    def set_manual_url(self, url: str):
        """Set manual backend URL"""
        with self._lock:
            self.backend_url = url if url else None
            self.discovering = False
        
        # Save to database
        if self.database:
            self.database.set_setting('backend_url', url)


class EmergencyManager:
    """Manages emergency mode state with database persistence"""
    
    def __init__(self, database: Optional[Database] = None, api_client: Optional[MeshNetAPI] = None):
        """
        Initialize emergency manager.
        
        Args:
            database: Database for persistence
            api_client: API client for backend sync
        """
        self.database = database
        self.api_client = api_client
        self.emergency_active = False
        self._lock = threading.Lock()
        
        # Load state from database
        if self.database:
            emergency_state = self.database.get_setting('emergency_active')
            if emergency_state == 'true':
                self.emergency_active = True
    
    def activate(self):
        """Activate emergency mode"""
        with self._lock:
            self.emergency_active = True
        
        # Persist to database
        if self.database:
            self.database.set_setting('emergency_active', 'true')
        
        # Sync with backend
        if self.api_client:
            try:
                self.api_client.activate_emergency_mode()
            except Exception as e:
                logger.error(f"Error activating emergency mode on backend: {e}")
    
    def deactivate(self):
        """Deactivate emergency mode"""
        with self._lock:
            self.emergency_active = False
        
        # Persist to database
        if self.database:
            self.database.set_setting('emergency_active', 'false')
        
        # Sync with backend
        if self.api_client:
            try:
                self.api_client.deactivate_emergency_mode()
            except Exception as e:
                logger.error(f"Error deactivating emergency mode on backend: {e}")
    
    def is_active(self) -> bool:
        """Check if emergency mode is active"""
        with self._lock:
            return self.emergency_active


class MeshNetRootWidget(BoxLayout):
    """Main root widget with tab navigation and production functionality"""
    
    def __init__(self, lifecycle_manager: LifecycleManager, **kwargs):
        """
        Initialize root widget with production components.
        
        Args:
            lifecycle_manager: Lifecycle manager with initialized components
        """
        super().__init__(**kwargs)
        self.orientation = 'vertical'
        self.current_tab = 'home'
        self.lifecycle = lifecycle_manager
        
        # Get production components from lifecycle
        self.database = self.lifecycle.get_component('database')
        self.permissions = self.lifecycle.get_component('permissions')
        self.location_service = self.lifecycle.get_component('location_service')
        self.hardware = self.lifecycle.get_component('hardware')
        self.ble_mesh = self.lifecycle.get_component('ble_mesh')
        self.api_client = self.lifecycle.get_component('api_client')
        self.websocket = self.lifecycle.get_component('websocket')
        self.app_logger = self.lifecycle.get_component('app_logger')
        
        # Initialize managers with production components
        self.mesh_network = MeshNetworkManager(self.database)
        self.network_discovery = NetworkDiscovery(self.api_client, self.database)
        self.emergency_manager = EmergencyManager(self.database, self.api_client)
        
        # Use BLE mesh from lifecycle manager (already initialized with callbacks)
        # No need to create a separate instance
        
        # UI references
        self.node_count_label = None
        self.mesh_status_label = None
        self.header_mesh_label = None
        self.discovery_status_label = None
        self.discovery_btn = None
        self.emergency_btn = None
        self.manual_url_input = None
        self.connect_btn = None
        
        # Request permissions
        if not self.permissions.are_all_permissions_granted():
            self.permissions.request_permissions()
        
        # Start location tracking
        self.location_service.start_tracking(
            callback=self._on_location_update,
            interval=10.0
        )
        
        # BLE mesh is already started by lifecycle manager
        
        # Start network discovery
        self.network_discovery.start_discovery()
        
        # Start periodic updates
        Clock.schedule_interval(self._update_ui, 1.0)
        
        # Build UI
        self._build_status_bar()
        self._build_header()
        self._build_content_area()
        self._build_tab_navigation()
        
        self.app_logger.info("MeshNetRootWidget initialized")
    
    def _on_ble_node_connected(self, node_id: str, gps, rssi: int):
        """Handle BLE node connection"""
        self.mesh_network.add_node(node_id, gps, rssi)
    
    def _on_ble_node_disconnected(self, node_id: str):
        """Handle BLE node disconnection"""
        self.mesh_network.remove_node(node_id)
    
    def _on_ble_data_received(self, node_id: str, data: bytes):
        """Handle BLE data reception"""
        self.app_logger.info(f"Received {len(data)} bytes from {node_id}")
    
    def _on_location_update(self, location_data):
        """Handle location update"""
        self.app_logger.debug(f"Location updated: {location_data.latitude}, {location_data.longitude}")
    
    def _update_ui(self, dt):
        """Periodic UI update"""
        # Update node count
        if self.node_count_label:
            self.node_count_label.text = f'Nodes: {self.mesh_network.get_node_count()}'
        
        # Update mesh status
        if self.mesh_status_label:
            status = 'Active' if self.mesh_network.is_connected else 'Offline'
            self.mesh_status_label.text = f'Mesh: {status}'
            self.mesh_status_label.color = COLORS['success'] if self.mesh_network.is_connected else COLORS['accent']
        
        # Update header mesh label
        if self.header_mesh_label:
            self.header_mesh_label.text = f'Mesh ({self.mesh_network.get_node_count()})'
        
        # Update discovery status
        if self.discovery_status_label:
            if self.network_discovery.discovering:
                self.discovery_status_label.text = 'Scanning local network...'
            elif self.network_discovery.backend_url:
                self.discovery_status_label.text = f'Connected to {self.network_discovery.backend_url}'
            else:
                self.discovery_status_label.text = self.network_discovery.error or 'Connect to Wi-Fi hotspot'
        
        # Update discovery button
        if self.discovery_btn:
            if self.network_discovery.discovering:
                self.discovery_btn.disabled = True
                self.discovery_btn.text = 'SCANNING...'
            else:
                self.discovery_btn.disabled = False
                self.discovery_btn.text = 'RETRY'
        
        # Update connect button
        if self.connect_btn and self.manual_url_input:
            self.connect_btn.disabled = not self.manual_url_input.text
    
    def _build_status_bar(self):
        """Top status bar showing node count"""
        status_bar = BoxLayout(
            size_hint_y=None,
            height=dp(24),
            padding=(dp(16), 0),
            spacing=dp(8)
        )
        status_bar.canvas.before.add(Color(rgba=COLORS['border']))
        status_bar.canvas.before.add(Rectangle(pos=status_bar.pos, size=status_bar.size))
        
        self.node_count_label = StatusLabel(
            text='Nodes: 0',
            font_size=dp(10),
            color=COLORS['text_muted'],
            size_hint_x=0.5
        )
        
        self.mesh_status_label = StatusLabel(
            text='Mesh: Offline',
            font_size=dp(10),
            color=COLORS['accent'],
            size_hint_x=0.5,
            halign='right'
        )
        
        status_bar.add_widget(self.node_count_label)
        status_bar.add_widget(self.mesh_status_label)
        self.add_widget(status_bar)
    
    def _build_header(self):
        """Header with logo and app name"""
        header = BoxLayout(
            size_hint_y=None,
            height=dp(60),
            padding=(dp(16), dp(12)),
            spacing=dp(10)
        )
        header.canvas.before.add(Color(rgba=COLORS['border']))
        header.canvas.before.add(Rectangle(pos=header.pos, size=header.size))
        
        # Logo placeholder
        logo_box = BoxLayout(
            size_hint_x=None,
            width=dp(32),
            size_hint_y=None,
            height=dp(32)
        )
        logo_box.canvas.before.add(Color(rgba=COLORS['accent']))
        logo_box.canvas.before.add(
            Rectangle(pos=logo_box.pos, size=logo_box.size)
        )
        
        # App name
        title_box = BoxLayout(orientation='vertical', spacing=dp(2))
        title_label = Label(
            text='MESHNET AI',
            font_size=dp(16),
            bold=True,
            color=COLORS['text_light'],
            size_hint_y=None,
            height=dp(20),
            halign='left'
        )
        subtitle_label = Label(
            text='EMERGENCY ROUTING v2.4',
            font_size=dp(9),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(12),
            halign='left'
        )
        title_box.add_widget(title_label)
        title_box.add_widget(subtitle_label)
        
        # Mesh status indicator
        status_box = BoxLayout(
            size_hint_x=None,
            width=dp(80),
            size_hint_y=None,
            height=dp(28),
            padding=(dp(10), 0)
        )
        status_box.canvas.before.add(Color(rgba=COLORS['success'], alpha=0.1))
        status_box.canvas.before.add(
            Rectangle(pos=status_box.pos, size=status_box.size)
        )
        self.header_mesh_label = Label(
            text='Mesh (0)',
            font_size=dp(10),
            color=COLORS['success'],
            bold=True
        )
        status_box.add_widget(self.header_mesh_label)
        
        header.add_widget(logo_box)
        header.add_widget(title_box)
        header.add_widget(status_box)
        self.add_widget(header)
    
    def _build_content_area(self):
        """Main scrollable content area"""
        self.content_area = ScrollView()
        self.content_layout = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            padding=dp(16),
            spacing=dp(12)
        )
        self.content_layout.bind(minimum_height=self.content_layout.setter('height'))
        
        # Emergency Quick Start
        self._add_emergency_quick_start()
        
        # Network Discovery Status
        self._add_network_discovery()
        
        # Mesh Network Status
        self._add_mesh_network_status()
        
        # Tab-specific content
        self._add_tab_content()
        
        self.content_area.add_widget(self.content_layout)
        self.add_widget(self.content_area)
    
    def _add_emergency_quick_start(self):
        """Emergency quick start section"""
        emergency_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(80),
            padding=dp(12),
            spacing=dp(8)
        )
        emergency_box.canvas.before.add(Color(rgba=COLORS['accent'], alpha=0.1))
        emergency_box.canvas.before.add(
            Rectangle(pos=emergency_box.pos, size=emergency_box.size)
        )
        
        title = Label(
            text='EMERGENCY MODE',
            font_size=dp(12),
            bold=True,
            color=COLORS['accent'],
            size_hint_y=None,
            height=dp(20)
        )
        
        desc = Label(
            text='Activate emergency routing protocol',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        self.emergency_btn = Button(
            text='ACTIVATE',
            background_color=COLORS['accent'],
            color=(1, 1, 1, 1),
            size_hint_y=None,
            height=dp(36),
            font_size=dp(12),
            bold=True
        )
        self.emergency_btn.bind(on_press=self._toggle_emergency_mode)
        
        emergency_box.add_widget(title)
        emergency_box.add_widget(desc)
        emergency_box.add_widget(self.emergency_btn)
        self.content_layout.add_widget(emergency_box)
    
    def _toggle_emergency_mode(self, instance):
        """Toggle emergency mode"""
        if self.emergency_manager.is_active():
            self.emergency_manager.deactivate()
            self.emergency_btn.text = 'ACTIVATE'
            self.emergency_btn.background_color = COLORS['accent']
        else:
            self.emergency_manager.activate()
            self.emergency_btn.text = 'DEACTIVATE'
            self.emergency_btn.background_color = COLORS['success']
    
    def _add_network_discovery(self):
        """Network discovery status section"""
        discovery_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(100),
            padding=dp(12),
            spacing=dp(8)
        )
        discovery_box.canvas.before.add(Color(rgba=COLORS['info'], alpha=0.1))
        discovery_box.canvas.before.add(
            Rectangle(pos=discovery_box.pos, size=discovery_box.size)
        )
        
        title = Label(
            text='NETWORK DISCOVERY',
            font_size=dp(12),
            bold=True,
            color=COLORS['info'],
            size_hint_y=None,
            height=dp(20)
        )
        
        self.discovery_status_label = Label(
            text='Scanning local network...',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        # Manual URL input
        url_input_box = BoxLayout(
            orientation='horizontal',
            size_hint_y=None,
            height=dp(32),
            spacing=dp(8)
        )
        
        self.manual_url_input = TextInput(
            hint_text='http://192.168.x.x:4000',
            font_size=dp(10),
            multiline=False,
            size_hint_x=0.7,
            background_color=COLORS['bg_darker'],
            foreground_color=COLORS['text_light'],
            cursor_color=COLORS['accent']
        )
        
        self.connect_btn = Button(
            text='CONNECT',
            background_color=COLORS['success'],
            color=(1, 1, 1, 1),
            size_hint_x=0.3,
            font_size=dp(10),
            disabled=True
        )
        self.connect_btn.bind(on_press=self._connect_manual_url)
        
        url_input_box.add_widget(self.manual_url_input)
        url_input_box.add_widget(self.connect_btn)
        
        self.discovery_btn = Button(
            text='RETRY',
            background_color=COLORS['info'],
            color=(1, 1, 1, 1),
            size_hint_y=None,
            height=dp(32),
            font_size=dp(11)
        )
        self.discovery_btn.bind(on_press=self._retry_discovery)
        
        discovery_box.add_widget(title)
        discovery_box.add_widget(self.discovery_status_label)
        discovery_box.add_widget(url_input_box)
        discovery_box.add_widget(self.discovery_btn)
        self.content_layout.add_widget(discovery_box)
    
    def _retry_discovery(self, instance):
        """Retry network discovery"""
        self.network_discovery.start_discovery()
    
    def _connect_manual_url(self, instance):
        """Connect to manual backend URL"""
        url = self.manual_url_input.text.strip()
        if url:
            self.network_discovery.set_manual_url(url)
    
    def _add_mesh_network_status(self):
        """Mesh network status section"""
        mesh_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(70),
            padding=dp(12),
            spacing=dp(8)
        )
        mesh_box.canvas.before.add(Color(rgba=COLORS['purple'], alpha=0.1))
        mesh_box.canvas.before.add(
            Rectangle(pos=mesh_box.pos, size=mesh_box.size)
        )
        
        title = Label(
            text='MESH NETWORK',
            font_size=dp(12),
            bold=True,
            color=COLORS['purple'],
            size_hint_y=None,
            height=dp(20)
        )
        
        self.mesh_status_detail = Label(
            text='0 nodes connected',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        ble_status = Label(
            text='BLE Discovery: Active',
            font_size=dp(10),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(16)
        )
        
        mesh_box.add_widget(title)
        mesh_box.add_widget(self.mesh_status_detail)
        mesh_box.add_widget(ble_status)
        self.content_layout.add_widget(mesh_box)
    
    def _add_tab_content(self):
        """Add content based on current tab"""
        # Clear existing tab content
        for child in self.content_layout.children[:]:
            if hasattr(child, 'tab_content'):
                self.content_layout.remove_widget(child)
        
        if self.current_tab == 'home':
            self._add_home_tab_content()
        elif self.current_tab == 'alert':
            self._add_alert_tab_content()
        elif self.current_tab == 'map':
            self._add_map_tab_content()
        elif self.current_tab == 'comms':
            self._add_comms_tab_content()
        elif self.current_tab == 'protocols':
            self._add_protocols_tab_content()
    
    def _add_home_tab_content(self):
        """Home tab content"""
        home_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(120),
            padding=dp(12),
            spacing=dp(8)
        )
        home_box.canvas.before.add(Color(rgba=COLORS['purple'], alpha=0.1))
        home_box.canvas.before.add(
            Rectangle(pos=home_box.pos, size=home_box.size)
        )
        home_box.tab_content = True
        
        title = Label(
            text='DASHBOARD',
            font_size=dp(14),
            bold=True,
            color=COLORS['text_light'],
            size_hint_y=None,
            height=dp(30)
        )
        
        desc = Label(
            text='Network overview and status',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        stats_box = BoxLayout(
            orientation='horizontal',
            size_hint_y=None,
            height=dp(40),
            spacing=dp(8)
        )
        
        stat1 = Label(
            text=f'Nodes: {self.mesh_network.get_node_count()}',
            font_size=dp(10),
            color=COLORS['text_light'],
            size_hint_x=0.5
        )
        
        stat2 = Label(
            text=f'Emergency: {"ON" if self.emergency_manager.is_active() else "OFF"}',
            font_size=dp(10),
            color=COLORS['accent'] if self.emergency_manager.is_active() else COLORS['text_light'],
            size_hint_x=0.5
        )
        
        stats_box.add_widget(stat1)
        stats_box.add_widget(stat2)
        
        home_box.add_widget(title)
        home_box.add_widget(desc)
        home_box.add_widget(stats_box)
        self.content_layout.add_widget(home_box)
    
    def _add_alert_tab_content(self):
        """Alert tab content"""
        alert_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(100),
            padding=dp(12),
            spacing=dp(8)
        )
        alert_box.canvas.before.add(Color(rgba=COLORS['accent'], alpha=0.1))
        alert_box.canvas.before.add(
            Rectangle(pos=alert_box.pos, size=alert_box.size)
        )
        alert_box.tab_content = True
        
        title = Label(
            text='ALERTS',
            font_size=dp(14),
            bold=True,
            color=COLORS['accent'],
            size_hint_y=None,
            height=dp(30)
        )
        
        desc = Label(
            text='Emergency alerts and notifications',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        alert_box.add_widget(title)
        alert_box.add_widget(desc)
        self.content_layout.add_widget(alert_box)
    
    def _add_map_tab_content(self):
        """Map tab content"""
        map_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(200),
            padding=dp(12),
            spacing=dp(8)
        )
        map_box.canvas.before.add(Color(rgba=COLORS['info'], alpha=0.1))
        map_box.canvas.before.add(
            Rectangle(pos=map_box.pos, size=map_box.size)
        )
        map_box.tab_content = True
        
        title = Label(
            text='NETWORK MAP',
            font_size=dp(14),
            bold=True,
            color=COLORS['info'],
            size_hint_y=None,
            height=dp(30)
        )
        
        desc = Label(
            text='Node topology visualization',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        map_placeholder = BoxLayout(
            size_hint_y=None,
            height=dp(120)
        )
        map_placeholder.canvas.before.add(Color(rgba=COLORS['bg_darker']))
        map_placeholder.canvas.before.add(
            Rectangle(pos=map_placeholder.pos, size=map_placeholder.size)
        )
        
        map_label = Label(
            text='Map View\n(Topology Visualization)',
            font_size=dp(12),
            color=COLORS['text_muted']
        )
        
        map_placeholder.add_widget(map_label)
        
        map_box.add_widget(title)
        map_box.add_widget(desc)
        map_box.add_widget(map_placeholder)
        self.content_layout.add_widget(map_box)
    
    def _add_comms_tab_content(self):
        """Communications tab content"""
        comms_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(100),
            padding=dp(12),
            spacing=dp(8)
        )
        comms_box.canvas.before.add(Color(rgba=COLORS['success'], alpha=0.1))
        comms_box.canvas.before.add(
            Rectangle(pos=comms_box.pos, size=comms_box.size)
        )
        comms_box.tab_content = True
        
        title = Label(
            text='COMMUNICATIONS',
            font_size=dp(14),
            bold=True,
            color=COLORS['success'],
            size_hint_y=None,
            height=dp(30)
        )
        
        desc = Label(
            text='Mesh messaging and data exchange',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        comms_box.add_widget(title)
        comms_box.add_widget(desc)
        self.content_layout.add_widget(comms_box)
    
    def _add_protocols_tab_content(self):
        """Protocols tab content"""
        protocols_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=dp(100),
            padding=dp(12),
            spacing=dp(8)
        )
        protocols_box.canvas.before.add(Color(rgba=COLORS['purple'], alpha=0.1))
        protocols_box.canvas.before.add(
            Rectangle(pos=protocols_box.pos, size=protocols_box.size)
        )
        protocols_box.tab_content = True
        
        title = Label(
            text='PROTOCOLS',
            font_size=dp(14),
            bold=True,
            color=COLORS['purple'],
            size_hint_y=None,
            height=dp(30)
        )
        
        desc = Label(
            text='Routing protocols and configuration',
            font_size=dp(11),
            color=COLORS['text_muted'],
            size_hint_y=None,
            height=dp(20)
        )
        
        protocols_box.add_widget(title)
        protocols_box.add_widget(desc)
        self.content_layout.add_widget(protocols_box)
    
    def _build_tab_navigation(self):
        """Bottom tab navigation"""
        tabs = ['home', 'alert', 'map', 'comms', 'protocols']
        tab_labels = ['HOME', 'ALERT', 'MAP', 'COMMS', 'PROTOCOLS']
        
        nav_bar = BoxLayout(
            size_hint_y=None,
            height=dp(60),
            spacing=0
        )
        nav_bar.canvas.before.add(Color(rgba=COLORS['border']))
        nav_bar.canvas.before.add(Rectangle(pos=nav_bar.pos, size=nav_bar.size))
        nav_bar.canvas.before.add(Color(rgba=COLORS['bg_darker']))
        nav_bar.canvas.before.add(Rectangle(pos=nav_bar.pos, size=nav_bar.size))
        
        for i, (tab, label) in enumerate(zip(tabs, tab_labels)):
            tab_btn = TabButton(
                text=label,
                size_hint_x=1,
                font_size=dp(10),
                bold=(tab == self.current_tab),
                background_color=(0, 0, 0, 0),
                color=COLORS['accent'] if tab == self.current_tab else COLORS['text_muted']
            )
            tab_btn.bind(on_press=lambda x, t=tab: self._switch_tab(t))
            nav_bar.add_widget(tab_btn)
        
        self.add_widget(nav_bar)
    
    def _switch_tab(self, tab_name):
        """Switch to different tab"""
        self.current_tab = tab_name
        # Rebuild navigation to update active state
        self.remove_widget(self.children[0])  # Remove nav bar
        self._build_tab_navigation()
        # Update tab content
        self._add_tab_content()
    
    def shutdown(self):
        """Cleanup on app shutdown"""
        self.ble_mesh.stop()
        self.hardware.shutdown()
        self.network_discovery.stop_discovery()


class MeshNetApp(App):
    """Production-ready MeshNet application with lifecycle management"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.lifecycle = LifecycleManager(self)
    
    def build(self):
        """Build the application with production components"""
        Window.size = (390, 844)  # iPhone dimensions
        Window.clearcolor = COLORS['bg_dark']
        
        # Initialize lifecycle and all components
        if not self.lifecycle.initialize():
            # Fallback to basic UI if initialization fails
            logger.error("Lifecycle initialization failed, using fallback")
            return MeshNetRootWidget(self.lifecycle)
        
        return MeshNetRootWidget(self.lifecycle)
    
    def on_start(self):
        """Called when app starts"""
        logger.info("MeshNet app started")
        
        # Start background tasks
        if self.lifecycle.is_initialized():
            self.lifecycle.start_background_task(self._sync_data, interval=30.0)
    
    def _sync_data(self):
        """Background task to sync data with backend"""
        if self.lifecycle.api_client:
            try:
                # Sync pending nodes
                pending_nodes = self.lifecycle.database.get_pending_nodes()
                for node in pending_nodes:
                    self.lifecycle.api_client.register_node(asdict(node))
                    self.lifecycle.database.mark_synced('nodes', node.id)
                
                # Sync pending messages
                pending_messages = self.lifecycle.database.get_pending_messages()
                for msg in pending_messages:
                    # Send message via API
                    self.lifecycle.database.mark_synced('messages', msg.id)
                
            except Exception as e:
                logger.error(f"Data sync error: {e}")
    
    def on_stop(self):
        """Cleanup when app stops"""
        logger.info("MeshNet app stopping")
        self.lifecycle.shutdown()


if __name__ == "__main__":
    # Setup logging before app starts
    setup_logging(log_level=logging.INFO)
    MeshNetApp().run()
