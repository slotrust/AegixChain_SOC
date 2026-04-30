import { db } from '../database.js';
import { dlAnomalyEngine } from './dl_engine.js';

export class RLAgent {
  private actions = ['Block', 'Isolate', 'Deploy_Honeypot', 'Notify', 'Ignore'];
  
  constructor() {
  }

  // 1. Choose Action via PPO
  public async decideActionAsync(riskLevel: string, threatType: string): Promise<string> {
    // Generate raw features for PPO prediction
    const riskFactor = riskLevel === 'High' ? 1.0 : (riskLevel === 'Medium' ? 0.5 : 0.0);
    const typeFactor = threatType === 'process' ? 0.3 : (threatType === 'network' ? 0.6 : 0.9);
    const features = [riskFactor, typeFactor, Math.random(), 0.5, 0.5];
    
    // We send to dlAnomalyEngine which routes to PPO stable_baselines3
    // It returns a PPO action from 0, 1, 2 (Allow/Alert/Block)
    try {
        const res = await (dlAnomalyEngine as any).sendRequest('score', { features, flagged: riskLevel === 'High' });
        
        const ppo_action = res.ppo_action || 0;
        
        switch (ppo_action) {
            case 2: return 'Block';
            case 1: return 'Notify';
            default: return 'Ignore';
        }
    } catch(e) {
        return 'Notify';
    }
  }

  // Synchronous fallback just in case
  public decideAction(riskLevel: string, threatType: string): string {
      return riskLevel === 'High' ? 'Block' : 'Notify';
  }

  // 2. Learn (Trigger PPO online learning)
  public learn(riskLevel: string, threatType: string, actionTaken: string, reward: number) {
     // Periodically triggered now inside correlation_service instead of per-event manually here
  }

  public getPolicyTable() {
    return []; // Handled inherently by the Python PPO network now
  }
}

export const rlAgent = new RLAgent();
