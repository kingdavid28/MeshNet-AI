"""
api_client.py
============
HTTP API client for backend integration with proper error handling,
authentication, and retry logic.
"""

import logging
import json
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

logger = logging.getLogger(__name__)


class APIError(Enum):
    """API error types"""
    NETWORK_ERROR = "network_error"
    TIMEOUT = "timeout"
    AUTH_ERROR = "auth_error"
    SERVER_ERROR = "server_error"
    CLIENT_ERROR = "client_error"
    UNKNOWN_ERROR = "unknown_error"


@dataclass
class APIResponse:
    """Standard API response wrapper"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_type: Optional[APIError] = None
    status_code: Optional[int] = None


class APIClient:
    """
    Production-ready HTTP API client with:
    - Authentication token management
    - Automatic retry logic
    - Error handling
    - Request/response logging
    - Timeout handling
    """
    
    def __init__(
        self,
        base_url: str,
        timeout: int = 30,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        """
        Initialize API client.
        
        Args:
            base_url: Base URL for API endpoints
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            retry_delay: Delay between retries in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.auth_token: Optional[str] = None
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
    
    def set_auth_token(self, token: str) -> None:
        """Set authentication token for requests"""
        self.auth_token = token
        self.session.headers.update({
            'Authorization': f'Bearer {token}'
        })
        logger.info("Auth token set")
    
    def clear_auth_token(self) -> None:
        """Clear authentication token"""
        self.auth_token = None
        if 'Authorization' in self.session.headers:
            del self.session.headers['Authorization']
        logger.info("Auth token cleared")
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        retry_count: int = 0
    ) -> APIResponse:
        """
        Make HTTP request with retry logic and error handling.
        
        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            data: Request body data
            params: Query parameters
            retry_count: Current retry attempt
            
        Returns:
            APIResponse with success status and data/error
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            logger.debug(f"Request: {method} {url}")
            
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout
            )
            
            # Log response
            logger.debug(f"Response: {response.status_code}")
            
            # Handle successful responses
            if response.status_code == 200:
                try:
                    return APIResponse(
                        success=True,
                        data=response.json(),
                        status_code=response.status_code
                    )
                except json.JSONDecodeError:
                    return APIResponse(
                        success=True,
                        data={'raw': response.text},
                        status_code=response.status_code
                    )
            
            # Handle authentication errors
            elif response.status_code == 401:
                logger.warning("Authentication failed")
                return APIResponse(
                    success=False,
                    error="Authentication failed",
                    error_type=APIError.AUTH_ERROR,
                    status_code=response.status_code
                )
            
            # Handle client errors
            elif 400 <= response.status_code < 500:
                error_msg = response.text or "Client error"
                logger.warning(f"Client error: {error_msg}")
                return APIResponse(
                    success=False,
                    error=error_msg,
                    error_type=APIError.CLIENT_ERROR,
                    status_code=response.status_code
                )
            
            # Handle server errors (retry)
            elif 500 <= response.status_code < 600:
                if retry_count < self.max_retries:
                    logger.warning(f"Server error, retrying ({retry_count + 1}/{self.max_retries})")
                    time.sleep(self.retry_delay * (retry_count + 1))
                    return self._make_request(method, endpoint, data, params, retry_count + 1)
                
                logger.error(f"Server error after {self.max_retries} retries")
                return APIResponse(
                    success=False,
                    error="Server error",
                    error_type=APIError.SERVER_ERROR,
                    status_code=response.status_code
                )
        
        except Timeout:
            if retry_count < self.max_retries:
                logger.warning(f"Timeout, retrying ({retry_count + 1}/{self.max_retries})")
                time.sleep(self.retry_delay * (retry_count + 1))
                return self._make_request(method, endpoint, data, params, retry_count + 1)
            
            logger.error("Request timeout")
            return APIResponse(
                success=False,
                error="Request timeout",
                error_type=APIError.TIMEOUT
            )
        
        except ConnectionError:
            if retry_count < self.max_retries:
                logger.warning(f"Connection error, retrying ({retry_count + 1}/{self.max_retries})")
                time.sleep(self.retry_delay * (retry_count + 1))
                return self._make_request(method, endpoint, data, params, retry_count + 1)
            
            logger.error("Connection error")
            return APIResponse(
                success=False,
                error="Connection error",
                error_type=APIError.NETWORK_ERROR
            )
        
        except RequestException as e:
            logger.error(f"Request exception: {e}")
            return APIResponse(
                success=False,
                error=str(e),
                error_type=APIError.UNKNOWN_ERROR
            )
        
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return APIResponse(
                success=False,
                error=str(e),
                error_type=APIError.UNKNOWN_ERROR
            )
    
    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> APIResponse:
        """GET request"""
        return self._make_request('GET', endpoint, params=params)
    
    def post(self, endpoint: str, data: Optional[Dict[str, Any]] = None) -> APIResponse:
        """POST request"""
        return self._make_request('POST', endpoint, data=data)
    
    def put(self, endpoint: str, data: Optional[Dict[str, Any]] = None) -> APIResponse:
        """PUT request"""
        return self._make_request('PUT', endpoint, data=data)
    
    def delete(self, endpoint: str) -> APIResponse:
        """DELETE request"""
        return self._make_request('DELETE', endpoint)
    
    def close(self) -> None:
        """Close the session"""
        self.session.close()
        logger.info("API client closed")


class MeshNetAPI:
    """
    MeshNet-specific API client with endpoints for:
    - Node management
    - Messaging
    - Emergency mode
    - Network discovery
    """
    
    def __init__(self, base_url: str):
        self.client = APIClient(base_url)
    
    def set_auth(self, token: str) -> None:
        """Set authentication token"""
        self.client.set_auth_token(token)
    
    def discover_nodes(self) -> APIResponse:
        """Discover nearby mesh nodes"""
        return self.client.get('/api/nodes/discover')
    
    def register_node(self, node_data: Dict[str, Any]) -> APIResponse:
        """Register this node with the network"""
        return self.client.post('/api/nodes/register', data=node_data)
    
    def get_nodes(self) -> APIResponse:
        """Get all nodes in the network"""
        return self.client.get('/api/nodes')
    
    def send_message(self, recipient_id: str, message: str) -> APIResponse:
        """Send message to a node"""
        return self.client.post('/api/messages', data={
            'recipient_id': recipient_id,
            'message': message
        })
    
    def get_messages(self) -> APIResponse:
        """Get all messages"""
        return self.client.get('/api/messages')
    
    def activate_emergency_mode(self) -> APIResponse:
        """Activate emergency mode"""
        return self.client.post('/api/emergency/activate')
    
    def deactivate_emergency_mode(self) -> APIResponse:
        """Deactivate emergency mode"""
        return self.client.post('/api/emergency/deactivate')
    
    def get_emergency_status(self) -> APIResponse:
        """Get emergency mode status"""
        return self.client.get('/api/emergency/status')
    
    def get_network_status(self) -> APIResponse:
        """Get network status"""
        return self.client.get('/api/network/status')
    
    def close(self) -> None:
        """Close the API client"""
        self.client.close()
