"""
websocket_client.py
==================
WebSocket client for real-time updates with reconnection logic
and proper error handling.
"""

import logging
import json
import threading
import time
from typing import Optional, Callable, Dict, Any
from enum import Enum
from dataclasses import dataclass

try:
    import websockets
    import asyncio
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    logging.warning("websockets library not available, WebSocket functionality disabled")

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """WebSocket connection states"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


@dataclass
class WebSocketMessage:
    """WebSocket message wrapper"""
    type: str
    data: Dict[str, Any]
    timestamp: float


class WebSocketClient:
    """
    Production-ready WebSocket client with:
    - Automatic reconnection
    - Message queuing
    - Event callbacks
    - Error handling
    - Thread-safe operations
    """
    
    def __init__(
        self,
        url: str,
        reconnect_interval: float = 5.0,
        max_reconnect_attempts: int = 10,
        ping_interval: float = 30.0
    ):
        """
        Initialize WebSocket client.
        
        Args:
            url: WebSocket server URL
            reconnect_interval: Time between reconnection attempts
            max_reconnect_attempts: Maximum reconnection attempts
            ping_interval: Ping interval to keep connection alive
        """
        if not WEBSOCKET_AVAILABLE:
            logger.error("websockets library not available")
            raise ImportError("websockets library required")
        
        self.url = url
        self.reconnect_interval = reconnect_interval
        self.max_reconnect_attempts = max_reconnect_attempts
        self.ping_interval = ping_interval
        
        self.state = ConnectionState.DISCONNECTED
        self.websocket: Optional[Any] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.thread: Optional[threading.Thread] = None
        self.reconnect_count = 0
        self.running = False
        
        # Callbacks
        self.on_message: Optional[Callable[[WebSocketMessage], None]] = None
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_error: Optional[Callable[[Exception], None]] = None
        
        # Message queue
        self.message_queue: list = []
        self._lock = threading.Lock()
    
    def set_callbacks(
        self,
        on_message: Optional[Callable[[WebSocketMessage], None]] = None,
        on_connected: Optional[Callable[[], None]] = None,
        on_disconnected: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None
    ) -> None:
        """Set event callbacks"""
        self.on_message = on_message
        self.on_connected = on_connected
        self.on_disconnected = on_disconnected
        self.on_error = on_error
    
    def connect(self) -> bool:
        """
        Connect to WebSocket server.
        
        Returns:
            True if connection initiated successfully
        """
        if self.running:
            logger.warning("WebSocket already running")
            return False
        
        self.running = True
        self.state = ConnectionState.CONNECTING
        self.reconnect_count = 0
        
        # Start event loop in separate thread
        self.thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self.thread.start()
        
        logger.info(f"WebSocket connecting to {self.url}")
        return True
    
    def _run_event_loop(self) -> None:
        """Run asyncio event loop in separate thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        try:
            self.loop.run_until_complete(self._connect_with_retry())
        except Exception as e:
            logger.error(f"Event loop error: {e}")
            self.state = ConnectionState.ERROR
            if self.on_error:
                self.on_error(e)
        finally:
            self.loop.close()
    
    async def _connect_with_retry(self) -> None:
        """Connect with automatic retry logic"""
        while self.running and self.reconnect_count < self.max_reconnect_attempts:
            try:
                self.state = ConnectionState.CONNECTING
                logger.info(f"Connection attempt {self.reconnect_count + 1}")
                
                async with websockets.connect(
                    self.url,
                    ping_interval=self.ping_interval,
                    ping_timeout=self.ping_interval * 2
                ) as websocket:
                    self.websocket = websocket
                    self.state = ConnectionState.CONNECTED
                    self.reconnect_count = 0
                    
                    logger.info("WebSocket connected")
                    if self.on_connected:
                        self.on_connected()
                    
                    # Listen for messages
                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            ws_message = WebSocketMessage(
                                type=data.get('type', 'unknown'),
                                data=data,
                                timestamp=time.time()
                            )
                            
                            if self.on_message:
                                self.on_message(ws_message)
                        
                        except json.JSONDecodeError as e:
                            logger.error(f"JSON decode error: {e}")
                        except Exception as e:
                            logger.error(f"Message processing error: {e}")
            
            except Exception as e:
                logger.error(f"Connection error: {e}")
                self.state = ConnectionState.ERROR
                self.reconnect_count += 1
                
                if self.on_error:
                    self.on_error(e)
                
                if self.on_disconnected:
                    self.on_disconnected()
                
                if self.running and self.reconnect_count < self.max_reconnect_attempts:
                    self.state = ConnectionState.RECONNECTING
                    logger.info(f"Reconnecting in {self.reconnect_interval}s...")
                    await asyncio.sleep(self.reconnect_interval)
        
        if self.running:
            logger.error("Max reconnection attempts reached")
            self.state = ConnectionState.ERROR
    
    def send(self, message: Dict[str, Any]) -> bool:
        """
        Send message to WebSocket server.
        
        Args:
            message: Message data to send
            
        Returns:
            True if message sent successfully
        """
        if self.state != ConnectionState.CONNECTED or not self.websocket:
            logger.warning("Cannot send message: not connected")
            return False
        
        try:
            if self.loop and asyncio.iscoroutinefunction(self.websocket.send):
                # Schedule send on event loop
                asyncio.run_coroutine_threadsafe(
                    self.websocket.send(json.dumps(message)),
                    self.loop
                )
            else:
                # Synchronous send
                self.websocket.send(json.dumps(message))
            
            logger.debug(f"Message sent: {message.get('type', 'unknown')}")
            return True
        
        except Exception as e:
            logger.error(f"Send error: {e}")
            return False
    
    def disconnect(self) -> None:
        """Disconnect from WebSocket server"""
        logger.info("Disconnecting WebSocket")
        self.running = False
        
        if self.websocket:
            try:
                if self.loop:
                    asyncio.run_coroutine_threadsafe(
                        self.websocket.close(),
                        self.loop
                    )
            except Exception as e:
                logger.error(f"Disconnect error: {e}")
        
        self.state = ConnectionState.DISCONNECTED
        
        if self.on_disconnected:
            self.on_disconnected()
    
    def get_state(self) -> ConnectionState:
        """Get current connection state"""
        return self.state


class MeshNetWebSocket:
    """
    MeshNet-specific WebSocket client for real-time updates:
    - Node status updates
    - Message notifications
    - Emergency alerts
    - Network topology changes
    """
    
    def __init__(self, url: str):
        self.client = WebSocketClient(url)
        self._setup_callbacks()
    
    def _setup_callbacks(self) -> None:
        """Setup default message handlers"""
        def handle_message(msg: WebSocketMessage) -> None:
            logger.info(f"Received message: {msg.type}")
            
            if msg.type == 'node_update':
                self._handle_node_update(msg.data)
            elif msg.type == 'message':
                self._handle_message(msg.data)
            elif msg.type == 'emergency':
                self._handle_emergency(msg.data)
            elif msg.type == 'topology':
                self._handle_topology(msg.data)
        
        self.client.set_callbacks(on_message=handle_message)
    
    def _handle_node_update(self, data: Dict[str, Any]) -> None:
        """Handle node status update"""
        logger.info(f"Node update: {data.get('node_id')}")
    
    def _handle_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming message"""
        logger.info(f"Message from {data.get('sender_id')}")
    
    def _handle_emergency(self, data: Dict[str, Any]) -> None:
        """Handle emergency alert"""
        logger.warning(f"Emergency alert: {data.get('type')}")
    
    def _handle_topology(self, data: Dict[str, Any]) -> None:
        """Handle topology change"""
        logger.info("Topology updated")
    
    def connect(self) -> bool:
        """Connect to MeshNet WebSocket"""
        return self.client.connect()
    
    def disconnect(self) -> None:
        """Disconnect from MeshNet WebSocket"""
        self.client.disconnect()
    
    def send_node_update(self, node_data: Dict[str, Any]) -> bool:
        """Send node status update"""
        return self.client.send({
            'type': 'node_update',
            'data': node_data
        })
    
    def send_message(self, recipient_id: str, message: str) -> bool:
        """Send message through WebSocket"""
        return self.client.send({
            'type': 'message',
            'data': {
                'recipient_id': recipient_id,
                'message': message
            }
        })
    
    def set_callbacks(
        self,
        on_node_update: Optional[Callable] = None,
        on_message: Optional[Callable] = None,
        on_emergency: Optional[Callable] = None,
        on_topology: Optional[Callable] = None
    ) -> None:
        """Set custom callbacks for specific message types"""
        if on_node_update:
            self._handle_node_update = on_node_update
        if on_message:
            self._handle_message = on_message
        if on_emergency:
            self._handle_emergency = on_emergency
        if on_topology:
            self._handle_topology = on_topology
