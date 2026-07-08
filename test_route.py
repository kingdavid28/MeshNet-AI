import requests
import json

url = "http://localhost:5050/api/route"
data = {
    "source": "torres-phone",
    "target": "cmd-hq", 
    "scenario": "earthquake"
}

response = requests.post(url, json=data)
print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)}")
