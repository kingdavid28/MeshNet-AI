# MeshNet-AI Kivy Application

A native Android application built with Python, Kivy, and KivyMD for the MeshNet-AI offline emergency communication platform.

## Features

- **BackendConnectionCard**: Manual backend configuration UI with custom text input
- **Connection Retry**: Automatic retry logic with thread-safe connection management
- **Asynchronous Polling**: Background polling of topology endpoint for real-time updates
- **Schema Normalizer**: Robust JSON parser that handles multiple backend schema formats
- **Connectivity Indicator**: Visual status indicator in system status row
- **Dynamic UI**: Collapsible backend configuration card in LeftPanel

## Installation

### Prerequisites

- Python 3.8+
- Android device or emulator (for APK build)
- Kivy and KivyMD dependencies

### Setup

```bash
# Navigate to kivy_app directory
cd kivy_app

# Install dependencies
pip install -r requirements.txt

# Run the application
python main.py
```

## Building for Android

### Using Buildozer

```bash
# Install buildozer
pip install buildozer

# Initialize buildozer
buildozer init

# Build APK
buildozer android debug

# Install on connected device
buildozer android deploy
```

## Project Structure

```
kivy_app/
├── main.py              # Main entry point and application layout
├── ui.py                # UI components (BackendConnectionCard, etc.)
├── routing.py           # Schema normalizer for backend data
├── requirements.txt     # Python dependencies
├── tests/
│   ├── __init__.py
│   └── test_routing.py  # Unit tests for schema normalizer
└── README.md           # This file
```

## Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_routing.py -v

# Run with coverage
pytest tests/ --cov=routing --cov-report=html
```

## Backend Configuration

The Kivy app connects to the Express backend running on port 4000. Use the BackendConnectionCard to:

1. Enter the backend URL (default: `http://localhost:4000`)
2. Click "Connect" to establish connection
3. View connection status and node count
4. Click "Retry" to reconnect on failure

## Schema Normalization

The `parse_backend_node` function in `routing.py` handles multiple backend schema formats:

- **Standard format**: `{id, label, lat, lng, battery, signal, device, role, ...}`
- **Legacy format**: `{node_id, name, latitude, longitude, ...}`
- **Nested format**: `{data: {id, label, ...}}`

See `tests/test_routing.py` for comprehensive test coverage.

## Best Practices

- Thread-safe connection management using locks
- Background polling with graceful shutdown
- Robust error handling and user feedback
- Schema validation with fallback values
- Unit tests for critical parsing logic

## License

See parent repository license.
