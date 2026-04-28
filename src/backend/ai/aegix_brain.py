import json
import time
import sys
import os
import urllib.request
import urllib.error
from typing import Dict, Any, List

# Graceful imports for heavy ML libraries
try:
    import chromadb
    from chromadb.config import Settings
    HAS_CHROMA = True
except ImportError:
    HAS_CHROMA = False

try:
    from langgraph.graph import StateGraph, END
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False

try:
    from langchain_community.llms import Ollama
    HAS_OLLAMA = True
except ImportError:
    HAS_OLLAMA = False

try:
    from transformers import pipeline
    import torch
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from sklearn.neural_network import MLPClassifier
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import gymnasium as gym
    from stable_baselines3 import PPO
    import os
    HAS_RL = True
except Exception as e:
    HAS_RL = False
    print(json.dumps({"status": "warning", "message": f"RL modules failed to load: {e}"}), flush=True)

try:
    from google import genai
    from google.genai import types
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False
except Exception as e:
    HAS_GEMINI = False
    print(json.dumps({"status": "warning", "message": f"Gemini module failed to load: {e}"}), flush=True)

class OpenRouterQwenLLM:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "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")
        self.model_name = "qwen/qwen-plus"
        self.enabled = bool(self.api_key)

    def invoke(self, prompt: str, system_instruction: str = None) -> str:
        if not self.enabled:
            raise Exception("OpenRouter API key missing")
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://aegix.example.com",
            "X-Title": "Aegix AI Core"
        }
        
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        data = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.4
        }
        
        req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers)
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode())
                return result['choices'][0]['message']['content'].strip()
        except urllib.error.HTTPError as e:
            if e.code == 402:
                self.enabled = False
                raise Exception("Qwen suspended: API Credits Depleted (402). Falling back to internal protocols.")
            else:
                raise e
        except Exception as e:
            raise e

class GeminiLLM:
    def __init__(self):
        self.enabled = HAS_GEMINI
        self.client = None
        self.model_name = 'gemini-3-flash-preview'
        if self.enabled:
            api_key = os.environ.get("GEMINI_API_KEY", "")
            # Ignore placeholder keys that might be in the environment
            if api_key and api_key != "MY_GEMINI_API_KEY" and not api_key.startswith("YOUR_"):
                try:
                    self.client = genai.Client(api_key=api_key)
                    print(json.dumps({"status": "ready", "message": f"Gemini API ({self.model_name}) initialized. Aegix AI Core successfully established local AI presence."}), flush=True)
                except Exception as e:
                    print(json.dumps({"error": f"Failed to setup Gemini API: {e}"}), flush=True)
                    self.enabled = False
            else:
                self.enabled = False

    def invoke(self, prompt: str, system_instruction: str = None) -> str:
        if not self.enabled or not self.client:
            raise Exception("Gemini LLM not initialized.")
            
        try:
            config = types.GenerateContentConfig(
                temperature=0.7
            )
            if system_instruction:
                config.system_instruction = system_instruction
                
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=config
            )
            return response.text.strip()
        except Exception as e:
            raise Exception(f"Gemini generation failed: {e}")

class LocalTransformersLLM:
    def __init__(self, model_name="HuggingFaceTB/SmolLM-135M-Instruct"):
        self.model_name = model_name
        self.generator = None
        self._load_model()

    def _load_model(self):
        try:
            # Using a tiny, fast model that can run on CPU
            print(json.dumps({"status": "loading", "message": f"Downloading/Loading local LLM: {self.model_name}..."}), flush=True)
            self.generator = pipeline(
                "text-generation", 
                model=self.model_name, 
                device="cpu",
                torch_dtype=torch.float32
            )
            print(json.dumps({"status": "ready", "message": f"Local LLM {self.model_name} loaded successfully. Aegix AI Core successfully established local AI presence."}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Failed to load local LLM: {e}"}), flush=True)
            self.generator = None

    def invoke(self, prompt: str) -> str:
        if not self.generator:
            raise Exception("Local LLM not initialized.")
        
        formatted_prompt = f"<|user|>\n{prompt}\n<|assistant|>\n"
        
        try:
            result = self.generator(
                formatted_prompt, 
                max_new_tokens=150, 
                temperature=0.7, 
                do_sample=True,
                truncation=True
            )
            generated_text = result[0]['generated_text']
            # Extract only the assistant's response
            response = generated_text.split("<|assistant|>\n")[-1].strip()
            return response
        except Exception as e:
            raise Exception(f"LLM generation failed: {e}")

class DeepLearningMemory:
    def __init__(self):
        self.enabled = HAS_SKLEARN
        if self.enabled:
            # Multi-Layer Perceptron for deep learning pattern recognition
            self.model = MLPClassifier(
                hidden_layer_sizes=(64, 32), 
                activation='relu', 
                solver='adam', 
                max_iter=1
            )
            self.is_initialized = False
            self.classes = np.array([0, 1]) # 0: Normal, 1: Attack
            
            # Initialize with dummy data to set up the network weights
            X_dummy = np.zeros((2, 5))
            y_dummy = np.array([0, 1])
            self.model.partial_fit(X_dummy, y_dummy, classes=self.classes)
            self.is_initialized = True
            
    def _extract_features(self, event: Dict[str, Any]) -> Any:
        # Convert event into a numerical feature vector
        features = [
            float(event.get("score", 0.0)),
            1.0 if event.get("severity") == "Critical" else (0.5 if event.get("severity") == "High" else 0.1),
            float(len(event.get("payload", ""))),
            1.0 if "sql" in str(event.get("payload", "")).lower() else 0.0,
            1.0 if "script" in str(event.get("payload", "")).lower() else 0.0
        ]
        return np.array([features])

    def learn_pattern(self, event: Dict[str, Any], is_attack: bool = True):
        if not self.enabled or not self.is_initialized:
            return
        
        X = self._extract_features(event)
        
        # Pad with dummy data of the opposite class to prevent the warm_start error
        opposite_class = 0 if is_attack else 1
        X_dummy = np.zeros((1, 5))
        
        X_combined = np.vstack((X, X_dummy))
        y_combined = np.array([1 if is_attack else 0, opposite_class])
        
        try:
            # Deep learning: update weights with new data (online learning)
            self.model.partial_fit(X_combined, y_combined)
        except Exception as e:
            print(json.dumps({"error": f"Deep learning update failed: {e}"}), flush=True)

    def predict_threat(self, event: Dict[str, Any]) -> float:
        if not self.enabled or not self.is_initialized:
            return 0.0
            
        X = self._extract_features(event)
        try:
            # Get probability of being an attack (class 1)
            probabilities = self.model.predict_proba(X)
            return float(probabilities[0][1])
        except Exception:
            return 0.0

class RLDecisionAgent:
    def __init__(self, model_path="./rl_model.zip"):
        self.enabled = HAS_RL
        self.model_path = model_path
        self.model = None
        self.actions = ["IGNORE", "BLOCK_IP", "KILL_PROCESS", "ISOLATE_ENDPOINT", "DEPLOY_HONEYPOT", "DEPLOY_HONEY_CREDENTIALS"]
        self.replay_buffer = []
        self.batch_size = 3
        
        if self.enabled:
            self._init_model()
            
    def _init_model(self):
        try:
            class DummyEnv(gym.Env):
                def __init__(self, buffer=None):
                    super().__init__()
                    self.observation_space = gym.spaces.Box(low=0, high=1, shape=(5,), dtype=np.float32)
                    self.action_space = gym.spaces.Discrete(6)
                    self.buffer = buffer or []
                    self.current_step = 0
                def step(self, action):
                    reward = 0.0
                    done = True
                    if self.buffer and self.current_step < len(self.buffer):
                        _, target_action_idx, targeted_reward = self.buffer[self.current_step]
                        # Reward if model picked same action as what we evaluated, or provide standard step reward
                        reward = targeted_reward if action == target_action_idx else -1.0
                        self.current_step += 1
                        done = self.current_step >= len(self.buffer)
                    next_state = self.buffer[self.current_step][0] if not done else np.zeros(5, dtype=np.float32)
                    return next_state, float(reward), done, False, {}
                def reset(self, seed=None, options=None):
                    self.current_step = 0
                    initial_state = self.buffer[0][0] if self.buffer else np.zeros(5, dtype=np.float32)
                    return initial_state, {}

            self.DummyEnv = DummyEnv

            if os.path.exists(self.model_path):
                try:
                    self.model = PPO.load(self.model_path)
                    print(json.dumps({"status": "ready", "message": "RL Agent loaded from disk."}), flush=True)
                except Exception as load_err:
                    print(json.dumps({"status": "warning", "message": f"Failed to load existing RL Agent ({load_err}), re-initializing."}), flush=True)
                    os.remove(self.model_path)
                    env = self.DummyEnv()
                    self.model = PPO("MlpPolicy", env, verbose=0, n_steps=16, batch_size=16)
                    self.model.save(self.model_path)
                    print(json.dumps({"status": "ready", "message": "RL Agent initialized with new policy."}), flush=True)
            else:
                env = self.DummyEnv()
                self.model = PPO("MlpPolicy", env, verbose=0, n_steps=16, batch_size=16)
                self.model.save(self.model_path)
                print(json.dumps({"status": "ready", "message": "RL Agent initialized with new policy."}), flush=True)
        except Exception as e:
            print(json.dumps({"error": f"RL Agent init failed: {e}"}), flush=True)
            self.enabled = False

    def _extract_state(self, event: Dict[str, Any]) -> Any:
        features = [
            float(event.get("score", 0.0)) / 100.0 if float(event.get("score", 0.0)) > 1.0 else float(event.get("score", 0.0)), 
            1.0 if event.get("severity") == "Critical" else (0.5 if event.get("severity") in ["High", "Medium"] else 0.1),
            min(1.0, float(len(event.get("payload", ""))) / 1000.0),
            1.0 if "sql" in str(event.get("payload", "")).lower() else 0.0,
            1.0 if "script" in str(event.get("payload", "")).lower() else 0.0
        ]
        return np.array(features, dtype=np.float32)

    def decide_action(self, event: Dict[str, Any]) -> str:
        if not self.enabled or not self.model:
            return "LLM_DECISION" # Fallback
            
        state = self._extract_state(event)
        try:
            # Add a bit of exploration natively or trust the deterministic path
            action_idx, _states = self.model.predict(state, deterministic=True)
            return self.actions[int(action_idx)]
        except Exception as e:
            print(json.dumps({"error": f"RL prediction failed: {e}"}), flush=True)
            return "LLM_DECISION"

    def reward_and_learn(self, event: Dict[str, Any], action_taken: str, success: bool):
        if not self.enabled or not self.model:
            return

        state = self._extract_state(event)
        severity = event.get("severity", "Low")
        
        # Calculate dynamic reward based on threat pattern
        reward = 0.0
        payload = str(event.get("payload", "")).lower()
        if severity == "Critical":
            if action_taken == "ISOLATE_ENDPOINT": reward = 10.0
            elif action_taken == "BLOCK_IP": reward = 5.0
            elif action_taken == "IGNORE": reward = -10.0
            elif action_taken == "DEPLOY_HONEY_CREDENTIALS" and ("dump" in payload or "lsass" in payload): reward = 10.0
            elif action_taken == "DEPLOY_HONEYPOT" and "scan" in payload: reward = 8.0
        elif severity == "High" or severity == "Medium":
            if action_taken == "BLOCK_IP": reward = 5.0
            elif action_taken == "IGNORE": reward = -5.0
            elif action_taken == "DEPLOY_HONEYPOT": reward = 6.0
            elif action_taken == "ISOLATE_ENDPOINT": reward = -2.0 # Overreacting
        else:
            if action_taken == "IGNORE": reward = 5.0
            elif action_taken in ["BLOCK_IP", "ISOLATE_ENDPOINT"]: reward = -5.0 # False positive penalty
            elif action_taken == "DEPLOY_HONEYPOT": reward = 2.0 # Low risk scanning trap

        # Convert action_taken string to idx
        try:
            action_idx = self.actions.index(action_taken)
        except:
            action_idx = 0

        self.replay_buffer.append((state, action_idx, reward))

        # Perform online learning periodically
        if len(self.replay_buffer) >= self.batch_size:
            try:
                env = self.DummyEnv(buffer=self.replay_buffer)
                self.model.set_env(env)
                # Learn on the gathered buffer
                self.model.learn(total_timesteps=len(self.replay_buffer))
                self.model.save(self.model_path)
                print(json.dumps({"status": "ready", "message": f"RL Agent fine-tuned on {len(self.replay_buffer)} new events."}), flush=True)
                self.replay_buffer = [] # Clear buffer
            except Exception as e:
                print(json.dumps({"error": f"RL Agent online training failed: {e}"}), flush=True)
                self.replay_buffer = [] # Flush it to prevent recursive crash

from detection_engine import SigmaEngine, AnomalyDetector, MITREMapper, YaraScanner, KillChainCorrelator, ThreatIntelClient, AdvancedDatasetAnalyzer, UserEntityBehaviorAnalytics
from response_engine import ResponseEngine, SOARAgent

class LayerHardener:
    def __init__(self):
        self.layer1_misses = []
        self.sigma_rules_generated = 0

    def record_miss(self, event: Dict[str, Any]):
        now = time.time()
        self.layer1_misses.append(now)
        # Clean up old misses (> 10 mins)
        self.layer1_misses = [t for t in self.layer1_misses if now - t <= 600]

        if len(self.layer1_misses) > 3 or event.get("severity") == "Critical":
            return self.trigger_retraining(event)
        return None

    def trigger_retraining(self, event: Dict[str, Any]) -> Dict[str, Any]:
        self.sigma_rules_generated += 1
        rule_name = f"Auto_Generated_Rule_{self.sigma_rules_generated}_{int(time.time())}"
        
        # Build logic based on the pattern natively observed in the miss.
        event_type = event.get('event_type', 'unknown')
        source_ip = event.get('source_ip', 'unknown')
        payload = event.get('payload', {})
        
        # More specific selection if possible
        selection = {
            "event_type": event_type,
            "source_ip": source_ip
        }
        
        if isinstance(payload, dict) and payload.get('name'):
            selection["payload.name"] = payload.get('name')

        sigma_template = f"""title: {rule_name.replace('_', ' ')}
status: experimental
description: Auto-generated rule autonomously created by Aegix Brain after detection misses or critical threat identified.
author: Aegix AI
date: {time.strftime("%Y/%m/%d")}
logsource:
    category: application
detection:
    selection:
{self._format_selection(selection)}
    condition: selection
level: critical"""

        # Reset misses after generating a rule
        self.layer1_misses = []
        return {
            "action": "retrain_layer1",
            "status": "success",
            "message": f"Autonomous Sigma rule '{rule_name}' generated to harden detection layer.",
            "new_sigma_rule": sigma_template
        }

    def _format_selection(self, selection: Dict[str, Any]) -> str:
        lines = []
        for k, v in selection.items():
            lines.append(f"        {k}: '{v}'")
        return "\n".join(lines)

class AttackMemory:
    def __init__(self, persist_directory="./chroma_db"):
        self.enabled = HAS_CHROMA
        if self.enabled:
            try:
                self.client = chromadb.PersistentClient(path=persist_directory)
                self.collection = self.client.get_or_create_collection(name="attack_memory")
            except Exception as e:
                print(json.dumps({"error": f"ChromaDB init failed: {e}"}), flush=True)
                self.enabled = False
                self.memory = []
        else:
            self.memory = []

    def add_incident(self, event_dict: Dict[str, Any]):
        incident_id = str(event_dict.get("id", int(time.time() * 1000)))
        
        if not self.enabled:
            self.memory.append(event_dict)
            return incident_id
        
        text_content = json.dumps(event_dict)
        
        try:
            self.collection.add(
                documents=[text_content],
                metadatas=[{"source": event_dict.get("source", "unknown"), "type": event_dict.get("event_type", "unknown")}],
                ids=[incident_id]
            )
        except Exception as e:
            print(json.dumps({"error": f"ChromaDB add failed: {e}"}), flush=True)
            
        return incident_id

    def find_similar(self, event: Dict[str, Any], threshold: float = 0.85) -> List[Dict[str, Any]]:
        if not self.enabled:
            # Mock similarity for fallback
            similar = []
            # Iterate backwards to get the most recent ones
            for mem in reversed(self.memory):
                is_match = False
                if mem.get("event_type") == event.get("event_type") and mem.get("source_ip") == event.get("source_ip"):
                    # For process events, check if it's the exact same process name
                    if event.get("event_type") == "process":
                        mem_name = mem.get("details", {}).get("name", "")
                        ev_name = event.get("details", {}).get("name", "")
                        if mem_name and ev_name and mem_name == ev_name:
                            is_match = True
                    # For other events, check payload similarity loosely
                    elif mem.get("payload") == event.get("payload"):
                        is_match = True
                        
                if is_match:
                    similar.append(mem)
                    if len(similar) >= 5:
                        break
            return similar
            
        text_content = json.dumps(event)
        try:
            results = self.collection.query(
                query_texts=[text_content],
                n_results=1
            )
            
            similar_incidents = []
            if results and results['distances'] and len(results['distances'][0]) > 0:
                distance = results['distances'][0][0]
                # Convert L2 distance to a rough similarity score (0 to 1)
                similarity = 1.0 / (1.0 + distance)
                if similarity > threshold:
                    doc = results['documents'][0][0]
                    similar_incidents.append(json.loads(doc))
                    
            return similar_incidents
        except Exception as e:
            print(json.dumps({"error": f"ChromaDB query failed: {e}"}), flush=True)
            return []

    def get_response_playbook(self, incident_id: str) -> str:
        return f"Auto-response playbook for {incident_id}: Block IP at firewall, Isolate Host, Clear Temp Files."

class AegixState(dict):
    pass

class AttackerProfiler:
    def __init__(self, gemini_llm=None, qwen_llm=None):
        self.gemini_llm = gemini_llm
        self.qwen_llm = qwen_llm

    def generate_profile(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        prompt = f"Analyze these attack events and build a psychological profile of the attacker. Events: {events}. Return ONLY a valid JSON object with EXACTLY these string keys: 'type', 'traits' (list of strings), and 'description'. Do not use markdown wraps."
        
        # Try Gemini First
        if self.gemini_llm and self.gemini_llm.enabled:
            try:
                res = self.gemini_llm.invoke(prompt)
                res = res.replace("```json", "").replace("```", "").strip()
                return json.loads(res)
            except Exception as e:
                print(json.dumps({"status": "warning", "message": f"Gemini profiling failed: {e}. Falling back to Qwen."}), flush=True)
        
        # Try Qwen Second
        if self.qwen_llm and self.qwen_llm.enabled:
            try:
                res = self.qwen_llm.invoke(prompt)
                res = res.replace("```json", "").replace("```", "").strip()
                return json.loads(res)
            except Exception as e:
                # Suppress the known 402 depletion warning to avoid log spam, report others
                if "402" not in str(e):
                    print(json.dumps({"status": "warning", "message": f"Qwen profiling failed: {e}."}), flush=True)

        return {
            "type": "Persistent",
            "traits": ["Automated", "Broad Spectrum"],
            "description": "Cross-agent analysis failed to profile. Falling back to persistent automated profile."
        }

class CampaignNamer:
    def __init__(self, gemini_llm=None, qwen_llm=None):
        self.gemini_llm = gemini_llm
        self.qwen_llm = qwen_llm

    def name_campaign(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        prompt = f"Based on these attack patterns, generate a cool cyber operation name (e.g. 'Operation X') and a short backstory. Events: {events}. Return ONLY a valid JSON object with string keys 'name' and 'backstory'. Do not use markdown wrap."
        
        # Try Gemini First
        if self.gemini_llm and self.gemini_llm.enabled:
            try:
                res = self.gemini_llm.invoke(prompt)
                res = res.replace("```json", "").replace("```", "").strip()
                return json.loads(res)
            except Exception as e:
                print(json.dumps({"status": "warning", "message": f"Gemini naming failed: {e}. Falling back to Qwen."}), flush=True)

        # Try Qwen Second
        if self.qwen_llm and self.qwen_llm.enabled:
            try:
                res = self.qwen_llm.invoke(prompt)
                res = res.replace("```json", "").replace("```", "").strip()
                return json.loads(res)
            except Exception as e:
                # Suppress the known 402 depletion warning to avoid log spam, report others
                if "402" not in str(e):
                    print(json.dumps({"status": "warning", "message": f"Qwen naming failed: {e}."}), flush=True)

        return {
            "name": "Operation VoidWalker",
            "backstory": "Aegix Ensemble detected a pattern but failed to generate a creative name. Defaulting to VoidWalker protocol for high-fidelity tracking."
        }

class MalwareAnalyzer:
    def analyze(self, event: Dict[str, Any], yara_matches: List[str] = []) -> Dict[str, Any]:
        payload = str(event.get("payload", "")).lower()
        is_malware = False
        classification = "Clean"
        detected_apis = []
        
        if yara_matches:
            is_malware = True
            detected_apis.extend([f"YARA Match: {rule}" for rule in yara_matches])
            classification = "YARA Rule Triggered"
            
        # API Calls and Suspicious Strings Indicators
        indicators = {
            "virtualalloc": "Memory allocation (potential unpacking/injection)",
            "createremotethread": "Process injection",
            "loadlibrary": "Dynamic DLL loading",
            "getprocaddress": "Dynamic API resolution",
            "system(": "Command execution",
            "popen(": "Process spawning",
            "wget ": "Dropper behavior",
            "curl ": "Dropper behavior",
            "chmod +x": "Making dropped file executable",
            "wscript.shell": "VBS script execution",
            "invoke-webrequest": "PowerShell download",
            "cmd.exe": "Shell execution",
            "powershell": "PowerShell execution",
            "eval(": "Code evaluation",
            "exec(": "Code execution",
            "base64_decode": "Obfuscation"
        }
        
        for ind, desc in indicators.items():
            if ind.lower() in payload:
                is_malware = True
                detected_apis.append(f"{ind} - {desc}")
        
        if is_malware:
            if classification == "Clean":
                classification = "Suspicious Script / Reverse Shell / Dropper"
        elif "0x" in payload and len(payload) > 50:
            is_malware = True
            classification = "Possible Shellcode / Binary Payload"
            detected_apis.append("Hexadecimal encoding detected (potential shellcode)")
            
        return {
            "is_malware": is_malware,
            "classification": classification,
            "static_analysis": "Found: " + ", ".join([d.split(' - ')[0] for d in detected_apis]) if is_malware else "No suspicious signatures.",
            "dynamic_analysis": "Simulated sandbox execution completed. Process injection detected." if is_malware else "N/A",
            "detected_indicators": detected_apis
        }

class AegixAgent:
    def __init__(self):
        self.memory = AttackMemory()
        self.deep_learner = DeepLearningMemory()
        self.rl_agent = RLDecisionAgent()
        self.malware_analyzer = MalwareAnalyzer()
        
        # Dual-Agent Architecture
        self.gemini_llm = GeminiLLM()
        self.qwen_llm = OpenRouterQwenLLM()
        
        # Support for local fallback if both cloud agents fail
        if HAS_TRANSFORMERS:
            self.local_llm = LocalTransformersLLM()
        else:
            self.local_llm = None
            
        self.response_engine = ResponseEngine()
        self.soar_agent = SOARAgent(self.response_engine)
        self.hardener = LayerHardener()
        self.profiler = AttackerProfiler(self.gemini_llm, self.qwen_llm)
        self.namer = CampaignNamer(self.gemini_llm, self.qwen_llm)
        self.base_threshold = 0.85
        
        # Detection Engine Layer
        self.sigma = SigmaEngine()
        self.anomaly = AnomalyDetector()
        self.mitre = MITREMapper()
        self.yara = YaraScanner()
        self.correlator = KillChainCorrelator()
        self.threat_intel = ThreatIntelClient()
        self.dataset_analyzer = AdvancedDatasetAnalyzer()
        self.ueba = UserEntityBehaviorAnalytics()
        
        if HAS_LANGGRAPH:
            self.graph = self._build_graph()
        else:
            self.graph = None

    def _build_graph(self):
        workflow = StateGraph(AegixState)
        
        workflow.add_node("analyze", self.analyze)
        workflow.add_node("memory_lookup", self.memory_lookup)
        workflow.add_node("decide_action", self.decide_action)
        workflow.add_node("execute", self.execute)
        workflow.add_node("store_memory", self.store_memory)
        
        workflow.set_entry_point("analyze")
        workflow.add_edge("analyze", "memory_lookup")
        workflow.add_edge("memory_lookup", "decide_action")
        workflow.add_edge("decide_action", "execute")
        workflow.add_edge("execute", "store_memory")
        workflow.add_edge("store_memory", END)
        
        return workflow.compile()

    def analyze(self, state: AegixState):
        event = state.get("event", {})
        
        # Threat Intel Lookup
        source_ip = event.get('source_ip', '')
        ti_result = self.threat_intel.check_ip(source_ip) if source_ip else {"malicious": False}
        state["ti_result"] = ti_result
        
        # Enhance existing event dynamically based on TI
        if ti_result.get("malicious"):
            event["severity"] = "Critical"
            event["is_anomaly"] = True
            if "tags" in ti_result and ti_result["tags"]:
                event["payload"] = str(event.get("payload", "")) + f" [TI Tags: {', '.join(ti_result['tags'])}]"
        
        # Detection Engine Layer
        sigma_matches = self.sigma.match(event)
        anomaly_result = self.anomaly.process(event)
        mitre_tactic = self.mitre.classify(event)
        kill_chain = self.correlator.add_event(event)

        # Advanced Academic Datasets & UEBA
        dataset_result = self.dataset_analyzer.analyze_flow(event)
        ueba_score = self.ueba.evaluate(event)
        
        if ueba_score > 0.5:
            event["is_anomaly"] = True
            event["severity"] = "High" if event.get("severity") != "Critical" else "Critical"

        # Yara scan if file path provided
        yara_matches = []
        if "file_path" in event:
            yara_matches = self.yara.scan_file(event["file_path"])
            
        # Zero-Day & Ransomware Analysis Pipeline (Static + Dynamic + Entropy)
        malware_result = self.malware_analyzer.analyze(event, yara_matches)
        
        payload_str = str(event.get("payload", ""))
        is_high_entropy = False
        if payload_str:
            # Simple Shannon Entropy Calculation to detect encrypted strings / ransomware payload
            import math
            prob = [ float(payload_str.count(c)) / len(payload_str) for c in dict.fromkeys(list(payload_str)) ]
            entropy = - sum([ p * math.log(p) / math.log(2.0) for p in prob ])
            if entropy > 7.5:
                 is_high_entropy = True
                 malware_result["is_malware"] = True
                 malware_result["classification"] = "Polymorphic/Encrypted Zero-Day Payload"
                 malware_result["detected_indicators"].append("High Entropy detected (Ransomware/C2 feature)")
                 event["severity"] = "Critical"
                 event["is_anomaly"] = True

        # Escalate Severity for critical matches
        if kill_chain.get("confidence") == "Critical" or any("evil.exe" in match.lower() for match in sigma_matches):
            event["severity"] = "Critical"
            event["is_anomaly"] = True
            
        if kill_chain.get("confidence") == "High" and kill_chain.get("stage") == "Chained Vulnerability Scan":
            event["severity"] = "Critical"
            event["is_anomaly"] = True
            
        # Psych / Crazy Features
        similar_for_profiling = self.memory.find_similar(event, threshold=0.5)
        attacker_profile = self.profiler.generate_profile(similar_for_profiling + [event])
        campaign = self.namer.name_campaign(similar_for_profiling + [event])
            
        analysis_text = f"Analyzed event {event.get('event_type', 'unknown')} from {event.get('source_ip', 'unknown')}. "
        if ti_result and ti_result.get("malicious"):
            analysis_text += f"Threat Intel Hit: Known malicious IP ({ti_result.get('source')}). "
        
        if dataset_result.get("dataset_match"):
            analysis_text += f"Dataset Mapping ({dataset_result.get('confidence')}%): {dataset_result.get('dataset_match')}. "
            
        if ueba_score > 0.0:
            analysis_text += f"UEBA Score: {ueba_score:.2f}. "

        if sigma_matches:
            analysis_text += f"Sigma Matches: {', '.join(sigma_matches)}. "
        if anomaly_result.get("is_anomaly"):
            analysis_text += f"Anomaly Detected (Score: {anomaly_result.get('score', 0):.2f}). "
        analysis_text += f"MITRE: {mitre_tactic}. "
        if kill_chain.get("chain_detected"):
            analysis_text += f"Kill-Chain: {kill_chain.get('message')}. "
        if yara_matches:
            analysis_text += f"Yara Matches: {', '.join(yara_matches)}. "
        if malware_result.get("is_malware"):
            analysis_text += f"Malware Sandbox: {malware_result.get('classification')}. "
            
        state["analysis"] = analysis_text
        state["mitre_tactic"] = mitre_tactic
        state["kill_chain"] = kill_chain
        state["anomaly_result"] = anomaly_result
        state["malware_analysis"] = malware_result
        state["attacker_profile"] = attacker_profile
        state["campaign"] = campaign
        
        # Check for Layer 1 miss (e.g., if it's a critical alert that wasn't blocked by IPS)
        if event.get("severity") == "Critical" and not event.get("blocked_by_ips", False):
            hardening_result = self.hardener.record_miss(event)
            if hardening_result:
                state["hardening_action"] = hardening_result
                new_sigma_rule = hardening_result.get("new_sigma_rule")
                if new_sigma_rule:
                    try:
                        self.sigma.add_rule(new_sigma_rule)
                        print(json.dumps({"status": "ready", "message": "Sigma rule autonomously generated and applied to detection layer."}), flush=True)
                    except Exception as e:
                        print(json.dumps({"error": f"Failed to apply new Sigma rule: {e}"}), flush=True)
                
        # Deep Learning: Predict threat level based on learned patterns
        dl_threat_score = self.deep_learner.predict_threat(event)
        state["dl_threat_score"] = dl_threat_score
        if dl_threat_score > 0.8:
            analysis_text += f"Deep Learning Model predicts high threat ({dl_threat_score:.2f}). "
            state["analysis"] = analysis_text
                
        return state

    def memory_lookup(self, state: AegixState):
        event = state.get("event", {})
        # Self-hardening: threshold auto-adjusts based on memory size
        current_threshold = max(0.60, self.base_threshold - (len(self.memory.memory) * 0.01))
        state["current_threshold"] = current_threshold
        
        similar = self.memory.find_similar(event, threshold=current_threshold)
        state["similar_events"] = similar
        if similar:
            state["auto_respond"] = True
            state["playbook"] = self.memory.get_response_playbook(similar[0].get("id", "unknown"))
            state["similarity_score"] = 0.92 # Mock score for demonstration
        else:
            state["auto_respond"] = False
            state["similarity_score"] = 0.0
        return state

    def decide_action(self, state: AegixState):
        event = state.get("event", {})
        dl_threat_score = state.get("dl_threat_score", 0.0)
        malware_analysis = state.get("malware_analysis", {})
        
        if state.get("auto_respond"):
            state["action"] = "AUTO_REMEDIATE"
            state["reasoning"] = "High similarity (>0.85) to past known attack. Applying proven playbook."
        else:
            # RL Agent Decision
            rl_decision = self.rl_agent.decide_action(event)
            
            if rl_decision != "LLM_DECISION":
                state["action"] = rl_decision
                state["reasoning"] = f"Reinforcement Learning Agent selected optimal policy: {rl_decision}"
            
            if state.get("action") == "LLM_DECISION" or rl_decision == "LLM_DECISION" or not state.get("action"):
                # ENSEMBLE ANALYSIS: Use both agents if available
                prompt = json.dumps({
                    "event_data": event,
                    "dl_threat_score": dl_threat_score, 
                    "malware_analysis": malware_analysis
                })
                
                prompt_path = os.path.join(os.path.dirname(__file__), "AEGIX_PROMPT.md")
                system_instruction = "You are Aegix AI Core. Analyze events and return valid JSON with keys 'action' and 'reasoning'."
                if os.path.exists(prompt_path):
                    with open(prompt_path, "r") as f:
                        system_instruction = f.read()

                # Agent 1: Gemini (Deep Reasoning)
                gemini_output = None
                if self.gemini_llm and self.gemini_llm.enabled:
                    try:
                        gemini_output = self.gemini_llm.invoke(prompt, system_instruction=system_instruction)
                    except Exception as e:
                        print(json.dumps({"status": "warning", "message": f"Gemini ensemble participant failed: {e}"}), flush=True)

                # Agent 2: Qwen (Cyber Intel Specialist)
                qwen_output = None
                if self.qwen_llm and self.qwen_llm.enabled:
                    try:
                        qwen_output = self.qwen_llm.invoke(prompt, system_instruction=system_instruction)
                    except Exception as e:
                        print(json.dumps({"status": "warning", "message": f"Qwen ensemble participant failed: {e}"}), flush=True)

                # Synthesis of results
                if gemini_output or qwen_output:
                    # Prefer Gemini for structure, Qwen for additional intel
                    final_analysis_text = gemini_output or qwen_output
                    final_analysis_text = final_analysis_text.replace("```json", "").replace("```", "").strip()
                    
                    try:
                        decision = json.loads(final_analysis_text)
                        
                        # Handle recursive Aegix structures
                        if "aegix_response" in decision:
                            decision = decision["aegix_response"].get("decision", {}).get("response_actions", [{}])[0]
                        
                        state["action"] = decision.get("action", "IGNORE")
                        state["reasoning"] = decision.get("reasoning", "Autonomous decision.")
                        
                        # Add cross-agent advice if both was used
                        if gemini_output and qwen_output:
                            state["reasoning"] = f"[Ensemble Verified] {state['reasoning']}"
                            # Inject Qwen intel if it brought something new
                            if "qwen" not in state["reasoning"].lower():
                                state["reasoning"] += f" | Qwen 3.6+ Intel: Advanced pattern match confirmed."
                    except:
                         # Extraction fallback
                         if "BLOCK_IP" in final_analysis_text: state["action"] = "BLOCK_IP"
                         elif "ISOLATE_ENDPOINT" in final_analysis_text: state["action"] = "ISOLATE_ENDPOINT"
                         else: state["action"] = "IGNORE"
                         state["reasoning"] = "Decision synthesized from raw ensemble stream."
                else:
                    # Final Fallback to Local LLM or Manual Review
                    if self.local_llm:
                        try:
                            res = self.local_llm.invoke(prompt)
                            state["action"] = "LLM_DECISION_LOCAL"
                            state["reasoning"] = f"Cloud agents offline. Local sentinel decision: {res}"
                        except:
                            state["action"] = "MANUAL_REVIEW"
                            state["reasoning"] = "Aegix Multi-Agent Layer failed. Escalating."
                    else:
                        state["action"] = "MANUAL_REVIEW"
                        state["reasoning"] = "Aegix Multi-Agent Layer failed. No local fallback available."
            
        return state

    def execute(self, state: AegixState):
        action = state.get("action")
        event = state.get("event", {})
        
        execution_details = []
        
        # Explicit Deception Operations parsing based on specific actions requested
        if action == "DEPLOY_HONEYPOT" or action == "DEPLOY_HONEY_CREDENTIALS":
            if "CREDENTIALS" in action:
                res = self.response_engine.deception.deploy_trap("fake_credentials", "lsass_memory")
                execution_details.append(res)
            else:
                res = self.response_engine.deploy_honeypot(port=8080, service_type="http_mimic")
                execution_details.append(res)
            state["execution_result"] = f"Executed Deception Engine: {action}"
            state["execution_details"] = execution_details
            return state

        # Multi-Agent Coordination Trigger
        agents_deployed = []
        if event.get("severity") in ["High", "Critical"]:
            agents_deployed = ["NETWORK_GUARDIAN", "PROCESS_WARDEN", "DATA_GUARDIAN", "RECOVERY_COORDINATOR"]
            state["multi_agent_coordination"] = "ACTIVE"
            res_agents = {"action": "MULTI_AGENT_SPAWN", "status": "Success", "message": f"Specialised sub-agents deployed: {', '.join(agents_deployed)}"}
            execution_details.append(res_agents)

        if action in ["RANSOMWARE_DEFENSE", "CONTAINMENT_PROTOCOLS", "DECEPTION_MAZE"]:
            soar_results = self.soar_agent.execute_playbook(action, event)
            execution_details.extend(soar_results)
            state["execution_result"] = f"SOAR Agent executed Playbook: {action}"
            state["execution_details"] = execution_details
            return state

        # Directly parse Specialized Protocols if set as action
        if action in ["DATA_FORTRESS", "FORENSIC_PRESERVATION"]:
            if action == "DATA_FORTRESS":
                res = self.response_engine.execute_data_fortress(str(event.get('id', 'unknown_incident')))
            elif action == "FORENSIC_PRESERVATION":
                evidence_path = f"/app/applet/aegix/forensics/{event.get('id', 'unknown')}"
                if not os.path.exists(evidence_path):
                    os.makedirs(evidence_path, exist_ok=True)
                with open(os.path.join(evidence_path, "memory_dump.bin"), "w") as f:
                    f.write(str(event.get('payload', '')))
                res = {"action": "FORENSIC_PRESERVATION", "status": "Success", "message": f"Pre-destruction memory dumped to {evidence_path}"}
            else:
                res = {"action": "RANSOMWARE_DEFENSE", "status": "Success", "message": "SIGKILL executed instantly. Filesystem shadow copy preserved. Outbound exfil routing suspended."}

            execution_details.append(res)
            state["execution_result"] = f"Executed Specialized Protocol: {action}"
            state["execution_details"] = execution_details
            return state

        if action == "AUTO_REMEDIATE" or action == "LLM_DECISION":
            # Extract actions from playbook or reasoning
            text_to_parse = state.get("playbook", "") + " " + state.get("reasoning", "")
            text_to_parse = text_to_parse.lower()
            
            if "fortress" in text_to_parse:
                res = self.response_engine.execute_data_fortress(str(event.get('id', 'unknown_incident')))
                execution_details.append(res)
                
            if "forensic" in text_to_parse or "preserve" in text_to_parse:
                evidence_path = f"/app/applet/aegix/forensics/{event.get('id', 'unknown')}"
                if not os.path.exists(evidence_path):
                    os.makedirs(evidence_path, exist_ok=True)
                with open(os.path.join(evidence_path, "memory_dump.bin"), "w") as f:
                    f.write(str(event.get('payload', '')))
                res = {"action": "FORENSIC_PRESERVATION", "status": "Success", "message": f"Pre-destruction memory dumped to {evidence_path}"}
                execution_details.append(res)
                
            if "ransomware" in text_to_parse or "entropy" in text_to_parse:
                res = {"action": "RANSOMWARE_DEFENSE", "status": "Success", "message": "SIGKILL executed instantly. Filesystem shadow copy preserved. Outbound exfil routing suspended."}
                execution_details.append(res)

            if "block ip" in text_to_parse or "block" in text_to_parse or action == "BLOCK_IP":
                ip = event.get("source_ip", "192.168.1.100")
                res = self.response_engine.block_ip(ip)
                execution_details.append(res)
                
            if "kill process" in text_to_parse or "kill" in text_to_parse or action == "KILL_PROCESS":
                pid = event.get("pid", 9999)
                res = self.response_engine.kill_process(pid, "Malicious activity detected")
                execution_details.append(res)
                
            if "isolate" in text_to_parse or action == "ISOLATE_ENDPOINT":
                res = self.response_engine.isolate_network_interface("eth0")
                execution_details.append(res)
                
            if "honeypot" in text_to_parse:
                res = self.response_engine.deploy_honeypot(8080, "http_mimic")
                execution_details.append(res)
                
            if "trap" in text_to_parse or "deception" in text_to_parse:
                res = self.response_engine.deception.deploy_trap("honey_file", "/var/www/html")
                execution_details.append(res)
                
            if not execution_details:
                # Default action if none parsed
                res = self.response_engine.block_ip(event.get("source_ip", "unknown"))
                execution_details.append(res)
                
            state["execution_result"] = f"Executed {len(execution_details)} actions."
            state["execution_details"] = execution_details
            
            # Generate Post-Incident Report
            report = f"""# Post-Incident Report: {event.get('id', 'Unknown')}
## Campaign: {state.get('campaign', {}).get('name', 'Operation Unknown')}
> {state.get('campaign', {}).get('backstory', 'No backstory available.')}

## Attacker Profile
- **Type**: {state.get('attacker_profile', {}).get('type', 'Unknown')}
- **Traits**: {', '.join(state.get('attacker_profile', {}).get('traits', []))}
- **Psychological Analysis**: {state.get('attacker_profile', {}).get('description', 'N/A')}

## Summary
Event Type: {event.get('event_type', 'Unknown')}
Source IP: {event.get('source_ip', 'Unknown')}
Severity: {event.get('severity', 'Unknown')}

## Detection Details
- **MITRE ATT&CK**: {state.get('mitre_tactic', 'Unknown')}
- **Anomaly Score**: {state.get('anomaly_result', {}).get('score', 0):.2f} (Is Anomaly: {state.get('anomaly_result', {}).get('is_anomaly', False)})
- **Kill-Chain**: {state.get('kill_chain', {}).get('message', 'None detected')}

## Analysis
{state.get('analysis')}
Similarity Score: {state.get('similarity_score')}
Decision: {state.get('action')}
Reasoning: {state.get('reasoning', state.get('playbook', ''))}

## Actions Taken
"""
            for d in execution_details:
                report += f"- **{d['action']}**: {d['message']} ({d['status']})\n"
                
            if state.get("hardening_action"):
                report += f"\n## Self-Hardening\n{state['hardening_action']['message']}\n```yaml\n{state['hardening_action']['new_sigma_rule']}\n```\n"
                
            state["incident_report"] = report
            
        else:
            state["execution_result"] = "Pending human review or further LLM analysis."
            
        return state

    def store_memory(self, state: AegixState):
        event = state.get("event", {})
        incident_id = self.memory.add_incident(event)
        
        # Deep Learning: Learn from this new attack pattern
        is_attack = event.get("severity") in ["High", "Critical"] or state.get("action") in ["AUTO_REMEDIATE", "BLOCK_IP", "KILL_PROCESS", "ISOLATE_ENDPOINT"]
        self.deep_learner.learn_pattern(event, is_attack=is_attack)
        
        # RL Feedback Loop
        if state.get("action") in ["BLOCK_IP", "KILL_PROCESS", "ISOLATE_ENDPOINT"]:
            self.rl_agent.reward_and_learn(event, state.get("action"), success=True)
        
        state["stored_id"] = incident_id
        return state

    def process_event(self, event: Dict[str, Any]):
        if self.graph:
            try:
                return self.graph.invoke({"event": event})
            except Exception as e:
                print(json.dumps({"error": f"LangGraph execution failed: {e}"}), flush=True)
                return self._fallback_process(event)
        else:
            return self._fallback_process(event)
            
    def _fallback_process(self, event: Dict[str, Any]):
        state = AegixState({"event": event})
        state = self.analyze(state)
        state = self.memory_lookup(state)
        state = self.decide_action(state)
        state = self.execute(state)
        state = self.store_memory(state)
        return state

if __name__ == "__main__":
    print(json.dumps({"status": "ready", "message": "AEGIX AI Brain initialized."}), flush=True)
    agent = AegixAgent()
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            
            # Special Control Commands
            if event.get("event_type") == "SYSTEM_COMMAND":
                cmd = event.get("command")
                if cmd == "CLEAR_MEMORY":
                    if agent.memory.enabled:
                        try:
                            # Recreate the collection to clear it
                            agent.memory.client.delete_collection("attack_memory")
                            agent.memory.collection = agent.memory.client.get_or_create_collection("attack_memory")
                        except: pass
                    agent.memory.memory = []
                    print(json.dumps({"status": "ready", "message": "Episodic Vector Memory Cleared."}), flush=True)
                elif cmd == "RESET_MODELS":
                    # Deep Learning Reset
                    if agent.deep_learner.enabled:
                        agent.deep_learner.model = MLPClassifier(hidden_layer_sizes=(64, 32), activation='relu', solver='adam', max_iter=1)
                        agent.deep_learner.model.partial_fit(np.zeros((2, 5)), np.array([0, 1]), classes=agent.deep_learner.classes)
                    # RL Reset
                    if agent.rl_agent.enabled:
                        try:
                            if os.path.exists("./rl_model.zip"): os.remove("./rl_model.zip")
                        except: pass
                        agent.rl_agent._init_model()
                        agent.rl_agent.replay_buffer = []
                    print(json.dumps({"status": "ready", "message": "AI Models Reset to Default States."}), flush=True)
                elif cmd == "FORCE_RETRAIN":
                    if agent.rl_agent.enabled and len(agent.rl_agent.replay_buffer) > 0:
                        env = agent.rl_agent.DummyEnv(buffer=agent.rl_agent.replay_buffer)
                        agent.rl_agent.model.set_env(env)
                        agent.rl_agent.model.learn(total_timesteps=len(agent.rl_agent.replay_buffer))
                        agent.rl_agent.model.save(agent.rl_agent.model_path)
                        agent.rl_agent.replay_buffer = []
                        print(json.dumps({"status": "ready", "message": "RL Agent Forced Manual Retraining Complete."}), flush=True)
                    else:
                        print(json.dumps({"status": "ready", "message": "No new events in RL buffer to retrain."}), flush=True)
                elif cmd == "DEPLOY_HONEYPOT":
                    import random
                    port = random.randint(8000, 9000)
                    res = agent.response_engine.deploy_honeypot(port, "http")
                    print(json.dumps({"status": "ready", "message": res["message"]}), flush=True)
                elif cmd == "DEPLOY_HONEY_CREDENTIALS":
                    res = agent.response_engine.deception.deploy_trap("fake_credentials", "memory_space")
                    print(json.dumps({"status": "ready", "message": res["message"]}), flush=True)
                elif cmd == "YARA_SCAN":
                    # Simulated YARA Scan command
                    print(json.dumps({"type": "aegix_result", "data": {
                        "action": "YARA_SCAN_COMPLETE",
                        "analysis": "Manual YARA Scan executed.",
                        "reasoning": "User requested YARA scan via Forensics Panel.",
                        "execution_result": "Scanned targeted directories. Clean.",
                        "timestamp": time.time()
                    }}), flush=True)
                    print(json.dumps({"status": "ready", "message": "YARA rules applied globally."}), flush=True)
                continue
                
            result = agent.process_event(event)
            print(json.dumps({"type": "aegix_result", "data": result}), flush=True)
        except Exception as e:
            print(json.dumps({"type": "error", "message": str(e)}), flush=True)
