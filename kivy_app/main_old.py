"""
main.py
────────────────────────────────────────────────────────────────────────────
Main entry point for the MeshNet-AI Kivy application.

This module sets up the Kivy application with the LeftPanel containing
the BackendConnectionCard and system status row with connectivity indicator.
"""

from kivy.app import App
from kivy.lang import Builder
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.floatlayout import FloatLayout
from kivy.uix.label import Label
from kivy.properties import BooleanProperty, StringProperty, NumericProperty, ListProperty
from kivy.clock import Clock
from kivy.metrics import dp
from typing import Optional

from ui import BackendConnectionCard
from location import get_location_service
from emergency import get_emergency_service
from hotspot import get_hotspot_service
from topology_viz import TopologyWidget
from mesh_discovery import get_mesh_discovery_service


Builder.load_string('''
<LeftPanel>:
    orientation: 'vertical'
    size_hint_x: 0.3
    padding: dp(10)
    spacing: dp(10)
    
    canvas.before:
        Color:
            rgba: 0.9, 0.9, 0.95, 1
        Rectangle:
            pos: self.pos
            size: self.size
        Color:
            rgba: 0.7, 0.7, 0.8, 1
        Line:
            rectangle: self.x, self.y, self.width, self.height
            width: 2
    
    # Header
    Label:
        text: 'MeshNet-AI'
        font_size: dp(24)
        bold: True
        size_hint_y: None
        height: dp(50)
        color: 0.2, 0.2, 0.3, 1
    
    # Backend Connection Card (collapsible)
    BackendConnectionCard:
        id: backend_card
        size_hint_y: None if root.backend_card_collapsed else None
        height: dp(0) if root.backend_card_collapsed else self.minimum_height
        opacity: 0 if root.backend_card_collapsed else 1
    
    # Toggle button for backend card
    ToggleButton:
        text: 'Show/Hide Backend Config'
        size_hint_y: None
        height: dp(40)
        font_size: dp(12)
        background_color: 0.7, 0.7, 0.8, 1
        on_press: root.toggle_backend_card()
    
    # Spacer
    BoxLayout:
        size_hint_y: 1
    
    # System Status Row
    BoxLayout:
        orientation: 'horizontal'
        size_hint_y: None
        height: dp(40)
        spacing: dp(8)
        padding: dp(5)
        
        canvas.before:
            Color:
                rgba: 0.85, 0.85, 0.9, 1
            Rectangle:
                pos: self.pos
                size: self.size
            Color:
                rgba: 0.6, 0.6, 0.7, 1
            Line:
                rectangle: self.x, self.y, self.width, self.height
                width: 1
        
        Label:
            text: 'Backend:'
            font_size: dp(12)
            size_hint_x: 0.3
            color: 0.4, 0.4, 0.5, 1
        
        ConnectivityIndicator:
            id: connectivity_indicator
            size_hint_x: 0.7
        
        Label:
            text: 'Nodes: 0'
            id: node_count_label
            font_size: dp(12)
            size_hint_x: 0.4
            color: 0.4, 0.4, 0.5, 1
        
        Label:
            text: 'Location: Unknown'
            id: location_label
            font_size: dp(10)
            size_hint_x: 0.6
            color: 0.4, 0.4, 0.5, 1

<ConnectivityIndicator>:
    size_hint_y: None
    height: dp(25)
    
    Label:
        text: root.status_text
        font_size: dp(11)
        color: 0.3, 0.3, 0.4, 1

<MainLayout>:
    orientation: 'horizontal'
    
    LeftPanel:
        id: left_panel
    
    BoxLayout:
        orientation: 'vertical'
        size_hint_x: 0.7
        padding: dp(10)
        
        Label:
            text: 'Mesh Network View'
            font_size: dp(20)
            bold: True
            size_hint_y: None
            height: dp(40)
            color: 0.2, 0.2, 0.3, 1
        
        TopologyWidget:
            id: topology_widget
            size_hint_y: 1
''')


class ConnectivityIndicator(BoxLayout):
    """Visual indicator for backend connectivity status."""
    
    status = StringProperty('disconnected')
    status_text = StringProperty('Disconnected')
    
    def on_status(self, instance, value):
        """Update indicator based on status."""
        if value == 'connected':
            self.status_text = 'Connected'
        elif value == 'connecting':
            self.status_text = 'Connecting...'
        elif value == 'error':
            self.status_text = 'Error'
        else:  # disconnected
            self.status_text = 'Disconnected'


class LeftPanel(BoxLayout):
    """Left panel containing backend configuration and system status."""
    
    backend_card_collapsed = BooleanProperty(False)
    backend_status = StringProperty('disconnected')
    node_count = NumericProperty(0)
    location_text = StringProperty('Location: Unknown')
    hotspot_status = StringProperty('Inactive')
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        Clock.schedule_once(self._init_after_delay, 0.1)
    
    def _init_after_delay(self, dt):
        """Initialize after UI is built."""
        self.backend_card = self.ids.backend_card
        self.connectivity_indicator = self.ids.connectivity_indicator
        
        # Get topology widget reference from main layout after UI is built
        Clock.schedule_once(self._get_topology_widget, 0.1)
        
        # Initialize services
        self.location_service = get_location_service()
        self.emergency_service = get_emergency_service()
        self.hotspot_service = get_hotspot_service()
        self.mesh_discovery = get_mesh_discovery_service()
        
        # Local backend - disabled for now to fix property issues
        # self.local_backend = get_local_backend()
        # self.local_backend.start()
        # self.backend_card.backend_url = self.local_backend.get_url()
        
        # Start location tracking
        self.location_service.start_tracking(
            callback=self._on_location_update,
            interval=5.0
        )
        
        # Start mesh discovery
        self.mesh_discovery.start_discovery(
            node_id="kivy-device",
            node_name="Kivy Device",
            on_device_discovered=self._on_device_discovered,
            on_device_lost=self._on_device_lost,
            on_status_change=self._on_discovery_status_change
        )
        
        # Update emergency service with backend URL when connected
        if self.backend_card.is_connected:
            self.emergency_service.set_backend_url(self.backend_card.backend_url)
    
    def _get_topology_widget(self, dt):
        """Get topology widget reference after UI is fully built."""
        if hasattr(self, 'parent') and hasattr(self.parent, 'ids'):
            self.topology_widget = self.parent.ids.topology_widget
        else:
            self.topology_widget = None
    
    def toggle_backend_card(self):
        """Toggle visibility of backend connection card."""
        self.backend_card_collapsed = not self.backend_card_collapsed
    
    def on_backend_connected(self, url: str):
        """Callback when backend is connected."""
        self.backend_status = 'connected'
        self.emergency_service.set_backend_url(url)
        print(f"Connected to backend: {url}")
    
    def on_backend_disconnected(self, url: str, error: str):
        """Callback when backend is disconnected."""
        self.backend_status = 'error'
        print(f"Disconnected from backend: {url} - {error}")
    
    def on_backend_status_change(self, status: str, node_count: int):
        """Callback when backend status changes."""
        self.backend_status = status
        self.node_count = node_count
        print(f"Backend status: {status}, Nodes: {node_count}")
        
        # Update topology visualization when connected
        if status == 'connected' or status == 'updated':
            self._update_topology()
    
    def _on_location_update(self, location):
        """Callback when location is updated."""
        if location:
            self.location_text = f'Location: {location.latitude:.4f}, {location.longitude:.4f}'
            print(f"Location updated: {location.latitude}, {location.longitude}")
    
    def _update_topology(self):
        """Update topology visualization with data from backend."""
        if not hasattr(self, 'topology_widget') or not self.topology_widget:
            return
        
        try:
            import requests
            response = requests.get(
                f"{self.backend_card.backend_url}/api/mesh/topology",
                timeout=5
            )
            
            if response.status_code == 200:
                data = response.json()
                from routing import parse_backend_nodes
                nodes = parse_backend_nodes(data)
                
                # Convert to list of dicts for topology widget
                nodes_data = []
                for node in nodes:
                    nodes_data.append({
                        'id': node.id,
                        'label': node.label,
                        'lat': node.lat,
                        'lng': node.lng,
                        'battery': node.battery,
                        'signal': node.signal,
                        'device': node.device,
                        'role': node.role
                    })
                
                self.topology_widget.update_topology(nodes_data)
                
        except Exception as e:
            print(f"[LeftPanel] Failed to update topology: {e}")
    
    def _on_device_discovered(self, device):
        """Callback when a device is discovered via mesh discovery."""
        print(f"[LeftPanel] Device discovered: {device.name} ({device.protocol})")
    
    def _on_device_lost(self, device):
        """Callback when a device is lost via mesh discovery."""
        print(f"[LeftPanel] Device lost: {device.name}")
    
    def _on_discovery_status_change(self, status):
        """Callback when mesh discovery status changes."""
        print(f"[LeftPanel] Discovery status: {status.is_scanning}, Devices: {status.devices_found}")


class MainLayout(BoxLayout):
    """Main application layout."""
    pass


class MeshNetKivyApp(App):
    """Main Kivy application class."""
    
    def build(self):
        """Build and return the root widget."""
        return MainLayout()
    
    def on_stop(self):
        """Cleanup when app is stopping."""
        root = self.root
        if root:
            left_panel = root.ids.left_panel
            if hasattr(left_panel, 'backend_card'):
                left_panel.backend_card.cleanup()
            if hasattr(left_panel, 'location_service'):
                left_panel.location_service.cleanup()
            if hasattr(left_panel, 'local_backend'):
                left_panel.local_backend.stop()
            if hasattr(left_panel, 'mesh_discovery'):
                left_panel.mesh_discovery.cleanup()


if __name__ == '__main__':
    MeshNetKivyApp().run()
