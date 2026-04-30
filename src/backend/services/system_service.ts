import { db } from "../database.js";
import { alertService } from "./alert_service.js";
import { behavioralAiService } from "./behavioral_ai_service.js";
import { multiAgentSystem } from "./multi_agent_system.js";
import { dlAnomalyEngine } from "./dl_engine.js";
import { execSync } from "child_process";
import si from 'systeminformation';

import { processCache, networkCache, cpuStatsCache, networkStatsCache } from './real_system_monitor.js';

export const systemService = {
  processData: async (data: any) => {
    const { type, details, timestamp, risk_score, flagged } = data;
    
    // MultiAgent Collector
    await multiAgentSystem.collectorIngest(details, type);

    if (type === 'process') {
      // SENSOR AGENTS (Input Layer)
      // Process Agent (system behavior) -> Uses ML (Isolation Forest / MLP), NOT LLM
      const features = [
         Math.min(details.cpu_percent || 0, 100) / 100.0,
         Math.min(details.memory_usage || 0, 100) / 100.0,
         Math.min(details.name?.length || 0, 100) / 100.0,
         Math.min(details.cmdline?.length || 0, 255) / 255.0,
         details.pid > 1000 ? 1.0 : 0.0
      ];
      
      let mlRiskScore = risk_score;
      let mlFlagged = flagged;
      try {
        const iForestScore = await dlAnomalyEngine.score(features);
        if (iForestScore > 0.75) {
          mlRiskScore = Math.max(mlRiskScore, iForestScore);
          mlFlagged = true;
          console.log(`Process Agent ML detected anomaly in ${details.name}: Score ${iForestScore.toFixed(2)} using Isolation Forest`);
        }
      } catch (e) {
        console.error("ML Process Agent failed", e);
      }

      const stmt = db.prepare(`
        INSERT INTO processes (pid, name, cpu_percent, memory_usage, exe_path, cmdline, user, status, is_suspicious)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        details.pid,
        details.name,
        details.cpu_percent,
        details.memory_usage,
        details.exe_path,
        details.cmdline || '',
        details.user || 'unknown',
        details.status || 'running',
        mlFlagged ? 1 : 0
      );

      if (mlFlagged || mlRiskScore > 0.7) {
        await alertService.createAlert({
          log_id: null,
          severity: mlRiskScore > 0.9 ? 'Critical' : 'Medium',
          reason: `Suspicious process detected (Process Agent ML/Heuristic): ${details.name} (PID: ${details.pid})`,
          score: mlRiskScore,
          mitigations: "Investigate the process origin, check for unauthorized execution, and terminate if necessary."
        });
      }
    } else if (type === 'network') {
      const recent = db.prepare(`
        SELECT 1 FROM network_connections
        WHERE local_address = ? AND remote_address = ?
          AND timestamp > datetime('now', '-10 seconds')
        LIMIT 1
      `).get(details.local_address, details.remote_address);

      if (recent) {
        return;
      }

      // SENSOR AGENTS (Input Layer)
      // Network Agent (traffic anomalies) -> Uses ML (Isolation Forest / MLP), NOT LLM
      const features = [
         details.status === 'ESTABLISHED' ? 1.0 : 0.0,
         Math.min((details.remote_address?.length || 0), 20) / 20.0,
         Math.min(details.pid || 0, 10000) / 10000.0,
         Math.random(), 
         0.5
      ];
      let mlRiskScore = risk_score;
      let mlFlagged = flagged;
      try {
        const iForestScore = await dlAnomalyEngine.score(features);
        if (iForestScore > 0.8) {
          mlRiskScore = Math.max(mlRiskScore, iForestScore);
          mlFlagged = true;
          console.log(`Network Agent ML detected anomaly in connection to ${details.remote_address}: Score ${iForestScore.toFixed(2)} using Isolation Forest`);
        }
      } catch (e) {
        console.error("ML Network Agent failed", e);
      }

      const stmt = db.prepare(`
        INSERT INTO network_connections (local_address, remote_address, status, pid, is_suspicious)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(
        details.local_address,
        details.remote_address,
        details.status,
        details.pid,
        mlFlagged ? 1 : 0
      );

      if (mlFlagged || mlRiskScore > 0.7) {
        await alertService.createAlert({
          log_id: null,
          severity: mlRiskScore > 0.9 ? 'Critical' : 'Medium',
          reason: `Suspicious network connection (Network Agent ML/Heuristic): ${details.remote_address} from PID ${details.pid}`,
          score: mlRiskScore,
          mitigations: "Block the remote IP address, investigate the process making the connection, and check for data exfiltration."
        });
      }
    } else if (type === 'file') {
      // SENSOR AGENTS (Input Layer)
      // File Agent (file integrity) -> Uses ML (Isolation Forest / MLP), NOT LLM
      const ext = details.file_path?.split('.').pop()?.toLowerCase();
      const isExecutable = ['exe', 'dll', 'sh', 'bash', 'py'].includes(ext);
      const isCriticalDir = details.file_path?.includes('/etc/') || details.file_path?.includes('/bin/') || details.file_path?.includes('/sbin/');
      
      const features = [
         isExecutable ? 1.0 : 0.0,
         isCriticalDir ? 1.0 : 0.0,
         details.event_type === 'File Modified' ? 0.8 : 0.2, // Modify is riskier for critical files usually
         Math.min((details.file_path?.length || 0), 100) / 100.0,
         0.5
      ];
      
      let mlRiskScore = risk_score;
      let mlFlagged = flagged;
      try {
        const iForestScore = await dlAnomalyEngine.score(features);
        if (iForestScore > 0.8 || isCriticalDir) {
          mlRiskScore = Math.max(mlRiskScore, iForestScore, 0.85);
          mlFlagged = true;
          console.log(`File Agent ML detected anomaly in ${details.file_path}: Score ${iForestScore.toFixed(2)} using Isolation Forest`);
        }
      } catch (e) {
        console.error("ML File Agent failed", e);
      }

      if (mlFlagged || mlRiskScore > 0.7) {
        await alertService.createAlert({
          log_id: null,
          severity: mlRiskScore > 0.9 ? 'Critical' : 'Medium',
          reason: `Suspicious file operation (File Agent ML/Heuristic): ${details.event_type} on ${details.file_path}`,
          score: mlRiskScore,
          mitigations: "Investigate file origin, check process that created it, and quarantine if malicious."
        });
      }
    } else if (type === 'network_spike') {
         const recentSpanks = db.prepare(`
            SELECT 1 FROM alerts WHERE reason LIKE 'Anomalous Network Activity Spike%' AND timestamp > datetime('now', '-1 minute') LIMIT 1
         `).get();
         if (recentSpanks) return;

         await alertService.createAlert({
            log_id: null,
            severity: 'High',
            reason: `Anomalous Network Activity Spike: Upload: ${(details.tx_sec/1024/1024).toFixed(2)} MB/s, Download: ${(details.rx_sec/1024/1024).toFixed(2)} MB/s`,
            score: risk_score,
            mitigations: "Identify the top bandwidth-consuming processes using EDR or task manager. Check for potential data exfiltration or DDoS participation."
         });
    }
  },

  getProcesses: async (limit = 100) => {
    return processCache.slice(0, limit);
  },

  getNetworkConnections: async (limit = 100) => {
    return networkCache.slice(0, limit);
  },

  getCpuStats: async () => {
    return cpuStatsCache;
  },

  getNetworkStats: async () => {
    return networkStatsCache;
  }
};
