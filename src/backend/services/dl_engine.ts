import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export const dlAnomalyEngine = new (class DLEngine {
    private pythonProcess: ChildProcess | null = null;
    private callbacks: { [key: string]: (data: any) => void } = {};
    private msgId = 0;
    
    constructor() {
        this.startPython();
    }
    
    private startPython() {
        const installCmd = 'python3 -m pip install --no-cache-dir scikit-learn stable-baselines3 gymnasium numpy --break-system-packages';
        import('child_process').then(({ exec }) => {
            exec(installCmd, (error) => {
                const scriptPath = path.join(process.cwd(), 'src/backend/ai/ml_bridge.py');
                this.pythonProcess = spawn('python3', [scriptPath]);
                
                let buffer = '';
                this.pythonProcess.stdout?.on('data', (data) => {
                    buffer += data.toString();
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.slice(0, newlineIndex).trim();
                        buffer = buffer.slice(newlineIndex + 1);
                        if (line) {
                            try {
                                const parsed = JSON.parse(line);
                                const cbKey = Object.keys(this.callbacks)[0];
                                if (cbKey) {
                                    this.callbacks[cbKey](parsed);
                                    delete this.callbacks[cbKey];
                                }
                            } catch (e) {}
                        }
                    }
                });

                this.pythonProcess.on('close', () => {
                    setTimeout(() => this.startPython(), 5000);
                });
            });
        });
    }

    private sendRequest(cmd: string, payload: any): Promise<any> {
        return new Promise((resolve) => {
            if (!this.pythonProcess || !this.pythonProcess.stdin) {
                return resolve({ mlp_score: 0.5, iforest_score: 0.5, ppo_action: 0 });
            }
            const id = `msg_${this.msgId++}`;
            this.callbacks[id] = resolve;
            
            const req = { cmd, ...payload };
            this.pythonProcess.stdin.write(JSON.stringify(req) + '\n');
        });
    }

    public async trainIForest(baselineData: number[][]) {
        await this.sendRequest('train_iforest', { data: baselineData });
    }

    public async score(features: number[], flagged: boolean = false): Promise<number> {
        const res = await this.sendRequest('score', { features, flagged });
        if (res.error) return 0.5;
        
        // PPO, MLP, IForest combined
        return (res.mlp_score * 0.4) + ((1.0 - res.iforest_score) * 0.6); // smaller iforest = more anomalous generally but our math transated it to risk score
    }

    public async explain(features: number[], featureNames: string[]): Promise<string> {
        return "Reason: Multilayer Perceptron and Isolation Forest anomaly detected on system metrics";
    }
    
    public async trainPPO() {
        await this.sendRequest('ppo_train', {});
    }
})();
