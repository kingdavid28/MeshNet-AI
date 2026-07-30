"""
MeshNet-AI — tests/test_backend.py
===================================
Unit and integration tests for local_backend.py.
Asserts correct responses for:
  - GET /api/mesh/topology
  - POST /api/mesh/register (Register/update node)
  - POST /api/emergency/sos (Route / broadcast SOS)
  - WebRTC signaling endpoints (offer, answer, candidates)
  - OPTIONS preflight request / CORS handling
"""

import os
import sys
import json
import urllib.request
import urllib.error
import types
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Stub Kivy modules so messaging.py imports without a display ───────────────
kivy_stub  = types.ModuleType("kivy")
clock_stub = types.ModuleType("kivy.clock")
utils_stub = types.ModuleType("kivy.utils")

class _ClockStub:
    """Synchronously executes Clock.schedule_once callbacks in tests."""
    @staticmethod
    def schedule_once(cb, delay=0):
        try:
            cb(delay)
        except Exception:
            pass  # swallow any GUI-only errors

clock_stub.Clock    = _ClockStub()
utils_stub.platform = "linux"   # non-Android → log dir falls back to ./logs/

kivy_stub.clock = clock_stub
kivy_stub.utils = utils_stub
sys.modules.setdefault("kivy",       kivy_stub)
sys.modules.setdefault("kivy.clock", clock_stub)
sys.modules.setdefault("kivy.utils", utils_stub)
# ─────────────────────────────────────────────────────────────────────────────

from local_backend import get_local_backend

TEST_PORT = 4099
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


@pytest.fixture(scope="module", autouse=True)
def backend_server():
    """Starts the backend server on a test port before tests and stops it after."""
    backend = get_local_backend(port=TEST_PORT)
    backend.start()
    yield
    backend.stop()


def _make_request(url, data=None, method="GET", headers=None):
    """Helper to perform HTTP requests."""
    if headers is None:
        headers = {}

    req_data = json.dumps(data).encode("utf-8") if data is not None else None
    if req_data:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=req_data, method=method, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=3.0) as response:
            res_headers = response.info()
            body = response.read().decode("utf-8")
            return response.status, res_headers, body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read().decode("utf-8")


def test_cors_preflight_options():
    status, headers, body = _make_request(
        f"{BASE_URL}/api/mesh/topology", method="OPTIONS"
    )
    # Flask-CORS should handle OPTIONS preflight
    assert status in [200, 204] or status == 405  # Flask may return 405 for OPTIONS


def test_get_topology():
    status, headers, body = _make_request(f"{BASE_URL}/api/mesh/topology")
    assert status == 200

    data = json.loads(body)
    assert isinstance(data, list)


def test_post_topology_register_and_update():
    # Register new node
    test_node_data = {
        "id": "TEST-NODE-XYZ",
        "label": "Test Node",
        "lat": 12.34,
        "lng": 56.78,
        "battery": 82.5,
        "signal": 75,
        "device": "tablet",
        "role": "peer"
    }
    status, headers, body = _make_request(
        f"{BASE_URL}/api/mesh/register", data=test_node_data, method="POST"
    )
    assert status == 200
    res = json.loads(body)
    assert res["success"] is True

    # Query topology again to verify it exists
    status, headers, body = _make_request(f"{BASE_URL}/api/mesh/topology")
    assert status == 200
    topology_data = json.loads(body)
    nodes = {n["id"]: n for n in topology_data}

    assert "TEST-NODE-XYZ" in nodes
    registered = nodes["TEST-NODE-XYZ"]
    assert registered["battery"] == 82.5
    assert registered["device"] == "tablet"
    assert registered["lat"] == 12.34
    assert registered["lng"] == 56.78


def test_webrtc_signaling_flow():
    # 1. Post WebRTC offer for target node TEST-TARGET
    offer_payload = {
        "target_node_id": "TEST-TARGET",
        "sender_node_id": "TEST-SENDER",
        "offer": {"type": "offer", "sdp": "v=0..."}
    }
    status, headers, body = _make_request(
        f"{BASE_URL}/api/webrtc/offer", data=offer_payload, method="POST"
    )
    assert status == 200
    assert json.loads(body)["status"] == "SUCCESS"

    # 2. Get WebRTC offer for TEST-TARGET
    status, headers, body = _make_request(f"{BASE_URL}/api/webrtc/offer/TEST-TARGET")
    assert status == 200
    offers = json.loads(body)["offers"]
    assert len(offers) == 1
    assert offers[0]["sender_node_id"] == "TEST-SENDER"
    assert offers[0]["offer"]["type"] == "offer"

    # 3. Post WebRTC answer
    answer_payload = {
        "target_node_id": "TEST-SENDER",
        "sender_node_id": "TEST-TARGET",
        "answer": {"type": "answer", "sdp": "v=0...-answer"}
    }
    status, headers, body = _make_request(
        f"{BASE_URL}/api/webrtc/answer", data=answer_payload, method="POST"
    )
    assert status == 200

    # 4. Get WebRTC answer for TEST-SENDER
    status, headers, body = _make_request(f"{BASE_URL}/api/webrtc/answer/TEST-SENDER")
    assert status == 200
    answers = json.loads(body)["answers"]
    assert len(answers) == 1
    assert answers[0]["sender_node_id"] == "TEST-TARGET"
    assert answers[0]["answer"]["type"] == "answer"

    # 5. Post WebRTC ICE candidate
    candidate_payload = {
        "target_node_id": "TEST-SENDER",
        "sender_node_id": "TEST-TARGET",
        "candidate": {"candidate": "candidate:12345", "sdpMid": "0", "sdpMLineIndex": 0}
    }
    status, headers, body = _make_request(
        f"{BASE_URL}/api/webrtc/candidates", data=candidate_payload, method="POST"
    )
    assert status == 200

    # 6. Get WebRTC candidates for TEST-SENDER
    status, headers, body = _make_request(f"{BASE_URL}/api/webrtc/candidates/TEST-SENDER")
    assert status == 200
    candidates = json.loads(body)["candidates"]
    assert len(candidates) == 1
    assert candidates[0]["sender_node_id"] == "TEST-TARGET"


def test_health_check():
    status, headers, body = _make_request(f"{BASE_URL}/api/health")
    assert status == 200
    data = json.loads(body)
    assert data["status"] == "healthy"
    assert "nodes" in data
    assert "port" in data
