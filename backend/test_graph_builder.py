from graph_builder import MeshGraphBuilder
from config import MeshConfig

cfg = MeshConfig.from_env()
print(f"Backend API URL: {cfg.backend_api_url}")
print(f"Secret: {cfg.node_shared_secret[:20]}...")

builder = MeshGraphBuilder(api_base=cfg.backend_api_url, cfg=cfg)
G = builder.build()

print(f"Nodes: {G.number_of_nodes()}")
print(f"Edges: {G.number_of_edges()}")
print(f"Nodes in graph: {list(G.nodes())}")
