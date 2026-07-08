import requests

secret = "6D86BF911C7251206107275D23BB3F993542A0B86BAAC510AEF80B4C554143E876BBEC724AF568F832E321D10175445DFABDEAFA7BAE96AD14B0F749C843469C"
url = "http://localhost:4000/api/route"
data = {
    "source": "torres-phone",
    "target": "cmd-hq",
    "scenario": "earthquake"
}

response = requests.post(url, json=data, headers={"X-Mesh-Secret": secret})
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
