# MeshNet Protocol Specification

## Version 1.0

## Overview
This specification defines the MeshNet protocol for device discovery, mesh networking, and secure communication between devices.

## Table of Contents
1. [Packet Format](#packet-format)
2. [BLE Advertising](#ble-advertising)
3. [WiFi Direct Protocol](#wifi-direct-protocol)
4. [Mesh Routing](#mesh-routing)
5. [Security](#security)
6. [API Integration](#api-integration)

## Packet Format

### Header Structure
```
struct MeshPacketHeader {
    uint8_t version;        // Protocol version (1)
    uint8_t type;           // Packet type (see below)
    uint16_t length;        // Payload length
    uint32_t source_id;     // Source device ID
    uint32_t dest_id;       // Destination device ID (0 for broadcast)
    uint8_t hop_count;      // Current hop count
    uint8_t ttl;            // Time to live
    uint32_t sequence;      // Sequence number
    uint32_t timestamp;     // Unix timestamp
}
```

### Packet Types
```c
enum PacketType {
    DISCOVERY = 0x01,       // Device discovery
    DISCOVERY_RESP = 0x02,  // Discovery response
    HEARTBEAT = 0x03,       // Keepalive
    DATA = 0x04,            // Data payload
    ROUTE_UPDATE = 0x05,    // Routing table update
    ALERT = 0x06,           // Emergency alert
    ACK = 0x07,             // Acknowledgment
    ERROR = 0x08            // Error message
}
```

### Complete Packet Structure
```
struct MeshPacket {
    MeshPacketHeader header;
    uint8_t payload[];      // Encrypted payload
    uint32_t signature;     // HMAC-SHA256 signature
    uint16_t checksum;      // CRC16 checksum
}
```

## BLE Advertising

### Advertising Data Format
```
Flags: 0x02 (LE General Discoverable Mode)
Service UUID: 0x180A (MeshNet Service)
Manufacturer Data: {
    uint16_t company_id: 0x4C00 (MeshNet)
    uint8_t network_id: 8 bytes
    uint8_t device_id: 4 bytes
    uint8_t capabilities: 1 byte
    uint8_t protocol_version: 1 byte
}
```

### Capabilities Bitmask
```
Bit 0: BLE Support
Bit 1: WiFi Direct Support
Bit 2: Relay Mode
Bit 3: Battery Powered
Bit 4-7: Reserved
```

### GATT Services

#### MeshNet Service (UUID: 0x180A)
```
Characteristic: Mesh Control (UUID: 0x2A00)
- Properties: Read, Write, Notify
- Format: MeshPacket

Characteristic: Mesh Data (UUID: 0x2A01)
- Properties: Read, Write, Notify
- Format: Variable length data

Characteristic: Device Info (UUID: 0x2A02)
- Properties: Read
- Format: DeviceInfo struct
```

#### DeviceInfo Structure
```
struct DeviceInfo {
    uint8_t device_id[4];
    uint8_t device_type;
    uint8_t capabilities;
    uint8_t battery_level;
    int32_t signal_strength;
    float latitude;
    float longitude;
    uint8_t last_seen[4];
}
```

### BLE Advertising Parameters
```
Advertising Interval: 100ms - 1000ms (adaptive)
Scan Interval: 100ms - 500ms
Scan Window: 50ms - 100ms
TX Power: -20dBm to +20dBm (adaptive)
```

## WiFi Direct Protocol

### Discovery Phase
```
P2P_DISCOVER_REQUEST:
{
    "network_id": "8 bytes",
    "device_id": "4 bytes",
    "capabilities": "1 byte",
    "protocol_version": "1 byte"
}

P2P_DISCOVER_RESPONSE:
{
    "device_id": "4 bytes",
    "accept": "boolean",
    "channel": "integer",
    "encryption_key": "32 bytes"
}
```

### Connection Phase
```
P2P_CONNECT:
{
    "encryption_key": "32 bytes",
    "protocol_version": "1 byte",
    "supported_protocols": ["batman-adv", "olsr"]
}

P2P_CONNECT_ACK:
{
    "status": "integer",
    "assigned_ip": "string",
    "mesh_subnet": "string"
}
```

### WiFi Direct Parameters
```
WPS Method: PBC (Push Button Configuration)
Group Owner Intent: 15 (auto-negotiate)
Operating Channel: 1, 6, or 11 (auto-select)
Max Clients: 10
Security: WPA3-Personal
Passphrase: 32 bytes (randomly generated)
```

## Mesh Routing

### BATMAN-adv Implementation

#### Originator Message (OGM)
```
struct OGM {
    uint8_t version;
    uint32_t originator;
    uint8_t ttl;
    uint8_t flags;
    uint16_t seqno;
    uint32_t gw_flags;
    uint8_t throughput[4];
}
```

#### Routing Table Entry
```
struct RouteEntry {
    uint32_t dest;
    uint32_t next_hop;
    uint8_t hop_count;
    uint32_t last_seen;
    uint32_t seqno;
    uint8_t quality;
}
```

### OLSR Implementation

#### HELLO Message
```
struct HELLO {
    uint8_t willingness;
    uint16_t htime;
    struct LinkInfo {
        uint32_t neighbor;
        uint8_t link_quality;
        uint8_t link_status;
    } links[];
}
```

#### TC Message (Topology Control)
```
struct TC {
    uint16_t ansn;
    uint32_t originator;
    struct Neighbor {
        uint32_t address;
        uint16_t link_quality;
    } neighbors[];
}
```

### Routing Metrics
```
Link Quality = (RSSI * 0.4) + (Packet Loss * 0.3) + (Latency * 0.3)
Path Cost = Sum of (1 / Link Quality) for each hop
Best Path = Minimum Path Cost
```

### Heartbeat Mechanism
```
Heartbeat Interval: 30 seconds
Missed Heartbeats Threshold: 3
Node Timeout: 90 seconds
Route Update Interval: 60 seconds
```

## Security

### DTLS Handshake
```
1. ClientHello: Supported cipher suites, MeshNet protocol version
2. ServerHello: Selected cipher suite, certificate
3. Certificate: Device certificate with shared secret
4. ClientKeyExchange: Pre-master secret encrypted with public key
5. Finished: Verify handshake
```

### Supported Cipher Suites
```
TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
TLS_PSK_WITH_AES_256_GCM_SHA384 (for shared secret auth)
```

### Encryption
```
Algorithm: AES-256-GCM
Key Size: 256 bits
IV Size: 96 bits
Tag Size: 128 bits
Key Derivation: HKDF-SHA256
```

### Authentication
```
Method: Shared Secret Authentication
Secret Length: 32 bytes
Storage: Secure Enclave (iOS) / Keystore (Android)
Rotation: Every 30 days
```

### Message Authentication
```
Algorithm: HMAC-SHA256
Key Size: 256 bits
Signature Size: 32 bytes
Position: End of packet
```

### Rate Limiting
```
Discovery Requests: 10 per minute
Data Packets: 100 per second per connection
Route Updates: 5 per second
Alert Messages: 1 per second
```

### Privacy Mode
```
When enabled:
- Disable BLE advertising
- Disable WiFi Direct discovery
- Reject all incoming connections
- Maintain existing connections only
- Allow emergency alerts
```

## API Integration

### Device Registration
```
POST /api/mesh/register
Headers: {
    "X-Mesh-Secret": "shared_secret",
    "Content-Type": "application/json"
}
Body: {
    "id": "device_id",
    "label": "device_label",
    "name": "device_name",
    "device": "smartphone|laptop",
    "role": "peer|relay",
    "signal": 0-100,
    "batteryPercentage": 0-100,
    "bluetoothStatus": true|false,
    "wifiStatus": true|false,
    "os": "operating_system",
    "lat": latitude,
    "lng": longitude
}
Response: {
    "registered": true,
    "node": { ... }
}
```

### Heartbeat
```
PATCH /api/mesh/nodes/:id/heartbeat
Headers: {
    "X-Mesh-Secret": "shared_secret",
    "Content-Type": "application/json"
}
Body: {
    "signal": 0-100,
    "batteryPercentage": 0-100,
    "bluetoothStatus": true|false,
    "wifiStatus": true|false,
    "lat": latitude,
    "lng": longitude
}
Response: {
    "updated": true
}
```

### Edge Registration
```
POST /api/mesh/edges
Headers: {
    "X-Mesh-Secret": "shared_secret",
    "Content-Type": "application/json"
}
Body: {
    "a": "device_a_id",
    "b": "device_b_id",
    "protocol": "wifi|bluetooth",
    "quality": 0-100
}
Response: {
    "registered": true,
    "edge": { ... }
}
```

### Topology Fetch
```
GET /api/mesh/topology
Headers: {
    "X-Mesh-Secret": "shared_secret"
}
Response: {
    "nodes": [...],
    "edges": [...],
    "updatedAt": "timestamp"
}
```

## Error Handling

### Error Codes
```
0x01: Invalid Packet Format
0x02: Unsupported Protocol Version
0x03: Authentication Failed
0x04: Encryption Failed
0x05: Rate Limit Exceeded
0x06: Network Full
0x07: Device Not Found
0x08: Connection Timeout
0x09: Route Not Found
0x0A: Invalid Destination
```

### Error Message Format
```
struct ErrorMessage {
    uint8_t error_code;
    uint16_t error_length;
    uint8_t error_message[];
}
```

## Performance Requirements

### Latency
- Discovery: <5 seconds
- Connection: <10 seconds
- Data transmission: <100ms per hop
- Route calculation: <50ms

### Throughput
- BLE: 1-2 Mbps
- WiFi Direct: 10-50 Mbps
- Mesh routing: Support 50+ concurrent devices

### Battery
- Idle: <1% per hour
- Active scanning: <5% per hour
- Data transmission: <10% per hour

## Compliance

### Standards
- Bluetooth Core Specification 5.0+
- WiFi Direct Certification
- DTLS 1.3
- AES-256-GCM (NIST approved)
- GDPR (data protection)

### Certifications
- FCC (US)
- CE (Europe)
- Bluetooth SIG
- WiFi Alliance

## Future Enhancements

### Version 2.0
- LoRa integration for long-range
- Satellite communication fallback
- Machine learning for route optimization
- Blockchain for device reputation

### Version 3.0
- Quantum-resistant encryption
- Self-healing mesh networks
- Autonomous swarm intelligence
- Integration with emergency services
