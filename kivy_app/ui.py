"""
ui.py
────────────────────────────────────────────────────────────────────────────
Kivy UI components for MeshNet-AI application.

This module provides custom UI components including the BackendConnectionCard
for manual backend configuration and connection management, and the root widget
for the application.
"""

from kivy.lang import Builder
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.label import Label
from kivy.uix.togglebutton import ToggleButton
from kivy.properties import StringProperty, BooleanProperty, NumericProperty
from kivy.clock import Clock
from kivy.metrics import dp
from typing import Optional, Callable, Tuple
import threading


Builder.load_string('''
<BackendConnectionCard>:
    orientation: 'vertical'
    size_hint_y: None
    height: self.minimum_height
    padding: dp(16)
    spacing: dp(12)
    
    canvas.before:
        Color:
            rgba: 0.12, 0.12, 0.2, 1
        RoundedRectangle:
            pos: self.pos
            size: self.size
            radius: [dp(16), dp(16), dp(16), dp(16)]
        Color:
            rgba: 0.2, 0.4, 0.6, 0.15
        RoundedRectangle:
            pos: self.pos
            size: self.size
            radius: [dp(16), dp(16), dp(16), dp(16)]
    
    Label:
        text: 'Backend Connection'
        font_size: dp(18)
        bold: True
        size_hint_y: None
        height: dp(35)
        color: 0.8, 0.9, 1, 1
    
    BoxLayout:
        orientation: 'horizontal'
        size_hint_y: None
        height: dp(45)
        spacing: dp(10)
        
        Label:
            text: 'URL'
            size_hint_x: 0.2
            font_size: dp(14)
            color: 0.6, 0.7, 0.8, 1
            bold: True
        
        BackendUrlInput:
            id: url_input
            text: root.backend_url
            hint_text: 'http://localhost:4000'
            size_hint_x: 0.8
            font_size: dp(14)
            multiline: False
            on_text_validate: root.on_connect_pressed()
    
    BoxLayout:
        orientation: 'horizontal'
        size_hint_y: None
        height: dp(50)
        spacing: dp(10)
        
        Button:
            text: 'Connect'
            size_hint_x: 0.5
            font_size: dp(15)
            bold: True
            background_normal: ''
            background_down: ''
            on_press: root.on_connect_pressed()
            disabled: root.is_connecting
            canvas.before:
                Color:
                    rgba: 0.2, 0.6, 0.9, 1 if not root.is_connecting else 0.3, 0.3, 0.4, 1
                RoundedRectangle:
                    pos: self.pos
                    size: self.size
                    radius: [dp(12), dp(12), dp(12), dp(12)]
                Color:
                    rgba: 0.4, 0.8, 1, 0.3 if not root.is_connecting else 0, 0, 0, 0
                RoundedRectangle:
                    pos: self.pos
                    size: self.size
                    radius: [dp(12), dp(12), dp(12), dp(12)]
        
        Button:
            text: 'Retry'
            size_hint_x: 0.5
            font_size: dp(15)
            bold: True
            background_normal: ''
            background_down: ''
            on_press: root.on_retry_pressed()
            disabled: root.is_connecting
            canvas.before:
                Color:
                    rgba: 0.8, 0.6, 0.2, 1 if not root.is_connecting else 0.3, 0.3, 0.4, 1
                RoundedRectangle:
                    pos: self.pos
                    size: self.size
                    radius: [dp(12), dp(12), dp(12), dp(12)]
                Color:
                    rgba: 1, 0.8, 0.4, 0.3 if not root.is_connecting else 0, 0, 0, 0
                RoundedRectangle:
                    pos: self.pos
                    size: self.size
                    radius: [dp(12), dp(12), dp(12), dp(12)]
    
    StatusLabel:
        id: status_label
        text: root.status_text
        size_hint_y: None
        height: dp(30)
        font_size: dp(13)
        color: 0.7, 0.8, 0.9, 1

<BackendUrlInput>:
    multiline: False
    background_normal: ''
    background_active: ''
    foreground_color: 0.9, 0.9, 1, 1
    hint_text_color: 0.5, 0.5, 0.6, 1
    canvas.before:
        Color:
            rgba: 0.08, 0.08, 0.15, 1
        RoundedRectangle:
            pos: self.pos
            size: self.size
            radius: [dp(8), dp(8), dp(8), dp(8)]
        Color:
            rgba: 0.3, 0.5, 0.7, 0.5
        Line:
            rectangle: self.x, self.y, self.width, self.height
            width: 1.5
            rounded_rectangle: [self.x, self.y, self.width, self.height, dp(8), dp(8), dp(8), dp(8)]

<StatusLabel>:
    halign: 'left'
    valign: 'middle'
    canvas.before:
        Color:
            rgba: 0.05, 0.05, 0.1, 1
        RoundedRectangle:
            pos: self.pos
            size: self.size
            radius: [dp(8), dp(8), dp(8), dp(8)]
''')


class BackendUrlInput(TextInput):
    """Custom text input for backend URL with validation."""
    
    def insert_text(self, substring, from_undo=False):
        """Auto-prepend http:// if missing."""
        if not self.text and not substring.startswith('http'):
            super().insert_text('http://', from_undo)
        super().insert_text(substring, from_undo)


class StatusLabel(Label):
    """Label for connection status with color coding."""
    pass


class BackendConnectionCard(BoxLayout):
    """
    UI card for manual backend configuration and connection management.
    
    Features:
    - Custom text input for backend URL
    - Connect and Retry buttons
    - Status indicator with color coding
    - Thread-safe connection state management
    """
    
    backend_url = StringProperty('http://localhost:4000')
    status_text = StringProperty('Disconnected')
    is_connecting = BooleanProperty(False)
    is_connected = BooleanProperty(False)
    
    # Callbacks
    on_connect_callback: Optional[Callable] = None
    on_disconnect_callback: Optional[Callable] = None
    on_status_change_callback: Optional[Callable] = None
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._connection_lock = threading.Lock()
        self._polling_thread: Optional[threading.Thread] = None
        self._should_poll = False
        
    def on_connect_pressed(self):
        """Handle connect button press."""
        url_input = self.ids.url_input
        url = url_input.text.strip()
        
        if not url:
            self._set_status('Please enter a URL', (0.8, 0.4, 0.4, 1))
            return
        
        self.backend_url = url
        self._connect_to_backend()
    
    def on_retry_pressed(self):
        """Handle retry button press."""
        if self.backend_url:
            self._connect_to_backend()
    
    def _connect_to_backend(self):
        """Initiate backend connection in a separate thread."""
        with self._connection_lock:
            if self.is_connecting:
                return
            self.is_connecting = True
            self._set_status('Connecting...', (0.8, 0.6, 0.2, 1))
        
        # Start connection in background thread
        thread = threading.Thread(target=self._verify_connection, daemon=True)
        thread.start()
    
    def _verify_connection(self):
        """Verify backend connection by polling topology endpoint."""
        import requests
        from routing import parse_backend_nodes
        
        try:
            # Test connection with topology endpoint
            response = requests.get(
                f"{self.backend_url}/api/mesh/topology",
                timeout=5
            )
            
            if response.status_code == 200:
                # Parse response to verify schema compatibility
                data = response.json()
                nodes = parse_backend_nodes(data)
                
                Clock.schedule_once(lambda dt: self._on_connection_success(len(nodes)))
            else:
                Clock.schedule_once(lambda dt: self._on_connection_error(f"HTTP {response.status_code}"))
                
        except requests.exceptions.Timeout:
            Clock.schedule_once(lambda dt: self._on_connection_error("Connection timeout"))
        except requests.exceptions.ConnectionError:
            Clock.schedule_once(lambda dt: self._on_connection_error("Connection refused"))
        except Exception as e:
            Clock.schedule_once(lambda dt: self._on_connection_error(str(e)))
        finally:
            with self._connection_lock:
                self.is_connecting = False
    
    def _on_connection_success(self, node_count: int):
        """Handle successful connection."""
        self.is_connected = True
        self._set_status(f'Connected ({node_count} nodes)', (0.2, 0.8, 0.4, 1))
        
        if self.on_connect_callback:
            self.on_connect_callback(self.backend_url)
        
        if self.on_status_change_callback:
            self.on_status_change_callback('connected', node_count)
        
        # Start polling for updates
        self._start_polling()
    
    def _on_connection_error(self, error_msg: str):
        """Handle connection error."""
        self.is_connected = False
        self._set_status(f'Error: {error_msg}', (0.8, 0.4, 0.4, 1))
        
        if self.on_disconnect_callback:
            self.on_disconnect_callback(self.backend_url, error_msg)
        
        if self.on_status_change_callback:
            self.on_status_change_callback('disconnected', 0)
        
        # Stop polling
        self._stop_polling()
    
    def _set_status(self, text: str, color: tuple):
        """Update status label text and color."""
        self.status_text = text
        # Color is not dynamically updated due to Kivy property issues
    
    def _start_polling(self):
        """Start background polling for topology updates."""
        with self._connection_lock:
            if self._should_poll:
                return
            self._should_poll = True
        
        self._polling_thread = threading.Thread(target=self._poll_topology, daemon=True)
        self._polling_thread.start()
    
    def _stop_polling(self):
        """Stop background polling."""
        with self._connection_lock:
            self._should_poll = False
        
        if self._polling_thread and self._polling_thread.is_alive():
            self._polling_thread.join(timeout=1)
    
    def _poll_topology(self):
        """Poll topology endpoint periodically for updates."""
        import requests
        from routing import parse_backend_nodes
        import time
        
        while self._should_poll:
            try:
                response = requests.get(
                    f"{self.backend_url}/api/mesh/topology",
                    timeout=5
                )
                
                if response.status_code == 200:
                    data = response.json()
                    nodes = parse_backend_nodes(data)
                    
                    Clock.schedule_once(
                        lambda dt: self._on_topology_update(len(nodes))
                    )
                else:
                    Clock.schedule_once(lambda dt: self._on_connection_error("Polling failed"))
                    break
                    
            except Exception as e:
                Clock.schedule_once(lambda dt: self._on_connection_error("Polling error"))
                break
            
            # Poll every 5 seconds
            time.sleep(5)
    
    def _on_topology_update(self, node_count: int):
        """Handle topology update from polling."""
        if self.is_connected:
            self._set_status(f'Connected ({node_count} nodes)', (0.2, 0.8, 0.4, 1))
            
            if self.on_status_change_callback:
                self.on_status_change_callback('updated', node_count)
    
    def disconnect(self):
        """Manually disconnect from backend."""
        self._stop_polling()
        self.is_connected = False
        self._set_status('Disconnected', (0.5, 0.5, 0.5, 1))
        
        if self.on_disconnect_callback:
            self.on_disconnect_callback(self.backend_url, "Manual disconnect")
    
    def cleanup(self):
        """Cleanup resources."""
        self._stop_polling()


class MeshNetRootWidget(BoxLayout):
    """
    Root widget for the MeshNet-AI application.
    
    This widget serves as the main container and handles BLE mesh events
    by delegating to appropriate child widgets.
    """
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.orientation = 'vertical'
        
        # Add main content
        self.add_widget(Label(
            text='MeshNet-AI Root Widget',
            font_size=dp(20),
            bold=True,
            size_hint_y=None,
            height=dp(50)
        ))
        
        # Placeholder for main content
        content = BoxLayout()
        content.add_widget(Label(
            text='Application UI will be rendered here',
            font_size=dp(16),
            halign='center'
        ))
        self.add_widget(content)
    
    def on_node_connected(self, node_id: str, gps: Tuple[float, float], rssi: int) -> None:
        """
        Handle BLE node connection event.
        
        Args:
            node_id: Unique identifier for the connected node
            gps: Tuple of (latitude, longitude)
            rssi: Signal strength indicator
        """
        print(f"[RootWidget] Node connected: {node_id} at {gps} (RSSI: {rssi})")
        # TODO: Update map layer with new node
    
    def on_node_disconnected(self, node_id: str) -> None:
        """
        Handle BLE node disconnection event.
        
        Args:
            node_id: Unique identifier for the disconnected node
        """
        print(f"[RootWidget] Node disconnected: {node_id}")
        # TODO: Remove node from map layer
    
    def on_ble_data_received(self, node_id: str, data: bytes) -> None:
        """
        Handle BLE data reception event.
        
        Args:
            node_id: Unique identifier for the sender node
            data: Raw bytes received
        """
        print(f"[RootWidget] Data received from {node_id}: {len(data)} bytes")
        # TODO: Process received data
    
    def shutdown(self) -> None:
        """Shutdown all child managers and cleanup resources."""
        print("[RootWidget] Shutting down")
        # TODO: Propagate shutdown to all child widgets
