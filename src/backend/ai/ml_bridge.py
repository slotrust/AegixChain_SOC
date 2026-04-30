import sys
import json
import os

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.neural_network import MLPClassifier
    import gymnasium as gym
    from stable_baselines3 import PPO
    HAS_ML = True
except ImportError:
    HAS_ML = False

class DummyEnv(gym.Env):
    def __init__(self):
        super().__init__()
        self.observation_space = gym.spaces.Box(low=0.0, high=1.0, shape=(5,), dtype=np.float32)
        self.action_space = gym.spaces.Discrete(3) # 0: Allow, 1: Alert, 2: Block
        self.state = np.zeros(5, dtype=np.float32)

    def step(self, action):
        return self.state, 0.0, True, False, {}

    def reset(self, seed=None, options=None):
        return self.state, {}

class RealMLEngine:
    def __init__(self):
        self.iforest = IsolationForest(contamination=0.05, random_state=42)
        self.mlp = MLPClassifier(hidden_layer_sizes=(64, 32), activation='relu', solver='adam', max_iter=1)
        self.mlp_init = False
        self.iforest_init = False
        self.iforest_buffer = []

        if HAS_ML:
            self.env = DummyEnv()
            if os.path.exists("./ppo_engine.zip"):
                try:
                    self.ppo = PPO.load("./ppo_engine.zip", env=self.env)
                except:
                    os.remove("./ppo_engine.zip")
                    self.ppo = PPO("MlpPolicy", self.env, verbose=0)
            else:
                self.ppo = PPO("MlpPolicy", self.env, verbose=0)
        else:
            self.ppo = None

    def process_line(self, line):
        try:
            req = json.loads(line)
            cmd = req.get("cmd")
            features = req.get("features", [0,0,0,0,0])
            while len(features) < 5: features.append(0.0)
            features = features[:5]
            X = np.array([features], dtype=np.float32)

            if cmd == "train_iforest":
                data = req.get("data", [])
                if data:
                    self.iforest.fit(np.array(data, dtype=np.float32))
                    self.iforest_init = True
                print(json.dumps({"status": "ok", "msg": "iforest trained"}))

            elif cmd == "score":
                # MLP Path
                if not self.mlp_init:
                    self.mlp.partial_fit(np.array([[0,0,0,0,0], [1,1,1,1,1]]), np.array([0, 1]), classes=np.array([0,1]))
                    self.mlp_init = True

                # Real-time online training using actual system data
                risk_label = 1 if req.get("flagged") else 0
                self.mlp.partial_fit(X, np.array([risk_label]))
                
                mlp_score = self.mlp.predict_proba(X)[0][1]
                
                # IForest Path
                if not self.iforest_init:
                    self.iforest_buffer.append(features)
                    if len(self.iforest_buffer) >= 50:
                        self.iforest.fit(np.array(self.iforest_buffer, dtype=np.float32))
                        self.iforest_init = True
                    if_score = 0.5
                else:
                    # decision_function gives > 0 for normal, < 0 for anomaly. Translate to 0-1 risk score.
                    raw_if = self.iforest.decision_function(X)[0]
                    if_score = 1.0 - (1.0 / (1.0 + np.exp(-raw_if)))

                # PPO Action Prediction
                action = 0
                if self.ppo:
                    action, _ = self.ppo.predict(X[0], deterministic=True)
                    # Learn slightly on the step if needed (simulated environment update)
                    if risk_label == 1 and action == 2:
                        reward = 1.0 # properly blocked
                    elif risk_label == 1 and action != 2:
                        reward = -1.0
                    elif risk_label == 0 and action == 2:
                        reward = -1.0 # false positive block
                    else:
                        reward = 0.1 # correct allow
                    
                    # Manual short-term learning
                    pass # Full PPO learning requires collect_rollouts, we do simplistic model.predict

                print(json.dumps({
                    "mlp_score": float(mlp_score),
                    "iforest_score": float(if_score),
                    "ppo_action": int(action)
                }))

            elif cmd == "ppo_train":
                # Background PPO online learning
                if self.ppo:
                    self.ppo.learn(total_timesteps=100)
                    self.ppo.save("./ppo_engine.zip")
                print(json.dumps({"status": "ok"}))

            else:
                print(json.dumps({"error": "unknown command"}))

        except Exception as e:
            print(json.dumps({"error": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    if not HAS_ML:
        print(json.dumps({"status": "warn", "msg": "ML libraries missing, install scikit-learn stable-baselines3"}))
        sys.stdout.flush()
    engine = RealMLEngine()
    for line in sys.stdin:
        if not line.strip(): continue
        engine.process_line(line)
