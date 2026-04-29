import { db } from "../database.js";
import { alertService } from "./alert_service.js";

// AI Studio/Gemini dependency
import { GoogleGenAI } from "@google/genai";

// Use statistical thresholding (EWMA) to find anomalies in processes and create baselines
export const behavioralAiService = {
  // A mode toggle
  isLearningMode: true,
  
  setLearningMode(val: boolean) {
    this.isLearningMode = val;
  },

  getLearningMode() {
    return this.isLearningMode;
  },

  async analyzeProcess(details: any) {
    const processName = details.name;
    const cpu = details.cpu_percent || 0;
    const mem = details.memory_usage || 0;
    const deviceId = 'local-device'; // In an agent setup this would be real id

    if (!processName) return;

    // Ignore normal developer execution and system monitoring tools perfectly well
    const ignoredProcesses = ['node', 'npm', 'sh', 'ps', 'bash', 'grep', 'cat', 'ls', 'npx', 'python', 'python3', 'vite', 'tsx', 'esbuild', 'docker', 'containerd', 'dockerd', 'tail', 'sleep', 'start.sh', 'control-plane-api', 'control-plane', 'nginx', 'awk', 'head', 'ss', 'sudo', 'systeminformation'];
    if (ignoredProcesses.some(i => processName.toLowerCase().includes(i)) || details.cmdline?.toLowerCase().includes('vite') || details.cmdline?.toLowerCase().includes('tsx')) return;

    // Fetch existing baseline
    const baseline = db.prepare(`SELECT * FROM behavioral_baselines WHERE device_id = ? AND process_name = ?`).get(deviceId, processName);

    if (this.isLearningMode) {
      if (baseline) {
        // Update EWMA (Exponentially Weighted Moving Average)
        const alpha = 0.1;
        const newAvgCpu = (alpha * cpu) + ((1 - alpha) * baseline.avg_cpu);
        
        // Variance estimation 
        const cpuDiff = cpu - newAvgCpu;
        const newStdCpu = Math.sqrt((alpha * (cpuDiff * cpuDiff)) + ((1 - alpha) * (baseline.std_cpu * baseline.std_cpu)));

        const newAvgMem = (alpha * mem) + ((1 - alpha) * baseline.avg_mem);
        const memDiff = mem - newAvgMem;
        const newStdMem = Math.sqrt((alpha * (memDiff * memDiff)) + ((1 - alpha) * (baseline.std_mem * baseline.std_mem)));

        db.prepare(`
          UPDATE behavioral_baselines 
          SET avg_cpu = ?, std_cpu = ?, avg_mem = ?, std_mem = ?, exec_count = exec_count + 1, last_seen = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newAvgCpu, newStdCpu, newAvgMem, newStdMem, baseline.id);
      } else {
        db.prepare(`
          INSERT INTO behavioral_baselines (device_id, process_name, avg_cpu, std_cpu, avg_mem, std_mem, exec_count)
          VALUES (?, ?, ?, 0.1, ?, 0.1, 1)
        `).run(deviceId, processName, cpu, mem);
      }
      // Continue to protection mode even if we just learned it
    }

    // Protection Mode
    if (!baseline) {
      // Unseen process!
      await this.flagAnomaly(deviceId, processName, details, 0.8, 'High', `Process ${processName} has never been seen on this baseline.`);
      return;
    }

    // Process exists, check deviations (Z-score)
    // Avoid division by zero
    const stdCpu = Math.max(baseline.std_cpu, 0.1);
    const zCpu = Math.abs(cpu - baseline.avg_cpu) / stdCpu;

    const stdMem = Math.max(baseline.std_mem, 0.1);
    const zMem = Math.abs(mem - baseline.avg_mem) / stdMem;

    if (zCpu > 4) { // Highly anomalous CPU usage
      await this.flagAnomaly(deviceId, processName, details, 0.7, 'Medium', `Process ${processName} CPU usage (${cpu.toFixed(1)}%) significantly deviated from baseline (Avg: ${baseline.avg_cpu.toFixed(1)}%).`);
    }

    if (zMem > 4) { // Highly anomalous Memory usage
       await this.flagAnomaly(deviceId, processName, details, 0.7, 'Medium', `Process ${processName} Memory usage (${mem.toFixed(1)}%) deviated from baseline.`);
    }

    // Additionally update baseline slowly
    const alpha = 0.01; // slower learning outside of explicit learning mode
    db.prepare(`
        UPDATE behavioral_baselines 
        SET avg_cpu = (? * ?) + ((1 - ?) * avg_cpu),
            exec_count = exec_count + 1,
            last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(alpha, cpu, alpha, baseline.id);

  },

  async flagAnomaly(deviceId: string, processName: string, processData: any, score: number, risk_level: string, explanation: string) {
    // Only alert once per some interval to avoid spam
    // Check if recent anomaly exists for this process
    const recent = db.prepare(`SELECT * FROM behavioral_anomalies WHERE process_name = ? AND timestamp > datetime('now', '-1 minute')`).get(processName);
    if (recent) return;

    // Use Gemini for explanation enrichment if requested, but for speed we do local first
    db.prepare(`
      INSERT INTO behavioral_anomalies (device_id, process_name, score, risk_level, explanation, process_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(deviceId, processName, score, risk_level, explanation, JSON.stringify(processData));

    await alertService.createAlert({
        log_id: null,
        severity: risk_level === 'High' ? 'Critical' : 'Medium',
        reason: `Behavioral Anomaly: ${explanation}`,
        score: score,
        mitigations: "Review in Behavioral AI Dashboard to confirm or dismiss."
    });
  },

  getAnomalies() {
    return db.prepare(`SELECT * FROM behavioral_anomalies ORDER BY timestamp DESC LIMIT 50`).all();
  },

  getBaselines() {
    return db.prepare(`SELECT * FROM behavioral_baselines ORDER BY exec_count DESC LIMIT 100`).all();
  },

  reviewAnomaly(id: number, action: 'dismiss' | 'confirm') {
     if (action === 'dismiss') {
        db.prepare(`UPDATE behavioral_anomalies SET is_reviewed = 1, is_false_positive = 1 WHERE id = ?`).run(id);
        // We could reintegrate false positives into baseline (or just ignore)
     } else {
        db.prepare(`UPDATE behavioral_anomalies SET is_reviewed = 1, is_false_positive = 0 WHERE id = ?`).run(id);
     }
  }
};
