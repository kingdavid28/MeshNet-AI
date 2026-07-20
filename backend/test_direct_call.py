import requests
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / "config" / ".env")

secret = os.getenv("MESH_NODE_SECRET")
url = "http://localhost:4000/api/mesh/topology"

print(f"Secret: {secret[:20] if secret else 'None'}...")
print(f"URL: {url}")

headers = {"X-Mesh-Secret": secret} if secret else {}
print(f"Headers: {headers}")

response = requests.get(url, headers=headers)
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
