"""
MeshNet AI - Node Data Validation Script
backend/validate_nodes.py

Standalone validation module for checking disaster node data integrity.
Validates incoming data streams for missing fields, invalid values, and data consistency.

Usage:
    python validate_nodes.py [--file disaster_grid.json] [--strict]
    
Validation Rules:
- Required fields: node_id, device_type, latitude, longitude, battery_level, status
- node_id: Must be non-empty string
- latitude: Must be between -90 and 90
- longitude: Must be between -180 and 180
- battery_level: Must be between 0 and 100
- status: Must be one of: active, inactive, emergency, offline
- device_type: Must be one of: Smartphone, Tablet, Laptop, IoT Sensor, Emergency Beacon
"""

import json
import argparse
from typing import List, Dict, Any, Tuple
from enum import Enum


class ValidationSeverity(Enum):
    """Severity levels for validation issues."""
    ERROR = "ERROR"      # Critical issue that prevents processing
    WARNING = "WARNING"  # Issue that should be reviewed but allows processing
    INFO = "INFO"        # Informational note


class ValidationError:
    """Represents a single validation issue."""
    
    def __init__(self, node_id: str, field: str, severity: ValidationSeverity, 
                 message: str, value: Any = None):
        self.node_id = node_id
        self.field = field
        self.severity = severity
        self.message = message
        self.value = value
    
    def __str__(self) -> str:
        value_str = f" (value: {self.value})" if self.value is not None else ""
        return f"[{self.severity.value}] {self.node_id}.{self.field}: {self.message}{value_str}"


class NodeValidator:
    """Validates disaster node data according to MeshNet AI specifications."""
    
    # Valid values for enum fields
    VALID_STATUSES = {"active", "inactive", "emergency", "offline"}
    VALID_DEVICE_TYPES = {"Smartphone", "Tablet", "Laptop", "IoT Sensor", "Emergency Beacon"}
    
    # Required fields
    REQUIRED_FIELDS = {
        "node_id", "device_type", "latitude", "longitude", 
        "battery_level", "status"
    }
    
    # Optional fields
    OPTIONAL_FIELDS = {
        "signal_strength", "last_seen", "registered", "has_weather_hq_signal"
    }
    
    def __init__(self, strict: bool = False):
        """
        Initialize validator.
        
        Args:
            strict: If True, treat warnings as errors
        """
        self.strict = strict
        self.errors: List[ValidationError] = []
        self.warnings: List[ValidationError] = []
        self.infos: List[ValidationError] = []
    
    def validate_node(self, node: Dict[str, Any]) -> List[ValidationError]:
        """
        Validate a single node document.
        
        Args:
            node: Node dictionary to validate
            
        Returns:
            List of validation errors for this node
        """
        node_errors = []
        node_id = node.get("node_id", "UNKNOWN")
        
        # Check required fields
        for field in self.REQUIRED_FIELDS:
            if field not in node:
                error = ValidationError(
                    node_id=node_id,
                    field=field,
                    severity=ValidationSeverity.ERROR,
                    message="Missing required field"
                )
                node_errors.append(error)
                self.errors.append(error)
        
        # If required fields are missing, skip further validation
        if any(e.field in self.REQUIRED_FIELDS for e in node_errors):
            return node_errors
        
        # Validate node_id
        self._validate_node_id(node_id, node.get("node_id"), node_errors)
        
        # Validate device_type
        self._validate_device_type(node_id, node.get("device_type"), node_errors)
        
        # Validate coordinates
        self._validate_latitude(node_id, node.get("latitude"), node_errors)
        self._validate_longitude(node_id, node.get("longitude"), node_errors)
        
        # Validate battery_level
        self._validate_battery_level(node_id, node.get("battery_level"), 
                                   node.get("status"), node_errors)
        
        # Validate status
        self._validate_status(node_id, node.get("status"), node_errors)
        
        # Validate signal_strength if present
        if "signal_strength" in node:
            self._validate_signal_strength(node_id, node.get("signal_strength"), node_errors)
        
        # Check for unknown fields
        known_fields = self.REQUIRED_FIELDS | self.OPTIONAL_FIELDS
        for field in node.keys():
            if field not in known_fields:
                info = ValidationError(
                    node_id=node_id,
                    field=field,
                    severity=ValidationSeverity.INFO,
                    message="Unknown field",
                    value=field
                )
                self.infos.append(info)
        
        return node_errors
    
    def _validate_node_id(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate node_id field."""
        if not value or not isinstance(value, str) or not value.strip():
            error = ValidationError(
                node_id=node_id,
                field="node_id",
                severity=ValidationSeverity.ERROR,
                message="node_id must be a non-empty string",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_device_type(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate device_type field."""
        if value not in self.VALID_DEVICE_TYPES:
            error = ValidationError(
                node_id=node_id,
                field="device_type",
                severity=ValidationSeverity.ERROR,
                message=f"Invalid device_type. Must be one of: {self.VALID_DEVICE_TYPES}",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_latitude(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate latitude field."""
        try:
            lat = float(value)
            if not -90 <= lat <= 90:
                error = ValidationError(
                    node_id=node_id,
                    field="latitude",
                    severity=ValidationSeverity.ERROR,
                    message="Latitude must be between -90 and 90",
                    value=lat
                )
                errors.append(error)
                self.errors.append(error)
        except (TypeError, ValueError):
            error = ValidationError(
                node_id=node_id,
                field="latitude",
                severity=ValidationSeverity.ERROR,
                message="Latitude must be a valid number",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_longitude(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate longitude field."""
        try:
            lng = float(value)
            if not -180 <= lng <= 180:
                error = ValidationError(
                    node_id=node_id,
                    field="longitude",
                    severity=ValidationSeverity.ERROR,
                    message="Longitude must be between -180 and 180",
                    value=lng
                )
                errors.append(error)
                self.errors.append(error)
        except (TypeError, ValueError):
            error = ValidationError(
                node_id=node_id,
                field="longitude",
                severity=ValidationSeverity.ERROR,
                message="Longitude must be a valid number",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_battery_level(self, node_id: str, value: Any, status: str, 
                               errors: List[ValidationError]) -> None:
        """Validate battery_level field."""
        try:
            battery = int(value)
            if not 0 <= battery <= 100:
                error = ValidationError(
                    node_id=node_id,
                    field="battery_level",
                    severity=ValidationSeverity.ERROR,
                    message="Battery level must be between 0 and 100",
                    value=battery
                )
                errors.append(error)
                self.errors.append(error)
            
            # Warning for zero battery on active devices
            if battery == 0 and status == "active":
                warning = ValidationError(
                    node_id=node_id,
                    field="battery_level",
                    severity=ValidationSeverity.WARNING,
                    message="Active device with 0% battery is unusual",
                    value=battery
                )
                errors.append(warning)
                self.warnings.append(warning)
            
            # Warning for critical battery on active devices
            if battery < 20 and status == "active":
                warning = ValidationError(
                    node_id=node_id,
                    field="battery_level",
                    severity=ValidationSeverity.WARNING,
                    message="Active device with critical battery (<20%)",
                    value=battery
                )
                errors.append(warning)
                self.warnings.append(warning)
            
        except (TypeError, ValueError):
            error = ValidationError(
                node_id=node_id,
                field="battery_level",
                severity=ValidationSeverity.ERROR,
                message="Battery level must be a valid integer",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_status(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate status field."""
        if value not in self.VALID_STATUSES:
            error = ValidationError(
                node_id=node_id,
                field="status",
                severity=ValidationSeverity.ERROR,
                message=f"Invalid status. Must be one of: {self.VALID_STATUSES}",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def _validate_signal_strength(self, node_id: str, value: Any, errors: List[ValidationError]) -> None:
        """Validate signal_strength field."""
        try:
            signal = int(value)
            if not 0 <= signal <= 100:
                error = ValidationError(
                    node_id=node_id,
                    field="signal_strength",
                    severity=ValidationSeverity.ERROR,
                    message="Signal strength must be between 0 and 100",
                    value=signal
                )
                errors.append(error)
                self.errors.append(error)
        except (TypeError, ValueError):
            error = ValidationError(
                node_id=node_id,
                field="signal_strength",
                severity=ValidationSeverity.ERROR,
                message="Signal strength must be a valid integer",
                value=value
            )
            errors.append(error)
            self.errors.append(error)
    
    def validate_dataset(self, nodes: List[Dict[str, Any]]) -> Tuple[bool, int, int, int]:
        """
        Validate an entire dataset of nodes.
        
        Args:
            nodes: List of node dictionaries to validate
            
        Returns:
            Tuple of (is_valid, error_count, warning_count, info_count)
        """
        self.errors.clear()
        self.warnings.clear()
        self.infos.clear()
        
        for node in nodes:
            self.validate_node(node)
        
        # Check for duplicate node_ids
        node_ids = [node.get("node_id") for node in nodes if "node_id" in node]
        duplicates = [nid for nid in node_ids if node_ids.count(nid) > 1]
        for dup in set(duplicates):
            error = ValidationError(
                node_id="DUPLICATE_CHECK",
                field="node_id",
                severity=ValidationSeverity.ERROR,
                message=f"Duplicate node_id found in dataset",
                value=dup
            )
            self.errors.append(error)
        
        if self.strict:
            return (len(self.errors) == 0, len(self.errors), len(self.warnings), len(self.infos))
        else:
            critical_errors = [e for e in self.errors if e.severity == ValidationSeverity.ERROR]
            return (len(critical_errors) == 0, len(self.errors), len(self.warnings), len(self.infos))
    
    def get_summary(self) -> str:
        """Get a formatted summary of validation results."""
        lines = [
            "="*60,
            "Validation Summary",
            "="*60,
            f"Errors: {len(self.errors)}",
            f"Warnings: {len(self.warnings)}",
            f"Info: {len(self.infos)}",
        ]
        
        if self.errors:
            lines.append("\nERRORS:")
            for error in self.errors:
                lines.append(f"  {error}")
        
        if self.warnings:
            lines.append("\nWARNINGS:")
            for warning in self.warnings:
                lines.append(f"  {warning}")
        
        if self.infos:
            lines.append("\nINFO:")
            for info in self.infos[:10]:  # Limit to first 10 info messages
                lines.append(f"  {info}")
            if len(self.infos) > 10:
                lines.append(f"  ... and {len(self.infos) - 10} more")
        
        return "\n".join(lines)


def load_json_file(file_path: str) -> List[Dict[str, Any]]:
    """Load JSON data from file."""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Handle different JSON formats
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and 'docs' in data:
        return data['docs']
    elif isinstance(data, dict) and 'rows' in data:
        return [row.get('doc', row) for row in data['rows']]
    else:
        raise ValueError("Unknown JSON format")


def main():
    parser = argparse.ArgumentParser(description="Validate disaster node data")
    parser.add_argument("--file", type=str, default="disaster_grid.json",
                       help="JSON file to validate (default: disaster_grid.json)")
    parser.add_argument("--strict", action="store_true",
                       help="Treat warnings as errors")
    parser.add_argument("--quiet", action="store_true",
                       help="Only show summary, not individual errors")
    
    args = parser.parse_args()
    
    print("="*60)
    print("MeshNet AI - Node Data Validator")
    print("="*60)
    print(f"Validating: {args.file}")
    print(f"Strict mode: {args.strict}")
    print()
    
    try:
        nodes = load_json_file(args.file)
        print(f"Loaded {len(nodes)} nodes from file")
        print()
        
        validator = NodeValidator(strict=args.strict)
        is_valid, error_count, warning_count, info_count = validator.validate_dataset(nodes)
        
        if not args.quiet:
            print(validator.get_summary())
        else:
            print(f"Validation complete: {error_count} errors, {warning_count} warnings, {info_count} info")
        
        print()
        if is_valid:
            print("✓ Validation PASSED")
            return 0
        else:
            print("✗ Validation FAILED")
            return 1
            
    except FileNotFoundError:
        print(f"✗ File not found: {args.file}")
        return 1
    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}")
        return 1
    except Exception as e:
        print(f"✗ Error: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
