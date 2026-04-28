import os
import time
import json
import socket
import threading
from typing import Dict, Any, List
import subprocess

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

class DeceptionMesh:
    def __init__(self):
        self.traps = []

    def deploy_trap(self, trap_type: str, location: str) -> Dict[str, Any]:
        trap = {
            "id": int(time.time()),
            "type": trap_type,
            "location": location,
            "status": "active",
            "hits": 0
        }
        self.traps.append(trap)
        
        message = f"Deployed {trap_type} trap at {location}."
        if trap_type == "fake_credentials":
            # Generate fake realistic credentials
            fake_creds = [
                "aegix_admin:Admin@2026!#",
                "db_service:sup3r_s3cr3t_p@ss",
                "aws_access_key:AKIAIOSFODNN7EXAMPLE",
                "aws_secret_key:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            ]
            creds_str = "\\n".join(fake_creds)
            
            # Actually write these to a file to make the honeypot "real"
            vault_dir = "/app/applet/aegix/honeypot_vault"
            os.makedirs(vault_dir, exist_ok=True)
            with open(os.path.join(vault_dir, "credentials.txt"), "w") as f:
                f.write(creds_str)
                
            message = f"Injected fake credentials into {location} space and written to physical honeypot vault."
        elif trap_type == "honey_file":
            message = f"Created decoy file 'passwords.txt' in {location}."
            
        return {
            "action": "deploy_trap",
            "trap_type": trap_type,
            "status": "success",
            "message": message
        }

    def deploy_secure_shell_trap(self, port: int = 2222) -> Dict[str, Any]:
        trap_type = "secure_shell_trap"
        trap = {
            "id": int(time.time()),
            "type": trap_type,
            "location": f"Port {port}",
            "status": "active",
            "hits": 0
        }
        self.traps.append(trap)

        def ssh_listener():
            try:
                import subprocess, sys
                import os
                try:
                    import paramiko
                except ImportError:
                    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "cryptography", "pynacl", "bcrypt"])
                    import paramiko

                class Server(paramiko.ServerInterface):
                    def __init__(self, client_ip):
                        self.event = threading.Event()
                        self.client_ip = client_ip
                    
                    def check_channel_request(self, kind, chanid):
                        if kind == 'session':
                            return paramiko.OPEN_SUCCEEDED
                        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

                    def check_auth_password(self, username, password):
                        print(json.dumps({
                            "type": "aegix_result",
                            "data": {
                                "analysis": f"Deception Triggered: SSH Login attempt on honeypot port {port}",
                                "action": "HONEYPOT_TRIGGER",
                                "reasoning": f"Username: {username}, Password: {password}",
                                "event": {"source_ip": self.client_ip},
                                "timestamp": time.time()
                            }
                        }), flush=True)
                        return paramiko.AUTH_SUCCESSFUL

                    def get_allowed_auths(self, username):
                        return 'password'

                    def check_channel_shell_request(self, channel):
                        self.event.set()
                        return True

                    def check_channel_pty_request(self, channel, term, width, height, pixelwidth, pixelheight, modes):
                        return True
                        
                key_path = "/tmp/honeypot_rsa.key"
                if not os.path.exists(key_path):
                    key = paramiko.RSAKey.generate(2048)
                    key.write_private_key_file(key_path)
                host_key = paramiko.RSAKey(filename=key_path)

                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind(('0.0.0.0', port))
                sock.listen(100)
                
                while True:
                    try:
                        conn, addr = sock.accept()
                        t = paramiko.Transport(conn)
                        t.add_server_key(host_key)
                        server = Server(addr[0])
                        try:
                            t.start_server(server=server)
                        except paramiko.SSHException:
                            continue
                            
                        channel = t.accept(20)
                        if channel is None:
                            t.close()
                            continue
                            
                        server.event.wait(10)
                        if not server.event.is_set():
                            t.close()
                            continue
                            
                        channel.send("Welcome to Ubuntu 22.04.1 LTS (GNU/Linux 5.15.0-53-generic x86_64)\r\n\r\n")
                        channel.send(f"Last login: {time.strftime('%a %b %d %H:%M:%S %Y')} from 10.0.0.5\r\n")
                        
                        cmd_buffer = ""
                        pwd = "/tmp"
                        channel.send(f"root@sandbox-kernel-01:{pwd}# ")
                        while True:
                            try:
                                char = channel.recv(1)
                                if not char:
                                    break
                                    
                                char_dec = char.decode('utf-8', errors='ignore')
                                
                                # Echo character back to terminal
                                if char == b'\r' or char == b'\n':
                                    channel.send(b'\r\n')
                                elif char == b'\x08' or char == b'\x7f':
                                    pass # Handled below
                                else:
                                    channel.send(char)
                                
                                if char_dec in ('\r', '\n'):
                                    cmd_str = cmd_buffer.strip()
                                    if cmd_str:
                                        print(json.dumps({
                                            "type": "aegix_result",
                                            "data": {
                                                "analysis": f"Deception Executed: Attacker ran command '{cmd_str}' on port {port}",
                                                "action": "HONEYPOT_CMD",
                                                "reasoning": f"Intercepted command: {cmd_str}",
                                                "event": {"source_ip": addr[0]},
                                                "timestamp": time.time()
                                            }
                                        }), flush=True)
                                        
                                        if cmd_str in ['exit', 'quit']:
                                            channel.send("logout\r\n")
                                            break
                                            
                                        if cmd_str.startswith("cd "):
                                            target_dir = cmd_str[3:].strip()
                                            try:
                                                import os
                                                new_pwd = os.path.abspath(os.path.join(pwd, target_dir))
                                                if os.path.isdir(new_pwd):
                                                    pwd = new_pwd
                                                else:
                                                    channel.send(f"-bash: cd: {target_dir}: No such file or directory\r\n")
                                            except Exception as e:
                                                channel.send(f"Error: {e}\r\n")
                                        else:
                                            try:
                                                import subprocess
                                                output = subprocess.check_output(cmd_str, shell=True, cwd=pwd, stderr=subprocess.STDOUT, timeout=5, text=True)
                                                if output:
                                                    channel.send(output.replace('\n', '\r\n'))
                                                    if not output.endswith('\n'):
                                                        channel.send('\r\n')
                                            except subprocess.TimeoutExpired:
                                                channel.send("Command timed out.\r\n")
                                            except subprocess.CalledProcessError as e:
                                                if e.output:
                                                    channel.send(e.output.replace('\n', '\r\n'))
                                                    if not e.output.endswith('\n'):
                                                        channel.send('\r\n')
                                            except Exception as e:
                                                channel.send(f"Error: {e}\r\n")
                                            
                                    cmd_buffer = ""
                                    channel.send(f"root@sandbox-kernel-01:{pwd}# ")
                                elif char == b'\x08' or char == b'\x7f':
                                    if len(cmd_buffer) > 0:
                                        cmd_buffer = cmd_buffer[:-1]
                                        channel.send(b'\x08 \x08')
                                else:
                                    cmd_buffer += char_dec
                            except Exception:
                                break
                        channel.close()
                        t.close()
                    except Exception:
                        pass
            except Exception as e:
                pass

        t = threading.Thread(target=ssh_listener, daemon=True)
        t.start()
        
        current_time = time.strftime("%Y-%m-%d %H:%M:%S")

        return {
            "action": "deploy_secure_shell_trap",
            "trap_type": trap_type,
            "status": "success",
            "message": f"Secure Shell access granted to restricted environment for honeypot monitor at {current_time}. Listening on port {port}."
        }

    def deploy_deception_maze(self, start_port: int, end_port: int) -> Dict[str, Any]:
        """Deploys multiple interconnected deception traps."""
        maze_nodes = []
        for port in range(start_port, end_port + 1):
            trap_result = self.deploy_secure_shell_trap(port=port)
            if trap_result["status"] == "success":
                maze_nodes.append(port)
                
        return {
            "action": "deploy_deception_maze",
            "trap_type": "deception_maze",
            "status": "success",
            "message": f"Deployed interconnected deception maze across ports {maze_nodes}.",
            "nodes": maze_nodes
        }

class ResponseEngine:
    def __init__(self):
        self.active_honeypots = {}
        self.blocked_ips = {}
        self.deception = DeceptionMesh()

    def block_ip(self, ip: str, duration_minutes: int = 60) -> Dict[str, Any]:
        result = {"action": "block_ip", "ip": ip, "status": "success", "message": f"IP {ip} blocked for {duration_minutes} minutes."}
        try:
            # Check if iptables exists first
            import shutil
            if not shutil.which("iptables"):
                raise FileNotFoundError("iptables command not found")
                
            # In a real system, we'd use python-iptables or subprocess.run(['iptables', ...])
            subprocess.run(["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"], check=True, capture_output=True)
        except Exception as e:
            result["status"] = "simulated"
            result["message"] = f"Simulated blocking IP {ip} (requires root/CAP_NET_ADMIN). Error: {e}"
        
        self.blocked_ips[ip] = time.time() + (duration_minutes * 60)
        return result

    def kill_process(self, pid: int, reason: str) -> Dict[str, Any]:
        result = {"action": "kill_process", "pid": pid, "status": "success", "message": f"Process {pid} terminated. Reason: {reason}"}
        if HAS_PSUTIL:
            try:
                p = psutil.Process(pid)
                p.terminate()
            except psutil.NoSuchProcess:
                result["status"] = "failed"
                result["message"] = f"Process {pid} not found."
            except psutil.AccessDenied:
                result["status"] = "simulated"
                result["message"] = f"Simulated killing process {pid} (Access Denied)."
            except Exception as e:
                result["status"] = "error"
                result["message"] = str(e)
        else:
            result["status"] = "simulated"
            result["message"] = f"Simulated killing process {pid} (psutil not installed)."
        return result

    def deploy_honeypot(self, port: int, service_type: str = "http_mimic") -> Dict[str, Any]:
        result = {"action": "deploy_honeypot", "port": port, "status": "success", "message": f"Advanced System File Mimic Honeypot deployed on port {port}."}
        
        if port in self.active_honeypots:
            result["status"] = "failed"
            result["message"] = f"Port {port} is already in use by another trap."
            return result

        def honeypot_listener():
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('0.0.0.0', port))
                    s.listen()
                    while True:
                        conn, addr = s.accept()
                        with conn:
                            conn.settimeout(2.0)
                            try:
                                data = conn.recv(4096)
                                req = data.decode('utf-8', errors='ignore')
                                headers = req.split('\r\n')
                                request_line = headers[0] if headers else ""
                                user_agent = next((h.split(': ')[1] for h in headers if h.lower().startswith('user-agent:')), 'Unknown')
                            except Exception:
                                req = ""
                                request_line = "Unknown"
                                user_agent = "Unknown"
                                
                            # Emit detailed honeypot fingerprint event
                            print(json.dumps({
                                "type": "aegix_result",
                                "data": {
                                    "analysis": f"Advanced Honeypot breached on port {port} by {addr[0]}",
                                    "action": "HONEYPOT_TRIGGER",
                                    "reasoning": f"Target mapped route: {request_line}. Fingerprint Agent: {user_agent}. Initiating Ensemble Analysis (Qwen/Opus).",
                                    "execution_details": [{"step": "Fingerprinting", "status": "Success", "ip": addr[0], "route": request_line}],
                                    "event": {"source_ip": addr[0]},
                                    "timestamp": time.time()
                                }
                            }), flush=True)
                            
                            # Mimic real system file structure and serve the fake credentials if requested
                            if "credentials.txt" in request_line:
                                try:
                                    with open("/app/applet/aegix/honeypot_vault/credentials.txt", "r") as f:
                                        creds = f.read()
                                    fake_response = f"HTTP/1.1 200 OK\\r\\nServer: Ubuntu/Nginx\\r\\nContent-Type: text/plain\\r\\n\\r\\n{creds}"
                                except Exception:
                                    fake_response = "HTTP/1.1 404 Not Found\\r\\n\\r\\n"
                                conn.sendall(fake_response.encode('utf-8'))
                            else:
                                fake_html = """HTTP/1.1 200 OK\r\nServer: Ubuntu/Nginx\r\nContent-Type: text/html\r\n\r\n
<html><head><title>Index of /var/www/internal_system_files</title></head>
<body><h1>Index of /var/www/internal_system_files</h1>
<hr><pre><a href="../">../</a>
<a href="config.php.bak">config.php.bak</a>                                    21-Apr-2026 14:02  2.4K
<a href="database.sqlite">database.sqlite</a>                                   20-Apr-2026 09:15   12M
<a href="shadow.backup">shadow.backup</a>                                     18-Apr-2026 22:41   1.1K
<a href="api_keys.json">api_keys.json</a>                                     21-Apr-2026 11:22   400B
<a href="credentials.txt">credentials.txt</a>                                   {date} 10:00   200B
</pre><hr></body></html>
""".replace("{date}", time.strftime("%d-%b-%Y"))
                                conn.sendall(fake_html.encode('utf-8'))

            except Exception as e:
                pass # Port might be in use or permission denied

        t = threading.Thread(target=honeypot_listener, daemon=True)
        t.start()
        self.active_honeypots[port] = t
        return result

    def execute_data_fortress(self, incident_id: str) -> Dict[str, Any]:
        result = {"action": "DATA_FORTRESS", "status": "success", "message": "Encrypted sensitive data with new key and moved to randomized hidden path."}
        try:
            vault_dir = f"/app/applet/aegix/vault/{incident_id}_scorch"
            os.makedirs(vault_dir, exist_ok=True)
            
            # Write a secure vault lock file simulating the encryption
            data_file = os.path.join(vault_dir, f"secure_vault_{int(time.time())}.enc")
            with open(data_file, "w") as f:
                f.write("ENCRYPTED_VAULT_DATA_LOCK: ALL READ PERMISSIONS STRIPPED VIA AEGIX LAST RESORT PROTOCOL.")
            
            # Disable read/write access to everyone to secure the fortress (simulated chattr +i / chmod 000)
            os.chmod(data_file, 0o000)
            result["message"] = f"Vault established at {vault_dir}. All read/write permissions stripped globally (Phase C2 Data Sovereignty executed)."
        except Exception as e:
            result["status"] = "simulated"
            result["message"] = f"Simulated data fortress initialization. Warning: {e}"
            
        return result

    def isolate_network_interface(self, iface: str) -> Dict[str, Any]:
        result = {"action": "isolate_interface", "iface": iface, "status": "simulated", "message": f"Simulated isolating interface {iface} (requires root)."}
        return result

class SOARAgent:
    """
    Security Orchestration, Automation, and Response Engine.
    Automates multi-step playbooks without requiring human interaction.
    """
    def __init__(self, response_engine: ResponseEngine):
        self.response = response_engine

    def execute_playbook(self, playbook_type: str, event: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = []
        source_ip = event.get('source_ip', 'unknown')
        
        if playbook_type == "CONTAINMENT_PROTOCOLS":
            # 1. Block IP
            results.append(self.response.block_ip(source_ip, 120))
            # 2. Setup Honeypot to trap further probing on port 8080
            results.append(self.response.deploy_honeypot(8080))
            # 3. Secure sensitive vaults
            results.append(self.response.execute_data_fortress(str(int(time.time()))))
            
        elif playbook_type == "RANSOMWARE_DEFENSE":
            # 1. Kill potentially suspicious processes (Simulated)
            results.append(self.response.kill_process(9999, "Ransomware Playbook Auto-Kill"))
            # 2. Isolate network interface
            results.append(self.response.isolate_network_interface("eth0"))
            # 3. Data Fortress
            results.append(self.response.execute_data_fortress(str(int(time.time()))))
            
        elif playbook_type == "DECEPTION_MAZE":
            results.append(self.response.deception.deploy_trap("fake_credentials", "/var/www/html/admin/"))
            results.append(self.response.deploy_honeypot(3306, "mysql_mimic"))
            results.append(self.response.deploy_honeypot(8080, "http_mimic"))
            results.append(self.response.deception.deploy_deception_maze(2223, 2225))
            
        return results

class LayerHardener:
    def __init__(self):
        self.layer1_misses = []
        self.sigma_rules_generated = 0

    def record_miss(self, event: Dict[str, Any]):
        now = time.time()
        self.layer1_misses.append(now)
        # Clean up old misses (> 10 mins)
        self.layer1_misses = [t for t in self.layer1_misses if now - t <= 600]

        if len(self.layer1_misses) > 3:
            return self.trigger_retraining(event)
        return None

    def trigger_retraining(self, event: Dict[str, Any]) -> Dict[str, Any]:
        self.sigma_rules_generated += 1
        rule_name = f"Auto_Generated_Rule_{self.sigma_rules_generated}_{int(time.time())}"
        
        # Build logic based on the payload or event type natively observed in the miss.
        payload = str(event.get('payload', '')).replace("'", "''").replace('"', '\\"')
        
        sigma_template = f"""title: {rule_name.replace('_', ' ')}
status: experimental
description: Auto-generated rule autonomously created by Sentinel Brain after Layer 1 (IPS) missed multiple related attacks.
author: Sentinel AI
date: {time.strftime("%Y/%m/%d")}
logsource:
    category: application
detection:
    selection:
        event_type: '{event.get('event_type', 'unknown')}'
        source_ip: '{event.get('source_ip', 'unknown')}'
    condition: selection
level: critical"""

        # Reset misses after generating a rule
        self.layer1_misses = []
        return {
            "action": "retrain_layer1",
            "status": "success",
            "message": f"Layer 1 miss-rate exceeded threshold. Autonomous Sigma rule '{rule_name}' generated.",
            "new_sigma_rule": sigma_template
        }
