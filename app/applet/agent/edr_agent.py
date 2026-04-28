import psutil
import time
import json
import requests
import datetime
import socket
import os
import platform

# Configuration
BACKEND_URL = "http://localhost:3000/api/system/system-data"
POLL_INTERVAL = 3  # seconds

def get_process_data():
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'exe', 'status', 'cmdline']):
        try:
            pinfo = proc.info
            cmdline = " ".join(pinfo['cmdline']) if pinfo['cmdline'] else ""
            
            sus_patterns = ['miner', 'exploit', 'reverse_shell', 'malware', 'meterpreter', 'beacon', 'cobalt']
            is_sus = any(p in cmdline.lower() or p in (pinfo['name'] or '').lower() for p in sus_patterns)
            
            risk_score = 0.95 if is_sus else (0.5 if pinfo['cpu_percent'] and pinfo['cpu_percent'] > 80 else 0.1)
            flagged = is_sus or (pinfo['cpu_percent'] and pinfo['cpu_percent'] > 80)
            
            processes.append({
                "timestamp": datetime.datetime.now().isoformat(),
                "type": "process",
                "details": {
                    "pid": pinfo['pid'],
                    "name": pinfo['name'],
                    "cpu_percent": pinfo['cpu_percent'],
                    "memory_usage": pinfo['memory_percent'],
                    "exe_path": pinfo['exe'] or "Unknown",
                    "cmdline": cmdline,
                    "status": pinfo['status']
                },
                "risk_score": risk_score,
                "flagged": flagged
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return processes

def get_network_data():
    connections = []
    for conn in psutil.net_connections(kind='inet'):
        try:
            if conn.status == 'ESTABLISHED' and conn.remote_address:
                remote_ip = conn.remote_address.ip
                risk_score = 0
                flagged = False
                
                if not remote_ip.startswith(('127.', '192.168.', '10.', '172.16.')):
                    risk_score += 0.3
                    
                connections.append({
                    "timestamp": datetime.datetime.now().isoformat(),
                    "type": "network",
                    "details": {
                        "local_address": f"{conn.laddr.ip}:{conn.laddr.port}",
                        "remote_address": f"{conn.raddr.ip}:{conn.raddr.port}",
                        "status": conn.status,
                        "pid": conn.pid
                    },
                    "risk_score": risk_score,
                    "flagged": flagged
                })
        except Exception:
            pass
    return connections

def main():
    print("EDR Agent starting...")
    print(f"Monitoring system: {platform.system()} {platform.release()}")
    print(f"Sending data to: {BACKEND_URL}")
    
    while True:
        try:
            process_data = get_process_data()
            network_data = get_network_data()
            
            for data in process_data + network_data:
                try:
                    if data.get('flagged') or data.get('risk_score', 0) > 0.2:
                        requests.post(BACKEND_URL, json=data, timeout=2)
                except requests.exceptions.RequestException:
                    pass
            
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("Agent stopped.")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
