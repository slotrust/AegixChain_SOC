import { db } from "../database.js";
import { alertService } from "./alert_service.js";
import { behavioralAiService } from "./behavioral_ai_service.js";
import { multiAgentSystem } from "./multi_agent_system.js";
import { execSync } from "child_process";
import si from 'systeminformation';

import { processCache, networkCache, cpuStatsCache, networkStatsCache } from './real_system_monitor.js';

export const systemService = {
  processData: async (data: any) => {
    const { type, details, timestamp, risk_score, flagged } = data;
    
    // MultiAgent Collector
    multiAgentSystem.collectorIngest(details, type);

    if (type === 'process') {
      // Pass to Behavioral AI logic
      await behavioralAiService.analyzeProcess(details);

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
        flagged ? 1 : 0
      );

      if (flagged || risk_score > 0.7) {
        await alertService.createAlert({
          log_id: null, // System data doesn't have a log_id in the logs table
          severity: risk_score > 0.9 ? 'Critical' : 'Medium',
          reason: `Suspicious process detected: ${details.name} (PID: ${details.pid})`,
          score: risk_score,
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

      const stmt = db.prepare(`
        INSERT INTO network_connections (local_address, remote_address, status, pid, is_suspicious)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(
        details.local_address,
        details.remote_address,
        details.status,
        details.pid,
        flagged ? 1 : 0
      );

      if (flagged || risk_score > 0.7) {
        await alertService.createAlert({
          log_id: null,
          severity: risk_score > 0.9 ? 'Critical' : 'Medium',
          reason: `Suspicious network connection: ${details.remote_address} from PID ${details.pid}`,
          score: risk_score,
          mitigations: "Block the remote IP address, investigate the process making the connection, and check for data exfiltration."
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
