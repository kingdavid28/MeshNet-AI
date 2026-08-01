"""
logger_config.py
================
Centralized logging configuration for the MeshNet Kivy app.
Provides structured logging with file rotation and proper formatting.
"""

import logging
import logging.handlers
import os
from typing import Optional
from datetime import datetime


def setup_logging(
    log_level: int = logging.INFO,
    log_file: Optional[str] = None,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5
) -> None:
    """
    Setup logging configuration for the application.
    
    Args:
        log_level: Logging level (default: INFO)
        log_file: Path to log file (optional)
        max_bytes: Maximum log file size before rotation
        backup_count: Number of backup log files to keep
    """
    # On Android, skip custom logging setup to avoid Kivy logger recursion
    # Kivy handles its own logging on Android
    try:
        from kivy.utils import platform
        if platform == 'android':
            return
    except ImportError:
        pass
    
    # Create logs directory if needed
    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler with formatting
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)
    
    # File handler with rotation if log file specified
    if log_file:
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count
        )
        file_handler.setLevel(log_level)
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_formatter)
        root_logger.addHandler(file_handler)
    
    # Set specific log levels for noisy libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('requests').setLevel(logging.WARNING)


class AppLogger:
    """
    Application-specific logger with context-aware logging.
    Provides structured logging for different app components.
    """
    
    def __init__(self, name: str):
        """
        Initialize app logger.
        
        Args:
            name: Logger name (usually module name)
        """
        self.logger = logging.getLogger(name)
    
    def debug(self, message: str, **context) -> None:
        """Log debug message with optional context"""
        if context:
            message = f"{message} | Context: {context}"
        self.logger.debug(message)
    
    def info(self, message: str, **context) -> None:
        """Log info message with optional context"""
        if context:
            message = f"{message} | Context: {context}"
        self.logger.info(message)
    
    def warning(self, message: str, **context) -> None:
        """Log warning message with optional context"""
        if context:
            message = f"{message} | Context: {context}"
        self.logger.warning(message)
    
    def error(self, message: str, exception: Optional[Exception] = None, **context) -> None:
        """Log error message with optional exception and context"""
        if context:
            message = f"{message} | Context: {context}"
        if exception:
            message = f"{message} | Exception: {str(exception)}"
        self.logger.error(message, exc_info=exception is not None)
    
    def critical(self, message: str, exception: Optional[Exception] = None, **context) -> None:
        """Log critical message with optional exception and context"""
        if context:
            message = f"{message} | Context: {context}"
        if exception:
            message = f"{message} | Exception: {str(exception)}"
        self.logger.critical(message, exc_info=exception is not None)


def get_logger(name: str) -> AppLogger:
    """
    Get an AppLogger instance.
    
    Args:
        name: Logger name
        
    Returns:
        AppLogger instance
    """
    return AppLogger(name)


# Error tracking
class ErrorTracker:
    """Track and report application errors"""
    
    def __init__(self):
        self.errors: list = []
        self._lock = __import__('threading').Lock()
    
    def record_error(self, error: Exception, context: Optional[dict] = None) -> None:
        """
        Record an error for tracking.
        
        Args:
            error: Exception that occurred
            context: Additional context information
        """
        with self._lock:
            error_record = {
                'type': type(error).__name__,
                'message': str(error),
                'timestamp': datetime.now().isoformat(),
                'context': context or {}
            }
            self.errors.append(error_record)
            
            # Keep only last 100 errors
            if len(self.errors) > 100:
                self.errors.pop(0)
    
    def get_recent_errors(self, count: int = 10) -> list:
        """
        Get recent errors.
        
        Args:
            count: Number of recent errors to return
            
        Returns:
            List of error records
        """
        with self._lock:
            return self.errors[-count:]
    
    def clear_errors(self) -> None:
        """Clear all recorded errors"""
        with self._lock:
            self.errors.clear()


# Global error tracker instance
_error_tracker = ErrorTracker()


def get_error_tracker() -> ErrorTracker:
    """Get the global error tracker instance"""
    return _error_tracker
