import sys
import os
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent / "config" / ".env"
print(f"Loading env from: {env_path}")
print(f"Env file exists: {env_path.exists()}")
load_dotenv(dotenv_path=env_path, override=True)

# Check if env vars are loaded
print(f"MESH_SECRET set: {bool(os.getenv('MESH_SECRET'))}")
print(f"MESH_NODE_SECRET set: {bool(os.getenv('MESH_NODE_SECRET'))}")

from config import MeshConfig
from graph_builder import MeshGraphBuilder

cfg = MeshConfig.from_env()
print(f"Config loaded: backend_api_url={cfg.backend_api_url}")
print(f"Node shared secret: {cfg.node_shared_secret[:20]}...")

builder = MeshGraphBuilder(
    api_base=cfg.backend_api_url,
    scenario="earthquake",
    cfg=cfg,
)

print("Building graph...")
G = builder.build()
print(f"Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
