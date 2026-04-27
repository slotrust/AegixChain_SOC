import os
import time
import json
import requests
import platform
import datetime
import subprocess

# CONFIGURATION
BACKEND_URL = "http://localhost:3000/api/logs"
POLL_INTERVAL = 5  # seconds
SYSTEM_NAME = platform.node()

def get_linux_logs():
    logs = []
    try:
        # Read last 10 lines of auth.log
        if os.path.exists("/var/log/auth.log"):
            output = subprocess.check_output(["tail", "-n", "10", "/var/log/auth.log"]).decode()
            for line in output.splitlines():
                if "failed" in line.lower() or "accepted" in line.lower():
                    logs.append({
                        "timestamp": datetime.datetime.now().isoformat(),
                        "source_ip": "127.0.0.1", # Simplified
                        "username": "unknown",
                        "event_type": "login_failure" if "failed" in line.lower() else "login_success",
                        "status_code": 401 if "failed" in line.lower() else 200,
                        "payload": {"raw": line},
                        "geo_country": "US",
                        "port": 22
                    })
    except Exception as e:
        print(f"Error reading Linux logs: {e}")
    return logs

def get_windows_logs():
    # This requires 'pywin32' package
    # import win32evtlog
    return []

def collect_and_send():
    print(f"CyberSOC Agent started on {SYSTEM_NAME}...")
    while True:
        logs = []
        if platform.system() == "Linux":
            logs = get_linux_logs()
        elif platform.system() == "Windows":
            logs = get_windows_logs()
            
        # Fallback/Simulated real log if no OS logs found (for demo)
        if not logs:
            logs.append({
                "timestamp": datetime.datetime.now().isoformat(),
                "source_ip": "127.0.0.1",
                "username": os.getlogin() if hasattr(os, 'getlogin') else "system",
                "event_type": "system_check",
                "status_code": 200,
                "payload": {"message": "Agent heartbeat"},
                "geo_country": "US",
                "port": 80
            })

        for log in logs:
            try:
                requests.post(BACKEND_URL, json=log, timeout=5)
            except Exception as e:
                print(f"Failed to send log: {e}")
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    collect_and_send()
