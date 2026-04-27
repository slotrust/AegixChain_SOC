import { db } from '../database.js';
import { mitreService } from './mitre_service.js';

export interface NormalizedEvent {
  id?: number;
  timestamp?: string;
  source: string; // 'process', 'network', 'file', 'user'
  entity: string; // 'cmd.exe', '192.168.1.5', '/etc/shadow'
  action: string; // 'execute', 'connect', 'modify'
  metadata: string; // JSON string with specific details
  pid?: number;
}

export const correlationService = {
  // 1. Event Normalization & Ingestion
  ingestEvent: (event: NormalizedEvent) => {
    const stmt = db.prepare(`
      INSERT INTO normalized_events (source, entity, action, metadata, pid)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      event.source,
      event.entity,
      event.action,
      event.metadata,
      event.pid || null
    );
    
    return info.lastInsertRowid;
  },

  // 2. Correlation Engine Logic
  correlateEvents: () => {
    // Sliding window: Get events from the last 5 minutes (sqlite datetimes are UTC)
    const recentEvents = db.prepare(`
      SELECT * FROM normalized_events 
      WHERE timestamp >= datetime('now', '-5 minutes')
      ORDER BY timestamp ASC
    `).all();

    if (recentEvents.length < 2) return null; // Need at least 2 events to correlate

    // Group by PID or common entities to build event chains
    const chains: { [key: string]: any[] } = {};
    
    for (const event of recentEvents) {
      // Group by PID if available
      if (event.pid) {
        if (!chains[`pid_${event.pid}`]) chains[`pid_${event.pid}`] = [];
        chains[`pid_${event.pid}`].push(event);
      }
      
      // Also could group by IP or user in a more advanced implementation
    }

    const newThreats = [];

    // Analyze chains for patterns
    for (const [key, chain] of Object.entries(chains)) {
      if (chain.length < 2) continue; // Skip weak chains
      
      // Check if this chain is already a part of an open threat
      // Simplified: Just create a new threat if the pattern is risky
      
      let hasProcess = false;
      let hasNetwork = false;
      let hasFile = false;
      
      for (const event of chain) {
        if (event.source === 'process') hasProcess = true;
        if (event.source === 'network') hasNetwork = true;
        if (event.source === 'file') hasFile = true;
      }

      let riskScore = 0;
      let title = "Suspicious Sequence Detected";

      // Rule-based patterns
      if (hasProcess && hasNetwork && hasFile) {
        riskScore = 0.9;
        title = "Multi-Stage Attack Chain (Execution -> Network -> File)";
      } else if (hasProcess && hasNetwork) {
        riskScore = 0.7;
        title = "Process with Unexpected Network Activity";
      } else if (hasProcess && hasFile) {
        riskScore = 0.6;
        title = "Process with Suspicious File Modifications";
      } else if (chain.length >= 5) {
        riskScore = 0.5;
        title = "High Volume Event Sequence";
      }

      if (riskScore >= 0.6) {
        // Find MITRE tactics
        const tactics = new Set<string>();
        for (const event of chain) {
           const map = mitreService.mapToMitre({ name: event.entity, type: event.source });
           if (map) tactics.add(map.tactic);
        }

        // Create Correlated Threat
        const stmt = db.prepare(`
          INSERT INTO correlated_threats (title, risk_score, severity, mitre_tactics)
          VALUES (?, ?, ?, ?)
        `);
        
        const severity = riskScore >= 0.8 ? 'Critical' : 'High';
        const threatId = stmt.run(title, riskScore, severity, Array.from(tactics).join(', ')).lastInsertRowid;
        
        // Link events
        const linkStmt = db.prepare(`
          INSERT INTO correlated_threat_events (threat_id, event_id)
          VALUES (?, ?)
        `);
        
        for (const event of chain) {
           linkStmt.run(threatId, event.id);
        }
        
        newThreats.push({
           id: threatId,
           title,
           riskScore,
           severity,
           eventCount: chain.length,
           events: chain
        });
      }
    }
    
    return newThreats.length > 0 ? newThreats : null;
  },

  getCorrelatedThreats: (limit = 10) => {
    const threats = db.prepare(`
      SELECT * FROM correlated_threats 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit);
    
    return threats.map(t => {
      const events = db.prepare(`
        SELECT ne.* 
        FROM normalized_events ne
        JOIN correlated_threat_events cte ON ne.id = cte.event_id
        WHERE cte.threat_id = ?
        ORDER BY ne.timestamp ASC
      `).all(t.id);
      
      return {
        ...t,
        attack_chain: events
      };
    });
  },
  
  getAttackChain: (threatId: number) => {
    return db.prepare(`
      SELECT ne.* 
      FROM normalized_events ne
      JOIN correlated_threat_events cte ON ne.id = cte.event_id
      WHERE cte.threat_id = ?
      ORDER BY ne.timestamp ASC
    `).all(threatId);
  }
};
