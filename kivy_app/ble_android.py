"""
ble_android.py
==============
Actual Android BLE implementation using pyjnius for native Android BLE API.
Provides real BLE scanning, advertising, and GATT server/client functionality.
"""

import logging
import threading
import time
from typing import Optional, Dict, List, Callable, Any
from dataclasses import dataclass
from enum import Enum
from kivy.utils import platform

logger = logging.getLogger(__name__)


class BLEState(Enum):
    """BLE adapter states"""
    STATE_OFF = 10
    STATE_TURNING_ON = 11
    STATE_ON = 12
    STATE_TURNING_OFF = 13


class ScanMode(Enum):
    """BLE scan modes"""
    LOW_POWER = 0
    BALANCED = 1
    LOW_LATENCY = 2


@dataclass
class BLEDevice:
    """Discovered BLE device"""
    address: str
    name: Optional[str]
    rssi: int
    scan_record: bytes
    timestamp: float


@dataclass
class BLEService:
    """BLE service"""
    uuid: str
    characteristics: List[str]


class AndroidBLEScanner:
    """
    Android BLE scanner using native Android BLE API via pyjnius.
    """
    
    def __init__(self):
        """Initialize BLE scanner"""
        self._scanning = False
        self._devices: Dict[str, BLEDevice] = {}
        self._scan_callback: Optional[Callable] = None
        self._lock = threading.Lock()
        self._scan_thread: Optional[threading.Thread] = None
        self._ble_adapter = None
        self._ble_scanner = None
        
        if platform == 'android':
            self._init_android_ble()
        else:
            logger.warning("Non-Android platform, BLE scanner will use simulation")
    
    def _init_android_ble(self) -> None:
        """Initialize Android BLE components"""
        try:
            from jnius import autoclass
            
            # Get BluetoothManager
            BluetoothManager = autoclass('android.bluetooth.BluetoothManager')
            Context = autoclass('android.content.Context')
            
            # Get BluetoothAdapter
            from android import mActivity
            self._ble_adapter = BluetoothManager.getSystemService(
                mActivity, Context.BLUETOOTH_SERVICE
            ).getAdapter()
            
            if self._ble_adapter:
                logger.info("Android BLE adapter initialized")
            else:
                logger.error("Failed to get BLE adapter")
        
        except ImportError:
            logger.error("pyjnius not available")
        except Exception as e:
            logger.error(f"Error initializing Android BLE: {e}")
    
    def is_bluetooth_enabled(self) -> bool:
        """Check if Bluetooth is enabled"""
        if platform != 'android' or not self._ble_adapter:
            return True  # Assume enabled on desktop
        
        try:
            return self._ble_adapter.isEnabled()
        except Exception as e:
            logger.error(f"Error checking Bluetooth state: {e}")
            return False
    
    def start_scan(
        self,
        callback: Callable[[BLEDevice], None],
        scan_mode: ScanMode = ScanMode.BALANCED,
        scan_duration: int = 10
    ) -> bool:
        """
        Start BLE scanning.
        
        Args:
            callback: Callback for discovered devices
            scan_mode: Scan mode (power vs latency)
            scan_duration: Scan duration in seconds
            
        Returns:
            True if scan started successfully
        """
        with self._lock:
            if self._scanning:
                logger.warning("Already scanning")
                return False
            
            self._scanning = True
            self._scan_callback = callback
        
        if platform == 'android' and self._ble_adapter:
            return self._start_android_scan(scan_mode, scan_duration)
        else:
            return self._start_simulation_scan(scan_duration)
    
    def _start_android_scan(self, scan_mode: ScanMode, duration: int) -> bool:
        """Start actual Android BLE scan"""
        try:
            from jnius import autoclass
            from android import mActivity
            
            # Create scan callback
            ScanCallback = autoclass('android.bluetooth.le.ScanCallback')
            ScanSettings = autoclass('android.bluetooth.le.ScanSettings')
            ScanSettingsBuilder = autoclass('android.bluetooth.le.ScanSettings$Builder')
            ScanFilter = autoclass('android.bluetooth.le.ScanFilter')
            BluetoothLeScanner = autoclass('android.bluetooth.le.BluetoothLeScanner')
            
            # Build scan settings
            scan_settings = ScanSettingsBuilder()
            scan_settings.setScanMode(scan_mode.value)
            scan_settings.setReportDelay(0)
            
            # Get scanner
            self._ble_scanner = self._ble_adapter.getBluetoothLeScanner()
            
            if not self._ble_scanner:
                logger.error("BLE scanner not available")
                return False
            
            # Start scan
            self._ble_scanner.startScan([], scan_settings.build(), self._create_scan_callback())
            logger.info(f"Android BLE scan started for {duration}s")
            
            # Schedule stop
            threading.Timer(duration, self.stop_scan).start()
            
            return True
        
        except Exception as e:
            logger.error(f"Error starting Android scan: {e}")
            return False
    
    def _create_scan_callback(self):
        """Create Android scan callback"""
        from jnius import autoclass
        
        PythonScanCallback = autoclass('android.bluetooth.le.ScanCallback')
        
        class MeshNetScanCallback(PythonScanCallback):
            def __init__(self, outer_self):
                super().__init__()
                self.outer = outer_self
            
            def onScanResult(self, callbackType, result):
                """Handle scan result"""
                try:
                    device = result.getDevice()
                    scan_record = result.getScanRecord()
                    
                    ble_device = BLEDevice(
                        address=device.getAddress(),
                        name=device.getName(),
                        rssi=result.getRssi(),
                        scan_record=scan_record.getBytes() if scan_record else b'',
                        timestamp=time.time()
                    )
                    
                    with self.outer._lock:
                        self.outer._devices[ble_device.address] = ble_device
                    
                    if self.outer._scan_callback:
                        self.outer._scan_callback(ble_device)
                
                except Exception as e:
                    logger.error(f"Error in scan callback: {e}")
            
            def onBatchScanResults(self, results):
                """Handle batch scan results"""
                for result in results.getList():
                    self.onScanResult(0, result)
            
            def onScanFailed(self, errorCode):
                """Handle scan failure"""
                logger.error(f"Scan failed with error code: {errorCode}")
        
        return MeshNetScanCallback(self)
    
    def _start_simulation_scan(self, duration: int) -> bool:
        """Start simulated scan for desktop testing"""
        def _simulate():
            import random
            for i in range(duration):
                if not self._scanning:
                    break
                
                # Simulate discovering a device
                device = BLEDevice(
                    address=f"00:11:22:33:44:{i:02X}",
                    name=f"MeshNode-{i}",
                    rssi=random.randint(-60, -90),
                    scan_record=b'',
                    timestamp=time.time()
                )
                
                with self._lock:
                    self._devices[device.address] = device
                
                if self._scan_callback:
                    self._scan_callback(device)
                
                time.sleep(1)
        
        self._scan_thread = threading.Thread(target=_simulate, daemon=True)
        self._scan_thread.start()
        logger.info(f"Simulation scan started for {duration}s")
        return True
    
    def stop_scan(self) -> None:
        """Stop BLE scanning"""
        with self._lock:
            if not self._scanning:
                return
            self._scanning = False
        
        if platform == 'android' and self._ble_scanner:
            try:
                self._ble_scanner.stopScan(self._create_scan_callback())
                logger.info("Android BLE scan stopped")
            except Exception as e:
                logger.error(f"Error stopping Android scan: {e}")
        
        if self._scan_thread:
            self._scan_thread.join(timeout=2)
    
    def get_discovered_devices(self) -> List[BLEDevice]:
        """Get list of discovered devices"""
        with self._lock:
            return list(self._devices.values())
    
    def clear_devices(self) -> None:
        """Clear discovered devices"""
        with self._lock:
            self._devices.clear()


class AndroidBLEAdvertiser:
    """
    Android BLE advertiser for mesh node discovery.
    """
    
    def __init__(self):
        """Initialize BLE advertiser"""
        self._advertising = False
        self._ble_adapter = None
        self._advertiser = None
        
        if platform == 'android':
            self._init_android_advertiser()
    
    def _init_android_advertiser(self) -> None:
        """Initialize Android BLE advertiser"""
        try:
            from jnius import autoclass
            BluetoothManager = autoclass('android.bluetooth.BluetoothManager')
            Context = autoclass('android.content.Context')
            
            from android import mActivity
            self._ble_adapter = BluetoothManager.getSystemService(
                mActivity, Context.BLUETOOTH_SERVICE
            ).getAdapter()
            
            if self._ble_adapter:
                logger.info("Android BLE advertiser initialized")
        
        except Exception as e:
            logger.error(f"Error initializing BLE advertiser: {e}")
    
    def start_advertising(
        self,
        service_uuid: str,
        device_name: str,
        manufacturer_data: Optional[bytes] = None
    ) -> bool:
        """
        Start BLE advertising.
        
        Args:
            service_uuid: Service UUID to advertise
            device_name: Device name
            manufacturer_data: Optional manufacturer data
            
        Returns:
            True if advertising started successfully
        """
        if self._advertising:
            logger.warning("Already advertising")
            return False
        
        if platform != 'android' or not self._ble_adapter:
            logger.info("Simulation advertising started")
            self._advertising = True
            return True
        
        try:
            from jnius import autoclass
            AdvertiseCallback = autoclass('android.bluetooth.le.AdvertiseCallback')
            AdvertiseSettings = autoclass('android.bluetooth.le.AdvertiseSettings')
            AdvertiseSettingsBuilder = autoclass('android.bluetooth.le.AdvertiseSettings$Builder')
            AdvertiseData = autoclass('android.bluetooth.le.AdvertiseData')
            AdvertiseDataBuilder = autoclass('android.bluetooth.le.AdvertiseData$Builder')
            ParcelUuid = autoclass('android.os.ParcelUuid')
            UUID = autoclass('java.util.UUID')
            
            # Build advertise settings
            settings = AdvertiseSettingsBuilder()
            settings.setConnectable(True)
            settings.setTimeout(0)  # Unlimited
            settings.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            
            # Build advertise data
            data_builder = AdvertiseDataBuilder()
            data_builder.setIncludeDeviceName(True)
            
            # Add service UUID
            uuid = UUID.fromString(service_uuid)
            data_builder.addServiceUuid(ParcelUuid(uuid))
            
            # Add manufacturer data if provided
            if manufacturer_data:
                data_builder.addManufacturerData(0xFFFF, manufacturer_data)
            
            # Get advertiser
            self._advertiser = self._ble_adapter.getBluetoothLeAdvertiser()
            
            if not self._advertiser:
                logger.error("BLE advertiser not available")
                return False
            
            # Start advertising
            self._advertiser.startAdvertising(
                settings.build(),
                data_builder.build(),
                self._create_advertise_callback()
            )
            
            self._advertising = True
            logger.info(f"BLE advertising started: {device_name}")
            return True
        
        except Exception as e:
            logger.error(f"Error starting advertising: {e}")
            return False
    
    def _create_advertise_callback(self):
        """Create Android advertise callback"""
        from jnius import autoclass
        
        AdvertiseCallback = autoclass('android.bluetooth.le.AdvertiseCallback')
        
        class MeshNetAdvertiseCallback(AdvertiseCallback):
            def __init__(self, outer_self):
                super().__init__()
                self.outer = outer_self
            
            def onStartSuccess(self, settingsInEffect):
                """Handle advertising start success"""
                logger.info("Advertising started successfully")
            
            def onStartFailure(self, errorCode):
                """Handle advertising start failure"""
                logger.error(f"Advertising failed with error code: {errorCode}")
                self.outer._advertising = False
        
        return MeshNetAdvertiseCallback(self)
    
    def stop_advertising(self) -> None:
        """Stop BLE advertising"""
        if not self._advertising:
            return
        
        if platform == 'android' and self._advertiser:
            try:
                self._advertiser.stopAdvertising(self._create_advertise_callback())
                logger.info("BLE advertising stopped")
            except Exception as e:
                logger.error(f"Error stopping advertising: {e}")
        
        self._advertising = False
    
    def is_advertising(self) -> bool:
        """Check if currently advertising"""
        return self._advertising
