"""
mesh_discovery.py
────────────────────────────────────────────────────────────────────────────
Mesh discovery module for MeshNet-AI Kivy application.

This module provides BLE and WiFi discovery functionality using plyer
for cross-platform device discovery on Android devices.
"""

from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass
import threading
from kivy.clock import Clock
import time


@dataclass
class DiscoveredDevice:
    """Discovered device data structure."""
    id: str
    name: str
    address: str
    signal_strength: int
    protocol: str  # 'ble' or 'wifi'
    rssi: int
    timestamp: float
    data: Optional[Dict[str, Any]] = None


@dataclass
class DiscoveryStatus:
    """Discovery status data structure."""
    is_scanning: bool
    is_advertising: bool
    devices_found: int
    protocol: str


class MeshDiscoveryService:
    """
    Mesh discovery service for BLE and WiFi device discovery.
    
    Uses plyer for cross-platform BLE and WiFi discovery on Android.
    Provides continuous scanning and advertising for mesh network formation.
    """
    
    MESHNET_SERVICE_UUID = "0000FEED-0000-1000-8000-00805F9B34FB"
    
    def __init__(self):
        self._is_scanning = False
        self._is_advertising = False
        self._discovered_devices: Dict[str, DiscoveredDevice] = {}
        self._discovery_lock = threading.Lock()
        self._scan_thread: Optional[threading.Thread] = None
        self._should_stop = False
        self._on_device_discovered: Optional[Callable] = None
        self._on_device_lost: Optional[Callable] = None
        self._on_status_change: Optional[Callable] = None
        self._node_id = "kivy-device"
        self._node_name = "Kivy Device"
        self._service_uuid = self.MESHNET_SERVICE_UUID
        
    def start_discovery(self, node_id: str, node_name: str, 
                       on_device_discovered: Optional[Callable] = None,
                       on_device_lost: Optional[Callable] = None,
                       on_status_change: Optional[Callable] = None):
        """
        Start mesh discovery (BLE scanning and advertising).
        
        Args:
            node_id: This device's node ID
            node_name: This device's display name
            on_device_discovered: Callback when device is discovered
            on_device_lost: Callback when device is lost
            on_status_change: Callback when discovery status changes
        """
        with self._discovery_lock:
            if self._is_scanning:
                return
            
            self._is_scanning = True
            self._should_stop = False
            self._node_id = node_id
            self._node_name = node_name
            self._on_device_discovered = on_device_discovered
            self._on_device_lost = on_device_lost
            self._on_status_change = on_status_change
        
        # Start BLE advertising
        self._start_advertising()
        
        # Start BLE scanning
        self._scan_thread = threading.Thread(
            target=self._discovery_loop,
            daemon=True
        )
        self._scan_thread.start()
        
        self._notify_status_change()
    
    def stop_discovery(self):
        """Stop mesh discovery."""
        with self._discovery_lock:
            self._should_stop = True
            self._is_scanning = False
        
        if self._scan_thread and self._scan_thread.is_alive():
            self._scan_thread.join(timeout=2)
        
        self._stop_advertising()
        self._notify_status_change()
    
    def _start_advertising(self):
        """Start BLE advertising."""
        try:
            from plyer import bluetooth
            
            # Configure BLE advertising
            bluetooth.start_advertising(
                service_uuid=self._service_uuid,
                data={
                    'node_id': self._node_id,
                    'name': self._node_name
                }
            )
            
            with self._discovery_lock:
                self._is_advertising = True
            
            print("[MeshDiscovery] BLE advertising started")
            
        except ImportError:
            print("[MeshDiscovery] plyer not available, using mock advertising")
            with self._discovery_lock:
                self._is_advertising = True
        except Exception as e:
            print(f"[MeshDiscovery] Failed to start advertising: {e}")
    
    def _stop_advertising(self):
        """Stop BLE advertising."""
        try:
            from plyer import bluetooth
            bluetooth.stop_advertising()
            
            with self._discovery_lock:
                self._is_advertising = False
            
            print("[MeshDiscovery] BLE advertising stopped")
            
        except ImportError:
            with self._discovery_lock:
                self._is_advertising = False
        except Exception as e:
            print(f"[MeshDiscovery] Failed to stop advertising: {e}")
    
    def _discovery_loop(self):
        """Background thread for continuous device discovery."""
        while not self._should_stop:
            try:
                # Scan for BLE devices
                self._scan_ble_devices()
                
                # Scan for WiFi networks
                self._scan_wifi_networks()
                
                # Clean up old devices
                self._cleanup_old_devices()
                
                time.sleep(5)  # Scan interval
                
            except Exception as e:
                print(f"[MeshDiscovery] Error in discovery loop: {e}")
                time.sleep(5)
    
    def _scan_ble_devices(self):
        """Scan for BLE devices advertising MeshNet service."""
        try:
            from plyer import bluetooth
            
            # Start BLE scan
            bluetooth.start_scanning()
            
            # Wait for scan results
            time.sleep(2)
            
            # Get discovered devices
            devices = bluetooth.get_discovered_devices()
            
            if devices:
                for device in devices:
                    if self._is_meshnet_device(device):
                        self._process_discovered_device(device, 'ble')
            
            bluetooth.stop_scanning()
            
        except ImportError:
            # Mock device discovery for testing
            self._add_mock_device('ble')
        except Exception as e:
            print(f"[MeshDiscovery] BLE scan error: {e}")
    
    def _scan_wifi_networks(self):
        """Scan for WiFi networks with MeshNet prefix."""
        try:
            from plyer import wifi
            
            # Scan for WiFi networks
            networks = wifi.scan()
            
            if networks:
                for network in networks:
                    if self._is_meshnet_network(network):
                        self._process_discovered_device(network, 'wifi')
            
        except ImportError:
            # Mock WiFi discovery for testing
            self._add_mock_device('wifi')
        except Exception as e:
            print(f"[MeshDiscovery] WiFi scan error: {e}")
    
    def _is_meshnet_device(self, device: Dict) -> bool:
        """
        Check if device is a MeshNet device.
        
        Args:
            device: Device dictionary
            
        Returns:
            True if MeshNet device, False otherwise
        """
        # Check for MeshNet service UUID in advertised services
        services = device.get('services', [])
        return self._service_uuid in services
    
    def _is_meshnet_network(self, network: Dict) -> bool:
        """
        Check if network is a MeshNet network.
        
        Args:
            network: Network dictionary
            
        Returns:
            True if MeshNet network, False otherwise
        """
        ssid = network.get('ssid', '')
        return ssid.startswith(('MeshNet-', 'MESHNET-'))
    
    def _process_discovered_device(self, device: Dict, protocol: str):
        """
        Process a discovered device.
        
        Args:
            device: Device dictionary
            protocol: Protocol type ('ble' or 'wifi')
        """
        device_id = device.get('address', device.get('ssid', ''))
        
        if not device_id:
            return
        
        # Create discovered device object
        discovered_device = DiscoveredDevice(
            id=device_id,
            name=device.get('name', device.get('ssid', 'Unknown')),
            address=device_id,
            signal_strength=device.get('rssi', device.get('signal', 0)),
            protocol=protocol,
            rssi=device.get('rssi', 0),
            timestamp=time.time(),
            data=device
        )
        
        # Check if device is new
        with self._discovery_lock:
            is_new = device_id not in self._discovered_devices
            self._discovered_devices[device_id] = discovered_device
        
        # Notify callback if new device
        if is_new and self._on_device_discovered:
            Clock.schedule_once(
                lambda dt: self._on_device_discovered(discovered_device)
            )
    
    def _add_mock_device(self, protocol: str):
        """Add a mock device for testing when plyer is not available."""
        mock_device = DiscoveredDevice(
            id=f"mock-{protocol}-{int(time.time())}",
            name=f"Mock {protocol.upper()} Device",
            address=f"00:00:00:00:00:0{protocol.count('ble')}",
            signal_strength=80,
            protocol=protocol,
            rssi=-60,
            timestamp=time.time(),
            data={'mock': True}
        )
        
        with self._discovery_lock:
            is_new = mock_device.id not in self._discovered_devices
            self._discovered_devices[mock_device.id] = mock_device
        
        if is_new and self._on_device_discovered:
            Clock.schedule_once(
                lambda dt: self._on_device_discovered(mock_device)
            )
    
    def _cleanup_old_devices(self):
        """Remove devices that haven't been seen recently."""
        current_time = time.time()
        timeout = 30  # 30 seconds timeout
        
        with self._discovery_lock:
            devices_to_remove = []
            for device_id, device in self._discovered_devices.items():
                if current_time - device.timestamp > timeout:
                    devices_to_remove.append(device_id)
            
            for device_id in devices_to_remove:
                device = self._discovered_devices.pop(device_id)
                if self._on_device_lost:
                    Clock.schedule_once(
                        lambda dt, d=device: self._on_device_lost(d)
                    )
    
    def _notify_status_change(self):
        """Notify status change callback."""
        if self._on_status_change:
            status = self.get_status()
            Clock.schedule_once(
                lambda dt: self._on_status_change(status)
            )
    
    def get_status(self) -> DiscoveryStatus:
        """
        Get current discovery status.
        
        Returns:
            DiscoveryStatus object
        """
        with self._discovery_lock:
            return DiscoveryStatus(
                is_scanning=self._is_scanning,
                is_advertising=self._is_advertising,
                devices_found=len(self._discovered_devices),
                protocol='ble'
            )
    
    def get_discovered_devices(self) -> List[DiscoveredDevice]:
        """
        Get list of discovered devices.
        
        Returns:
            List of DiscoveredDevice objects
        """
        with self._discovery_lock:
            return list(self._discovered_devices.values())
    
    def is_scanning(self) -> bool:
        """Check if discovery is active."""
        with self._discovery_lock:
            return self._is_scanning
    
    def is_advertising(self) -> bool:
        """Check if advertising is active."""
        with self._discovery_lock:
            return self._is_advertising
    
    def set_node_info(self, node_id: str, node_name: str):
        """
        Set device identification information.
        
        Args:
            node_id: Unique node identifier
            node_name: Human-readable device name
        """
        self._node_id = node_id
        self._node_name = node_name
    
    def cleanup(self):
        """Cleanup resources."""
        self.stop_discovery()


# Singleton instance
_mesh_discovery_service: Optional[MeshDiscoveryService] = None


def get_mesh_discovery_service() -> MeshDiscoveryService:
    """Get the singleton mesh discovery service instance."""
    global _mesh_discovery_service
    if _mesh_discovery_service is None:
        _mesh_discovery_service = MeshDiscoveryService()
    return _mesh_discovery_service
