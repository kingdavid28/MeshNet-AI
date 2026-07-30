"""
lifecycle.py
============
App lifecycle management for proper initialization and cleanup.
Handles app startup, background tasks, and graceful shutdown.
"""

import logging
import threading
from typing import Optional, Callable
from kivy.clock import Clock
from kivy.app import App

logger = logging.getLogger(__name__)


class LifecycleManager:
    """
    Manages application lifecycle with:
    - Proper initialization sequence
    - Background task management
    - Graceful shutdown
    - State persistence
    """
    
    def __init__(self, app: App):
        """
        Initialize lifecycle manager.
        
        Args:
            app: Kivy App instance
        """
        self.app = app
        self._initialized = False
        self._shutting_down = False
        self._background_tasks: list = []
        self._cleanup_callbacks: list = []
        self._lock = threading.Lock()
    
    def initialize(self) -> bool:
        """
        Initialize application components in proper order.
        
        Returns:
            True if initialization successful
        """
        if self._initialized:
            logger.warning("Already initialized")
            return True
        
        try:
            logger.info("Starting app initialization")
            
            # Step 1: Setup logging
            from logger_config import setup_logging, get_logger
            setup_logging(log_level=logging.INFO)
            self.app_logger = get_logger('MeshNetApp')
            self.app_logger.info("Logging initialized")
            
            # Step 2: Initialize database
            from database import Database
            self.database = Database()
            self.app_logger.info("Database initialized")
            
            # Step 3: Initialize permissions
            from permissions import PermissionManager
            self.permissions = PermissionManager()
            self.app_logger.info("Permissions initialized")
            
            # Step 4: Initialize location service
            from location import get_location_service
            self.location_service = get_location_service()
            self.app_logger.info("Location service initialized")
            
            # Step 5: Initialize hardware
            from hardware import HardwareManager
            self.hardware = HardwareManager()
            self.hardware.initialise()
            self.app_logger.info("Hardware initialized")
            
            # Step 6: Initialize BLE mesh
            from ble_mesh import BLEMeshController
            self.ble_mesh = BLEMeshController()
            self.app_logger.info("BLE mesh initialized")
            
            # Step 7: Initialize API client (if backend URL available)
            backend_url = self.database.get_setting('backend_url')
            if backend_url:
                from api_client import MeshNetAPI
                self.api_client = MeshNetAPI(backend_url)
                auth_token = self.database.get_setting('auth_token')
                if auth_token:
                    self.api_client.set_auth(auth_token)
                self.app_logger.info("API client initialized")
            else:
                self.api_client = None
                self.app_logger.info("No backend URL configured")
            
            # Step 8: Initialize WebSocket (if available)
            ws_url = self.database.get_setting('websocket_url')
            if ws_url:
                try:
                    from websocket_client import MeshNetWebSocket
                    self.websocket = MeshNetWebSocket(ws_url)
                    self.app_logger.info("WebSocket initialized")
                except ImportError:
                    self.websocket = None
                    self.app_logger.warning("WebSocket library not available")
            else:
                self.websocket = None
            
            # Step 9: Initialize security
            from security import SecureStorage, TokenManager, InputValidator
            self.secure_storage = SecureStorage()
            self.token_manager = TokenManager(self.secure_storage)
            self.input_validator = InputValidator()
            self.app_logger.info("Security initialized")
            
            # Step 10: Initialize BLE mesh controller
            try:
                from ble_mesh import BLEMeshController
                self.ble_mesh = BLEMeshController(
                    on_node_connected=self._on_ble_node_connected,
                    on_node_disconnected=self._on_ble_node_disconnected,
                    on_data_received=self._on_ble_data_received,
                    local_gps_provider=self._get_gps_for_ble
                )
                self.app_logger.info("BLE mesh controller initialized")
            except ImportError:
                self.ble_mesh = None
                self.app_logger.warning("BLE mesh module not available")
            
            # Step 11: Initialize Cloudant sync (if configured)
            cloudant_url = self.database.get_setting('cloudant_url')
            if cloudant_url:
                try:
                    from cloudant_sync import CloudantSync
                    cloudant_user = self.database.get_setting('cloudant_user')
                    cloudant_pass = self.database.get_setting('cloudant_pass')
                    if cloudant_user and cloudant_pass:
                        self.cloudant_sync = CloudantSync(
                            cloudant_url,
                            cloudant_user,
                            cloudant_pass
                        )
                        self.app_logger.info("Cloudant sync initialized")
                    else:
                        self.cloudant_sync = None
                except ImportError:
                    self.cloudant_sync = None
                    self.app_logger.warning("Cloudant sync not available")
            else:
                self.cloudant_sync = None
            
            self._initialized = True
            self.app_logger.info("App initialization complete")
            return True
        
        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            return False
    
    def register_cleanup_callback(self, callback: Callable) -> None:
        """
        Register a cleanup callback to be called on shutdown.
        
        Args:
            callback: Function to call during cleanup
        """
        self._cleanup_callbacks.append(callback)
    
    def _on_ble_node_connected(self, node_id: str, gps: Tuple[float, float], rssi: int) -> None:
        """
        Callback when a BLE peer connects.
        
        Args:
            node_id: Peer node ID
            gps: GPS coordinates (lat, lon)
            rssi: Signal strength
        """
        self.app_logger.info(f"BLE node connected: {node_id} at {gps} (RSSI: {rssi})")
        # Store in database
        try:
            self.database.add_node(
                node_id=node_id,
                lat=gps[0],
                lon=gps[1],
                signal_strength=rssi,
                battery_level=100  # Unknown
            )
        except Exception as e:
            self.app_logger.error(f"Error storing BLE node: {e}")
    
    def _on_ble_node_disconnected(self, node_id: str) -> None:
        """
        Callback when a BLE peer disconnects.
        
        Args:
            node_id: Peer node ID
        """
        self.app_logger.info(f"BLE node disconnected: {node_id}")
        # Update in database
        try:
            self.database.update_node_status(node_id, "offline")
        except Exception as e:
            self.app_logger.error(f"Error updating BLE node status: {e}")
    
    def _on_ble_data_received(self, node_id: str, data: bytes) -> None:
        """
        Callback when BLE data is received.
        
        Args:
            node_id: Peer node ID
            data: Raw data bytes
        """
        self.app_logger.debug(f"BLE data received from {node_id}: {len(data)} bytes")
        # Process message
        try:
            import json
            message = json.loads(data.decode('utf-8'))
            self.database.add_message(
                sender_id=node_id,
                content=message.get('msg', ''),
                message_type=message.get('type', 'text')
            )
        except Exception as e:
            self.app_logger.error(f"Error processing BLE data: {e}")
    
    def _get_gps_for_ble(self) -> Tuple[float, float]:
        """
        Get current GPS coordinates for BLE identity payload.
        
        Returns:
            Tuple of (lat, lon)
        """
        if self.location_service:
            loc = self.location_service.get_location()
            if loc:
                return (loc.lat, loc.lon)
        return (0.0, 0.0)
    
    def start_background_task(self, task: Callable, interval: float = 1.0) -> None:
        """
        Start a background task with Clock scheduling.
        
        Args:
            task: Function to execute
            interval: Execution interval in seconds
        """
        def scheduled_task(dt):
            if not self._shutting_down:
                try:
                    task()
                except Exception as e:
                    logger.error(f"Background task error: {e}")
        
        clock_event = Clock.schedule_interval(scheduled_task, interval)
        with self._lock:
            self._background_tasks.append(clock_event)
        
        logger.info(f"Background task started: {task.__name__}")
    
    def shutdown(self) -> None:
        """Perform graceful shutdown of all components"""
        if self._shutting_down:
            logger.warning("Already shutting down")
            return
        
        self._shutting_down = True
        logger.info("Starting app shutdown")
        
        try:
            # Stop background tasks
            with self._lock:
                for task in self._background_tasks:
                    task.cancel()
                self._background_tasks.clear()
            
            logger.info("Background tasks stopped")
            
            # Stop WebSocket
            if hasattr(self, 'websocket') and self.websocket:
                self.websocket.disconnect()
                logger.info("WebSocket disconnected")
            
            # Close API client
            if hasattr(self, 'api_client') and self.api_client:
                self.api_client.close()
                logger.info("API client closed")
            
            # Stop BLE mesh
            if hasattr(self, 'ble_mesh') and self.ble_mesh:
                self.ble_mesh.stop()
                logger.info("BLE mesh stopped")
            
            # Stop hardware
            if hasattr(self, 'hardware') and self.hardware:
                self.hardware.shutdown()
                logger.info("Hardware shutdown")
            
            # Stop location tracking
            if self.location_service:
                self.location_service.stop_tracking()
                logger.info("Location tracking stopped")
            
            # Close database
            if hasattr(self, 'database') and self.database:
                self.database.close()
                logger.info("Database closed")
            
            # Call cleanup callbacks
            for callback in self._cleanup_callbacks:
                try:
                    callback()
                except Exception as e:
                    logger.error(f"Cleanup callback error: {e}")
            
            logger.info("App shutdown complete")
        
        except Exception as e:
            logger.error(f"Shutdown error: {e}")
    
    def is_initialized(self) -> bool:
        """Check if app is initialized"""
        return self._initialized
    
    def is_shutting_down(self) -> bool:
        """Check if app is shutting down"""
        return self._shutting_down
    
    def get_component(self, component_name: str):
        """
        Get a component by name.
        
        Args:
            component_name: Name of component (database, permissions, etc.)
            
        Returns:
            Component instance or None
        """
        return getattr(self, component_name, None)
