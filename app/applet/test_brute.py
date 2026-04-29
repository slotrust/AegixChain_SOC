import requests
import time

API_URL = "http://localhost:3000/api/auth/login"

for i in range(20):
    try:
        response = requests.post(API_URL, json={
            "username": "admin",
            "password": f"wrongpass{i}"
        }, timeout=2)
        print(f"[{i+1}] Request sent - Status: {response.status_code}")
        time.sleep(0.1)
    except Exception as e:
        print(f"[{i+1}] Error: {e}")
        break
