import { db } from '../database.js';

// Simple implementation of a Q-learning like Reinforcement Learning Agent
// to decide the optimal defense policy over time.
// States: [Risk Level, Threat Type (process/network/file)]
// Actions: 'Block', 'Isolate', 'Deploy_Honeypot', 'Notify', 'Ignore'

export class RLAgent {
  private actions = ['Block', 'Isolate', 'Deploy_Honeypot', 'Notify', 'Ignore'];
  
  constructor() {
    this.initDB();
  }

  private initDB() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rl_q_table (
        state_key VARCHAR(100) PRIMARY KEY,
        q_values TEXT
      )
    `);
  }

  private getStateKey(riskLevel: string, threatType: string): string {
    return `${riskLevel}_${threatType}`;
  }

  private getQValues(stateKey: string): number[] {
    const row = db.prepare('SELECT q_values FROM rl_q_table WHERE state_key = ?').get(stateKey);
    if (!row) {
       // Initialize Q-values for new state (epsilon optimistic)
       return [0.1, 0.1, 0.1, 0.5, 0.5]; 
    }
    return JSON.parse(row.q_values);
  }

  private setQValues(stateKey: string, qValues: number[]) {
    db.prepare(`
      INSERT INTO rl_q_table (state_key, q_values) 
      VALUES (?, ?) 
      ON CONFLICT(state_key) DO UPDATE SET q_values = excluded.q_values
    `).run(stateKey, JSON.stringify(qValues));
  }

  // 1. Choose Action (Policy)
  public decideAction(riskLevel: string, threatType: string): string {
    const stateKey = this.getStateKey(riskLevel, threatType);
    const qVals = this.getQValues(stateKey);
    
    // Epsilon-greedy implementation could be added here.
    // For now, always pick max Q-value.
    let maxIdx = 0;
    let maxVal = qVals[0];
    for (let i = 1; i < qVals.length; i++) {
        if (qVals[i] > maxVal) {
            maxVal = qVals[i];
            maxIdx = i;
        }
    }
    
    return this.actions[maxIdx];
  }

  // 2. Learn (Update Q-Values based on Reward)
  public learn(riskLevel: string, threatType: string, actionTaken: string, reward: number) {
    const stateKey = this.getStateKey(riskLevel, threatType);
    let qVals = this.getQValues(stateKey);
    
    const actionIdx = this.actions.indexOf(actionTaken);
    if (actionIdx === -1) return;

    // Q-Learning Update
    const alpha = 0.1; // Learning rate
    // Simplified since we don't have next state transition defined perfectly
    qVals[actionIdx] = qVals[actionIdx] + alpha * (reward - qVals[actionIdx]);
    
    // Decay other actions slightly (normalization)
    for (let i = 0; i < qVals.length; i++) {
        if (i !== actionIdx) {
            qVals[i] = qVals[i] * 0.99;
        }
    }
    
    this.setQValues(stateKey, qVals);
  }

  public getPolicyTable() {
    return db.prepare('SELECT * FROM rl_q_table').all().map((r: any) => ({
      state: r.state_key,
      q_values: JSON.parse(r.q_values)
    }));
  }
}

export const rlAgent = new RLAgent();
