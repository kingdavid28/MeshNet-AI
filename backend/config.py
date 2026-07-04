"""
MeshNet AI — Python Network Brain
backend/config.py

Environment configuration for the mesh network simulation.
All physical range values are in metres; tweak them per field
measurements before any live deployment.

Usage:
    from config import MAX_RANGE_FLOOD, TOTAL_SIMULATED_NODES, ...
    or
    from config import MeshConfig  # typed dataclass for IDE support
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


# ──────────────────────────────────────────────────────────────────────────────
# Disaster-scenario communication ranges — per protocol
# ──────────────────────────────────────────────────────────────────────────────
# Two independent radios are modelled for every device:
#
#   Bluetooth Low Energy (BLE)
#     - Short-range (~10–100 m), low power, works even on 5% battery
#     - Used for peer discovery and short-hop routing
#
#   Wi-Fi Direct / Hotspot
#     - Medium-range (~100–400 m), higher throughput, more battery use
#     - Used for bulk data transfer and longer hops
#     - A phone in hotspot mode can bridge BLE-only peers to a wider area
#
# Physical obstacles, water absorption, and RF interference are already
# factored into the conservative estimates below.

# ── Bluetooth BLE ranges ──────────────────────────────────────────────────────

BLE_RANGE_FLOOD: int = int(os.getenv("MESH_BLE_RANGE_FLOOD", 80))
# BLE radius during floods — water absorbs 2.4 GHz; elevated devices ~80 m.

BLE_RANGE_WAR_ZONE: int = int(os.getenv("MESH_BLE_RANGE_WAR_ZONE", 20))
# BLE radius in conflict zones — RF jamming limits effective range to 20 m.

BLE_RANGE_EARTHQUAKE: int = int(os.getenv("MESH_BLE_RANGE_EARTHQUAKE", 120))
# BLE radius in post-quake open fields — rubble-free line-of-sight ~120 m.

# ── Wi-Fi Direct / hotspot ranges ────────────────────────────────────────────

WIFI_RANGE_FLOOD: int = int(os.getenv("MESH_WIFI_RANGE_FLOOD", 200))
# Wi-Fi Direct radius during floods — 2.4 GHz at elevation reaches ~200 m.

WIFI_RANGE_WAR_ZONE: int = int(os.getenv("MESH_WIFI_RANGE_WAR_ZONE", 50))
# Wi-Fi radius in war zones — jamming reduces range to ~50 m.

WIFI_RANGE_EARTHQUAKE: int = int(os.getenv("MESH_WIFI_RANGE_EARTHQUAKE", 400))
# Wi-Fi radius in post-quake fields — near-free-space propagation ~400 m.

# ── Legacy combined ranges (max of BLE + WiFi) — kept for backwards compat ───

MAX_RANGE_FLOOD: int      = WIFI_RANGE_FLOOD
MAX_RANGE_WAR_ZONE: int   = WIFI_RANGE_WAR_ZONE
MAX_RANGE_EARTHQUAKE: int = WIFI_RANGE_EARTHQUAKE

TOTAL_SIMULATED_NODES: int = int(os.getenv("MESH_TOTAL_NODES", 100))
# Total virtual devices loaded into the simulation database.


# ──────────────────────────────────────────────────────────────────────────────
# Network topology defaults
# ──────────────────────────────────────────────────────────────────────────────

DEFAULT_BATTERY_MIN: int = 20    # % — nodes below this are considered critical
DEFAULT_SIGNAL_THRESHOLD: int = 40  # % RSSI — links below this are unreliable
MAX_HOPS: int = 7                   # AODV maximum hop count before TTL expiry
PACKET_LOSS_RATE: float = 0.05      # 5 % simulated packet loss per hop


# ──────────────────────────────────────────────────────────────────────────────
# IBM Cloudant / backend API
# ──────────────────────────────────────────────────────────────────────────────

CLOUDANT_URL: str = os.getenv("CLOUDANT_URL", "")
CLOUDANT_API_KEY: str = os.getenv("CLOUDANT_API_KEY", "")
CLOUDANT_DB: str = os.getenv("CLOUDANT_DB", "mesh_nodes_db")

BACKEND_API_URL: str = os.getenv("BACKEND_API_URL", "http://localhost:4000")

# Request timeout in seconds for all outbound HTTP calls
HTTP_TIMEOUT: int = int(os.getenv("HTTP_TIMEOUT", 10))


# ──────────────────────────────────────────────────────────────────────────────
# Cryptography
# ──────────────────────────────────────────────────────────────────────────────

# Shared secret for node-to-node HMAC verification.
# Override via environment variable — never hard-code in production.
NODE_SHARED_SECRET: str = os.getenv(
    "MESH_NODE_SECRET", "CHANGE-ME-before-deployment"
)

# AES-GCM key size in bits (256 is the standard for field deployments)
AES_KEY_BITS: int = 256


# ──────────────────────────────────────────────────────────────────────────────
# Typed dataclass — use this when you want IDE autocomplete & type safety
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MeshConfig:
    """
    Immutable snapshot of the active mesh configuration.
    Pass instances of this class into simulation functions instead of
    reading globals, to make testing and parameterisation easier.

    Example
    -------
    >>> cfg = MeshConfig.from_env()
    >>> print(cfg.range_for_scenario("flood"))
    200
    >>> print(cfg.ble_range_for_scenario("flood"))
    80
    """

    # BLE ranges per scenario
    ble_range_flood:      int = BLE_RANGE_FLOOD
    ble_range_war_zone:   int = BLE_RANGE_WAR_ZONE
    ble_range_earthquake: int = BLE_RANGE_EARTHQUAKE

    # Wi-Fi Direct ranges per scenario
    wifi_range_flood:      int = WIFI_RANGE_FLOOD
    wifi_range_war_zone:   int = WIFI_RANGE_WAR_ZONE
    wifi_range_earthquake: int = WIFI_RANGE_EARTHQUAKE

    # Legacy combined (max of the two) — kept for backwards compat
    max_range_flood:      int = MAX_RANGE_FLOOD
    max_range_war_zone:   int = MAX_RANGE_WAR_ZONE
    max_range_earthquake: int = MAX_RANGE_EARTHQUAKE

    # Simulation
    total_simulated_nodes: int = TOTAL_SIMULATED_NODES
    default_battery_min: int = DEFAULT_BATTERY_MIN
    default_signal_threshold: int = DEFAULT_SIGNAL_THRESHOLD
    max_hops: int = MAX_HOPS
    packet_loss_rate: float = PACKET_LOSS_RATE

    # Connectivity
    cloudant_url: str = field(default_factory=lambda: CLOUDANT_URL)
    cloudant_api_key: str = field(default_factory=lambda: CLOUDANT_API_KEY)
    cloudant_db: str = field(default_factory=lambda: CLOUDANT_DB)
    backend_api_url: str = field(default_factory=lambda: BACKEND_API_URL)
    http_timeout: int = HTTP_TIMEOUT

    # Security
    node_shared_secret: str = field(default_factory=lambda: NODE_SHARED_SECRET)
    aes_key_bits: int = AES_KEY_BITS

    # ── Helpers ──────────────────────────────────────────────────────────────

    @classmethod
    def from_env(cls) -> "MeshConfig":
        """Construct a MeshConfig by reading current environment variables."""
        return cls()

    def range_for_scenario(self, scenario: str) -> int:
        """Return the maximum effective range (metres) for a given scenario.
        This is the Wi-Fi Direct range — the larger of the two radios."""
        _map = {
            "flood":      self.wifi_range_flood,
            "war_zone":   self.wifi_range_war_zone,
            "earthquake": self.wifi_range_earthquake,
        }
        if scenario not in _map:
            raise ValueError(
                f"Unknown scenario '{scenario}'. "
                f"Valid options: {list(_map.keys())}"
            )
        return _map[scenario]

    def ble_range_for_scenario(self, scenario: str) -> int:
        """Return the Bluetooth BLE range (metres) for a given scenario."""
        _map = {
            "flood":      self.ble_range_flood,
            "war_zone":   self.ble_range_war_zone,
            "earthquake": self.ble_range_earthquake,
        }
        if scenario not in _map:
            raise ValueError(
                f"Unknown scenario '{scenario}'. "
                f"Valid options: {list(_map.keys())}"
            )
        return _map[scenario]

    def summary(self) -> str:
        """Return a human-readable configuration summary for logging."""
        return (
            f"MeshNet AI Config\n"
            f"  BLE ranges : flood={self.ble_range_flood}m  "
            f"war_zone={self.ble_range_war_zone}m  "
            f"earthquake={self.ble_range_earthquake}m\n"
            f"  WiFi ranges: flood={self.wifi_range_flood}m  "
            f"war_zone={self.wifi_range_war_zone}m  "
            f"earthquake={self.wifi_range_earthquake}m\n"
            f"  Nodes      : {self.total_simulated_nodes} simulated\n"
            f"  Max hops   : {self.max_hops}\n"
            f"  Packet loss: {self.packet_loss_rate * 100:.0f}%\n"
            f"  Cloudant DB: {self.cloudant_db or '(not configured)'}\n"
            f"  Backend API: {self.backend_api_url}"
        )


# ──────────────────────────────────────────────────────────────────────────────
# Quick self-test — run `python config.py` to verify the setup
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cfg = MeshConfig.from_env()
    print(cfg.summary())
    print()
    for scenario in ("flood", "war_zone", "earthquake"):
        print(f"  range_for_scenario('{scenario}') -> {cfg.range_for_scenario(scenario)} m")
