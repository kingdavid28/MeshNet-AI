"""
permissions.py
===============
Android runtime permission management with proper handling
for API 23+ and fallback for older versions.
"""

import logging
from typing import List, Callable, Optional
from enum import Enum
from kivy.utils import platform

logger = logging.getLogger(__name__)


class PermissionStatus(Enum):
    """Permission status"""
    GRANTED = "granted"
    DENIED = "denied"
    NEVER_ASK_AGAIN = "never_ask_again"
    NOT_REQUESTED = "not_requested"


class PermissionManager:
    """
    Android permission manager with:
    - Runtime permission requests
    - Permission status checking
    - Rationale display
    - Fallback for older Android versions
    """
    
    # Required permissions for MeshNet
    REQUIRED_PERMISSIONS = [
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_ADMIN',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.BLUETOOTH_ADVERTISE',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_WIFI_STATE',
        'android.permission.CHANGE_WIFI_STATE',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_EXTERNAL_STORAGE',
    ]
    
    def __init__(self):
        self.permission_status: dict = {}
        self.on_permission_result: Optional[Callable] = None
        
        if platform == 'android':
            self._init_android_permissions()
        else:
            logger.info("Non-Android platform, permissions not required")
            # Grant all permissions on desktop
            for perm in self.REQUIRED_PERMISSIONS:
                self.permission_status[perm] = PermissionStatus.GRANTED
    
    def _init_android_permissions(self) -> None:
        """Initialize Android permission handling"""
        try:
            from android.permissions import request_permissions, Permission, check_permission
            
            # Check current permission status
            for perm in self.REQUIRED_PERMISSIONS:
                try:
                    # Map to android.permissions.Permission enum
                    perm_name = perm.split('.')[-1]
                    if hasattr(Permission, perm_name):
                        granted = check_permission(getattr(Permission, perm_name))
                        self.permission_status[perm] = PermissionStatus.GRANTED if granted else PermissionStatus.NOT_REQUESTED
                    else:
                        self.permission_status[perm] = PermissionStatus.NOT_REQUESTED
                except Exception as e:
                    logger.warning(f"Error checking permission {perm}: {e}")
                    self.permission_status[perm] = PermissionStatus.NOT_REQUESTED
            
            logger.info("Android permissions initialized")
        
        except ImportError:
            logger.warning("android.permissions module not available")
            # Assume permissions granted for testing
            for perm in self.REQUIRED_PERMISSIONS:
                self.permission_status[perm] = PermissionStatus.GRANTED
    
    def request_permissions(self, permissions: Optional[List[str]] = None) -> bool:
        """
        Request runtime permissions.
        
        Args:
            permissions: List of permissions to request (default: all required)
            
        Returns:
            True if request initiated successfully
        """
        if platform != 'android':
            logger.info("Non-Android platform, skipping permission request")
            return True
        
        try:
            from android.permissions import request_permissions, Permission
            
            perms_to_request = permissions or self.REQUIRED_PERMISSIONS
            
            # Convert to android.permissions.Permission objects
            android_perms = []
            for perm in perms_to_request:
                perm_name = perm.split('.')[-1]
                if hasattr(Permission, perm_name):
                    android_perms.append(getattr(Permission, perm_name))
            
            if not android_perms:
                logger.warning("No valid permissions to request")
                return False
            
            logger.info(f"Requesting {len(android_perms)} permissions")
            request_permissions(android_perms)
            
            # Update status (will be confirmed in callback)
            for perm in perms_to_request:
                self.permission_status[perm] = PermissionStatus.NOT_REQUESTED
            
            return True
        
        except ImportError:
            logger.warning("android.permissions module not available")
            return False
        except Exception as e:
            logger.error(f"Error requesting permissions: {e}")
            return False
    
    def check_permission(self, permission: str) -> PermissionStatus:
        """
        Check if a permission is granted.
        
        Args:
            permission: Permission to check
            
        Returns:
            Permission status
        """
        return self.permission_status.get(permission, PermissionStatus.NOT_REQUESTED)
    
    def are_all_permissions_granted(self) -> bool:
        """Check if all required permissions are granted"""
        return all(
            status == PermissionStatus.GRANTED 
            for status in self.permission_status.values()
        )
    
    def get_missing_permissions(self) -> List[str]:
        """Get list of missing permissions"""
        return [
            perm for perm, status in self.permission_status.items()
            if status != PermissionStatus.GRANTED
        ]
    
    def set_permission_result_callback(self, callback: Callable) -> None:
        """Set callback for permission request results"""
        self.on_permission_result = callback
    
    def handle_permission_result(self, permissions: List[str], results: List[bool]) -> None:
        """
        Handle permission request results.
        
        Args:
            permissions: List of permissions requested
            results: List of grant results
        """
        for perm, granted in zip(permissions, results):
            if granted:
                self.permission_status[perm] = PermissionStatus.GRANTED
            else:
                self.permission_status[perm] = PermissionStatus.DENIED
        
        logger.info(f"Permission results: {sum(results)}/{len(results)} granted")
        
        if self.on_permission_result:
            self.on_permission_result(permissions, results)
    
    def should_show_rationale(self, permission: str) -> bool:
        """
        Check if rationale should be shown for a permission.
        
        Args:
            permission: Permission to check
            
        Returns:
            True if rationale should be shown
        """
        # On Android, this would check if the user previously denied the permission
        # For now, return False
        return False
    
    def get_permission_rationale(self, permission: str) -> str:
        """
        Get rationale text for a permission.
        
        Args:
            permission: Permission to get rationale for
            
        Returns:
            Rationale text
        """
        rationales = {
            'android.permission.BLUETOOTH': 'Bluetooth is required to discover and connect to nearby mesh nodes.',
            'android.permission.BLUETOOTH_SCAN': 'Bluetooth scan is required to discover nearby devices.',
            'android.permission.BLUETOOTH_CONNECT': 'Bluetooth connect is required to establish mesh connections.',
            'android.permission.ACCESS_FINE_LOCATION': 'Location access is required for Bluetooth scanning and node positioning.',
            'android.permission.ACCESS_WIFI_STATE': 'Wi-Fi state access is required for network discovery.',
            'android.permission.WRITE_EXTERNAL_STORAGE': 'Storage access is required to save offline data and logs.',
        }
        return rationales.get(permission, 'This permission is required for MeshNet functionality.')
