"""
cloudant_sync.py
===============
Cloudant/CouchDB integration for cloud data synchronization.
Provides offline-first sync with conflict resolution.
"""

import logging
import json
import threading
import time
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
from enum import Enum
from datetime import datetime

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    logging.warning("requests library not available")

logger = logging.getLogger(__name__)


class SyncStatus(Enum):
    """Synchronization status"""
    SYNCED = "synced"
    PENDING = "pending"
    CONFLICT = "conflict"
    ERROR = "error"


@dataclass
class SyncDocument:
    """Document for synchronization"""
    _id: str
    _rev: Optional[str] = None
    type: str = ""
    data: Dict[str, Any] = None
    sync_status: str = SyncStatus.PENDING.value
    timestamp: float = 0
    
    def __post_init__(self):
        if self.data is None:
            self.data = {}
        if self.timestamp == 0:
            self.timestamp = time.time()


class CloudantSync:
    """
    Cloudant/CouchDB synchronization manager.
    Provides bidirectional sync with conflict resolution.
    """
    
    def __init__(
        self,
        db_url: str,
        username: str,
        password: str,
        database: str = "meshnet"
    ):
        """
        Initialize Cloudant sync.
        
        Args:
            db_url: Cloudant database URL
            username: Cloudant username
            password: Cloudant password/API key
            database: Database name
        """
        if not REQUESTS_AVAILABLE:
            raise ImportError("requests library required")
        
        self.db_url = db_url.rstrip('/')
        self.username = username
        self.password = password
        self.database = database
        self.base_url = f"{self.db_url}/{database}"
        
        self._syncing = False
        self._lock = threading.Lock()
        self._pending_changes: List[SyncDocument] = []
        self._last_seq: Optional[str] = None
        
        # Auth
        self.auth = (username, password)
        
        logger.info(f"Cloudant sync initialized for {database}")
    
    def test_connection(self) -> bool:
        """
        Test connection to Cloudant.
        
        Returns:
            True if connection successful
        """
        try:
            response = requests.get(
                self.base_url,
                auth=self.auth,
                timeout=10
            )
            success = response.status_code == 200
            logger.info(f"Connection test: {success}")
            return success
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False
    
    def create_database(self) -> bool:
        """
        Create database if it doesn't exist.
        
        Returns:
            True if database created or already exists
        """
        try:
            response = requests.put(
                self.base_url,
                auth=self.auth,
                timeout=10
            )
            
            if response.status_code == 201:
                logger.info(f"Database {self.database} created")
                return True
            elif response.status_code == 412:
                logger.info(f"Database {self.database} already exists")
                return True
            else:
                logger.error(f"Failed to create database: {response.status_code}")
                return False
        
        except Exception as e:
            logger.error(f"Error creating database: {e}")
            return False
    
    def get_document(self, doc_id: str) -> Optional[SyncDocument]:
        """
        Get a document by ID.
        
        Args:
            doc_id: Document ID
            
        Returns:
            SyncDocument or None
        """
        try:
            response = requests.get(
                f"{self.base_url}/{doc_id}",
                auth=self.auth,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return SyncDocument(
                    _id=data['_id'],
                    _rev=data.get('_rev'),
                    type=data.get('type', ''),
                    data=data.get('data', {}),
                    sync_status=SyncStatus.SYNCED.value,
                    timestamp=data.get('timestamp', time.time())
                )
            elif response.status_code == 404:
                return None
            else:
                logger.error(f"Error getting document: {response.status_code}")
                return None
        
        except Exception as e:
            logger.error(f"Error getting document: {e}")
            return None
    
    def put_document(self, doc: SyncDocument) -> bool:
        """
        Put/update a document.
        
        Args:
            doc: Document to put
            
        Returns:
            True if successful
        """
        try:
            data = asdict(doc)
            
            response = requests.put(
                f"{self.base_url}/{doc._id}",
                auth=self.auth,
                json=data,
                timeout=10
            )
            
            if response.status_code in [201, 202]:
                # Update revision
                result = response.json()
                doc._rev = result.get('rev')
                doc.sync_status = SyncStatus.SYNCED.value
                logger.debug(f"Document {doc._id} synced")
                return True
            elif response.status_code == 409:
                # Conflict
                doc.sync_status = SyncStatus.CONFLICT.value
                logger.warning(f"Conflict for document {doc._id}")
                return False
            else:
                doc.sync_status = SyncStatus.ERROR.value
                logger.error(f"Error putting document: {response.status_code}")
                return False
        
        except Exception as e:
            doc.sync_status = SyncStatus.ERROR.value
            logger.error(f"Error putting document: {e}")
            return False
    
    def delete_document(self, doc_id: str, rev: str) -> bool:
        """
        Delete a document.
        
        Args:
            doc_id: Document ID
            rev: Document revision
            
        Returns:
            True if successful
        """
        try:
            response = requests.delete(
                f"{self.base_url}/{doc_id}?rev={rev}",
                auth=self.auth,
                timeout=10
            )
            
            success = response.status_code in [200, 202]
            logger.debug(f"Document {doc_id} deleted: {success}")
            return success
        
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            return False
    
    def get_changes(self, since: Optional[str] = None) -> List[Dict]:
        """
        Get changes from database.
        
        Args:
            since: Sequence ID to start from
            
        Returns:
            List of changes
        """
        try:
            params = {'include_docs': True}
            if since:
                params['since'] = since
            
            response = requests.get(
                f"{self.base_url}/_changes",
                auth=self.auth,
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self._last_seq = data.get('last_seq')
                return data.get('results', [])
            else:
                logger.error(f"Error getting changes: {response.status_code}")
                return []
        
        except Exception as e:
            logger.error(f"Error getting changes: {e}")
            return []
    
    def resolve_conflict(self, doc_id: str, strategy: str = "server_wins") -> bool:
        """
        Resolve document conflict.
        
        Args:
            doc_id: Document ID with conflict
            strategy: Resolution strategy (server_wins, client_wins, merge)
            
        Returns:
            True if resolved
        """
        try:
            # Get all revisions
            response = requests.get(
                f"{self.base_url}/{doc_id}?conflicts=true",
                auth=self.auth,
                timeout=10
            )
            
            if response.status_code != 200:
                return False
            
            data = response.json()
            conflicts = data.get('_conflicts', [])
            
            if not conflicts:
                return True  # No conflict
            
            if strategy == "server_wins":
                # Keep current revision, delete others
                for rev in conflicts:
                    self.delete_document(doc_id, rev)
                return True
            
            elif strategy == "client_wins":
                # This would require local data - simplified
                logger.warning("Client wins strategy requires local data")
                return False
            
            elif strategy == "merge":
                # Merge logic would go here
                logger.warning("Merge strategy not implemented")
                return False
            
            return False
        
        except Exception as e:
            logger.error(f"Error resolving conflict: {e}")
            return False
    
    def start_sync(self, interval: float = 30.0) -> None:
        """
        Start continuous synchronization.
        
        Args:
            interval: Sync interval in seconds
        """
        with self._lock:
            if self._syncing:
                return
            self._syncing = True
        
        def _sync_loop():
            while self._syncing:
                try:
                    self.sync_changes()
                    time.sleep(interval)
                except Exception as e:
                    logger.error(f"Sync loop error: {e}")
                    time.sleep(interval)
        
        threading.Thread(target=_sync_loop, daemon=True).start()
        logger.info(f"Sync started with {interval}s interval")
    
    def stop_sync(self) -> None:
        """Stop continuous synchronization"""
        with self._lock:
            self._syncing = False
        logger.info("Sync stopped")
    
    def sync_changes(self) -> int:
        """
        Sync pending changes.
        
        Returns:
            Number of changes synced
        """
        synced_count = 0
        
        # Sync pending local changes
        with self._lock:
            pending = self._pending_changes.copy()
            self._pending_changes.clear()
        
        for doc in pending:
            if self.put_document(doc):
                synced_count += 1
        
        # Pull remote changes
        changes = self.get_changes(self._last_seq)
        for change in changes:
            if change.get('deleted'):
                continue
            
            doc_data = change.get('doc', {})
            if doc_data:
                # Process remote change
                logger.debug(f"Remote change: {doc_data.get('_id')}")
        
        logger.info(f"Synced {synced_count} changes")
        return synced_count
    
    def queue_change(self, doc: SyncDocument) -> None:
        """
        Queue a document for synchronization.
        
        Args:
            doc: Document to sync
        """
        with self._lock:
            self._pending_changes.append(doc)
        logger.debug(f"Queued change: {doc._id}")
    
    def get_pending_count(self) -> int:
        """Get number of pending changes"""
        with self._lock:
            return len(self._pending_changes)
