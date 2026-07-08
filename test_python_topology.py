import requests

url = "http://localhost:5050/api/simulation/topology?scenario=earthquake"

response = requests.get(url)
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
