"""
security.py
===========
Security utilities for the MeshNet Kivy app.
Provides input validation, sanitization, and secure storage.
"""

import re
import hashlib
import secrets
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass


class SecurityLevel(Enum):
    """Security levels for data"""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    SECRET = "secret"


@dataclass
class ValidationResult:
    """Result of validation operation"""
    valid: bool
    errors: List[str]
    sanitized: Optional[Any] = None


class InputValidator:
    """
    Input validation and sanitization following security best practices.
    """
    
    # Patterns for validation
    PATTERNS = {
        'email': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
        'url': r'^https?://[^\s/$.?#].[^\s]*$',
        'node_id': r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
        'gps_lat': r'^-?([0-8]?[0-9]|90)(\.[0-9]{1,10})?$',
        'gps_lon': r'^-?([0-1]?[0-9]?[0-9]|1[0-7][0-9]|180)(\.[0-9]{1,10})?$',
        'message': r'^[\s\S]{1,1000}$',
        'username': r'^[a-zA-Z0-9_]{3,30}$',
    }
    
    # SQL injection patterns
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER)\b)",
        r"(--|;|/\*|\*/|@@)",
        r"(\bOR\b.*=.*=|\bAND\b.*=.*=)",
        r"(\bWHERE\b.*\bOR\b)",
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        r"<script.*?>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe.*?>",
        r"<object.*?>",
        r"<embed.*?>",
    ]
    
    @classmethod
    def validate_email(cls, email: str) -> ValidationResult:
        """Validate email address"""
        errors = []
        
        if not email:
            errors.append("Email is required")
            return ValidationResult(False, errors)
        
        if len(email) > 254:
            errors.append("Email too long")
        
        if not re.match(cls.PATTERNS['email'], email):
            errors.append("Invalid email format")
        
        return ValidationResult(len(errors) == 0, errors, email.lower() if len(errors) == 0 else None)
    
    @classmethod
    def validate_url(cls, url: str) -> ValidationResult:
        """Validate URL"""
        errors = []
        
        if not url:
            errors.append("URL is required")
            return ValidationResult(False, errors)
        
        if len(url) > 2048:
            errors.append("URL too long")
        
        if not re.match(cls.PATTERNS['url'], url):
            errors.append("Invalid URL format")
        
        return ValidationResult(len(errors) == 0, errors, url if len(errors) == 0 else None)
    
    @classmethod
    def validate_node_id(cls, node_id: str) -> ValidationResult:
        """Validate node ID (UUID format)"""
        errors = []
        
        if not node_id:
            errors.append("Node ID is required")
            return ValidationResult(False, errors)
        
        if not re.match(cls.PATTERNS['node_id'], node_id):
            errors.append("Invalid node ID format")
        
        return ValidationResult(len(errors) == 0, errors, node_id.lower() if len(errors) == 0 else None)
    
    @classmethod
    def validate_gps_coordinates(cls, lat: float, lon: float) -> ValidationResult:
        """Validate GPS coordinates"""
        errors = []
        
        if not (-90 <= lat <= 90):
            errors.append("Invalid latitude (must be -90 to 90)")
        
        if not (-180 <= lon <= 180):
            errors.append("Invalid longitude (must be -180 to 180)")
        
        return ValidationResult(len(errors) == 0, errors, (lat, lon) if len(errors) == 0 else None)
    
    @classmethod
    def validate_message(cls, message: str) -> ValidationResult:
        """Validate message content"""
        errors = []
        
        if not message:
            errors.append("Message is required")
            return ValidationResult(False, errors)
        
        if len(message) > 1000:
            errors.append("Message too long (max 1000 characters)")
        
        if len(message) < 1:
            errors.append("Message too short")
        
        # Check for XSS
        for pattern in cls.XSS_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                errors.append("Message contains potentially dangerous content")
                break
        
        return ValidationResult(len(errors) == 0, errors, message if len(errors) == 0 else None)
    
    @classmethod
    def validate_username(cls, username: str) -> ValidationResult:
        """Validate username"""
        errors = []
        
        if not username:
            errors.append("Username is required")
            return ValidationResult(False, errors)
        
        if len(username) < 3:
            errors.append("Username too short (min 3 characters)")
        
        if len(username) > 30:
            errors.append("Username too long (max 30 characters)")
        
        if not re.match(cls.PATTERNS['username'], username):
            errors.append("Username can only contain letters, numbers, and underscores")
        
        return ValidationResult(len(errors) == 0, errors, username if len(errors) == 0 else None)
    
    @classmethod
    def sanitize_string(cls, input_str: str, max_length: int = 1000) -> str:
        """
        Sanitize string input.
        
        Args:
            input_str: Input string to sanitize
            max_length: Maximum allowed length
            
        Returns:
            Sanitized string
        """
        if not input_str:
            return ""
        
        # Remove null bytes
        sanitized = input_str.replace('\x00', '')
        
        # Truncate to max length
        sanitized = sanitized[:max_length]
        
        # Strip leading/trailing whitespace
        sanitized = sanitized.strip()
        
        return sanitized
    
    @classmethod
    def check_sql_injection(cls, input_str: str) -> bool:
        """
        Check for SQL injection patterns.
        
        Args:
            input_str: Input string to check
            
        Returns:
            True if SQL injection detected
        """
        for pattern in cls.SQL_INJECTION_PATTERNS:
            if re.search(pattern, input_str, re.IGNORECASE):
                logger.warning(f"SQL injection pattern detected: {input_str[:50]}")
                return True
        return False
    
    @classmethod
    def check_xss(cls, input_str: str) -> bool:
        """
        Check for XSS patterns.
        
        Args:
            input_str: Input string to check
            
        Returns:
            True if XSS detected
        """
        for pattern in cls.XSS_PATTERNS:
            if re.search(pattern, input_str, re.IGNORECASE):
                logger.warning(f"XSS pattern detected: {input_str[:50]}")
                return True
        return False
    
    @classmethod
    def validate_json(cls, json_str: str) -> ValidationResult:
        """
        Validate and parse JSON string.
        
        Args:
            json_str: JSON string to validate
            
        Returns:
            ValidationResult with parsed data
        """
        errors = []
        
        if not json_str:
            errors.append("JSON string is required")
            return ValidationResult(False, errors)
        
        try:
            data = json.loads(json_str)
            return ValidationResult(True, [], data)
        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON: {str(e)}")
            return ValidationResult(False, errors)


class SecureStorage:
    """
    Secure storage for sensitive data using encryption.
    """
    
    def __init__(self):
        self._storage: Dict[str, str] = {}
        self._encryption_key = self._generate_key()
    
    def _generate_key(self) -> bytes:
        """Generate encryption key"""
        return secrets.token_bytes(32)
    
    def _encrypt(self, data: str) -> str:
        """
        Encrypt data (simplified - in production use proper encryption).
        
        Args:
            data: Data to encrypt
            
        Returns:
            Encrypted data as hex string
        """
        # In production, use proper encryption like cryptography.fernet
        # This is a placeholder for demonstration
        key = hashlib.sha256(self._encryption_key).hexdigest()
        data_hash = hashlib.sha256(data.encode()).hexdigest()
        return f"{key}:{data_hash}"
    
    def _decrypt(self, encrypted_data: str) -> Optional[str]:
        """
        Decrypt data (simplified - in production use proper encryption).
        
        Args:
            encrypted_data: Encrypted data
            
        Returns:
            Decrypted data or None
        """
        # In production, use proper decryption
        # This is a placeholder for demonstration
        return encrypted_data
    
    def store(self, key: str, value: str, security_level: SecurityLevel = SecurityLevel.CONFIDENTIAL) -> bool:
        """
        Store value securely.
        
        Args:
            key: Storage key
            value: Value to store
            security_level: Security level of the data
            
        Returns:
            True if stored successfully
        """
        try:
            if security_level in [SecurityLevel.CONFIDENTIAL, SecurityLevel.SECRET]:
                encrypted = self._encrypt(value)
                self._storage[key] = encrypted
            else:
                self._storage[key] = value
            
            logger.debug(f"Stored {key} with security level {security_level.value}")
            return True
        except Exception as e:
            logger.error(f"Error storing {key}: {e}")
            return False
    
    def retrieve(self, key: str) -> Optional[str]:
        """
        Retrieve value from storage.
        
        Args:
            key: Storage key
            
        Returns:
            Retrieved value or None
        """
        try:
            value = self._storage.get(key)
            if value:
                # Try to decrypt if it looks encrypted
                if ':' in value:
                    return self._decrypt(value)
                return value
            return None
        except Exception as e:
            logger.error(f"Error retrieving {key}: {e}")
            return None
    
    def delete(self, key: str) -> bool:
        """
        Delete value from storage.
        
        Args:
            key: Storage key
            
        Returns:
            True if deleted successfully
        """
        try:
            if key in self._storage:
                del self._storage[key]
                logger.debug(f"Deleted {key}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting {key}: {e}")
            return False
    
    def clear_all(self) -> None:
        """Clear all stored data"""
        self._storage.clear()
        logger.info("Cleared all secure storage")


class TokenManager:
    """
    Manage authentication tokens with secure storage.
    """
    
    def __init__(self, storage: SecureStorage):
        """
        Initialize token manager.
        
        Args:
            storage: Secure storage instance
        """
        self.storage = storage
        self._token_key = "auth_token"
    
    def store_token(self, token: str) -> bool:
        """
        Store authentication token.
        
        Args:
            token: Authentication token
            
        Returns:
            True if stored successfully
        """
        if not token or len(token) < 10:
            logger.error("Invalid token")
            return False
        
        return self.storage.store(self._token_key, token, SecurityLevel.SECRET)
    
    def get_token(self) -> Optional[str]:
        """
        Retrieve authentication token.
        
        Returns:
            Token or None
        """
        return self.storage.retrieve(self._token_key)
    
    def clear_token(self) -> bool:
        """
        Clear authentication token.
        
        Returns:
            True if cleared successfully
        """
        return self.storage.delete(self._token_key)
    
    def validate_token(self, token: str) -> bool:
        """
        Validate token format.
        
        Args:
            token: Token to validate
            
        Returns:
            True if token format is valid
        """
        # Basic validation - in production, validate against backend
        return token and len(token) >= 10


class RateLimiter:
    """
    Rate limiter to prevent abuse.
    """
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            max_requests: Maximum requests per window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: List[float] = []
    
    def is_allowed(self) -> bool:
        """
        Check if request is allowed.
        
        Returns:
            True if request is within rate limit
        """
        import time
        current_time = time.time()
        
        # Remove old requests outside the window
        self._requests = [req_time for req_time in self._requests 
                         if current_time - req_time < self.window_seconds]
        
        # Check if under limit
        if len(self._requests) < self.max_requests:
            self._requests.append(current_time)
            return True
        
        logger.warning(f"Rate limit exceeded: {len(self._requests)} requests in {self.window_seconds}s")
        return False
    
    def reset(self) -> None:
        """Reset rate limiter"""
        self._requests.clear()
        logger.info("Rate limiter reset")
