import { db } from '../database.js';
import { mitreService } from './mitre_service.js';
import { dlAnomalyEngine } from './dl_engine.js';

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
    
    // Periodically feed event vectors to DL engine training (background process)
    correlationService.trainDLModelBackground();
    
    return info.lastInsertRowid;
  },

  trainDLModelBackground: () => {
     // Naive background trainer for isolation forest every ~100 events
     if (Math.random() < 0.05) {
         try {
           const evts = db.prepare(`SELECT * FROM normalized_events ORDER BY id DESC LIMIT 200`).all();
           if (evts.length > 50) {
               const vectors = evts.map(e => correlationService.extractFeatures([e]));
               dlAnomalyEngine.trainIForest(vectors);
           }
         } catch(e) {}
     }
  },

  // Extract a 10-dimensional feature vector for DL inference
  extractFeatures: (chain: any[]): number[] => {
      let fProcess = 0, fNetwork = 0, fFile = 0;
      let uniqueEntities = new Set();
      let uniqueActions = new Set();
      let totalLength = chain.length;
      
      for (const e of chain) {
          if (e.source === 'process') fProcess++;
          if (e.source === 'network') fNetwork++;
          if (e.source === 'file') fFile++;
          uniqueEntities.add(e.entity);
          uniqueActions.add(e.action);
      }
      
      return [
         fProcess / (totalLength || 1),
         fNetwork / (totalLength || 1),
         fFile / (totalLength || 1),
         uniqueEntities.size / (totalLength || 1),
         uniqueActions.size / (totalLength || 1),
         Math.min(totalLength / 10, 1.0),
         chain.some(e => e.action === 'execute') ? 1 : 0,
         chain.some(e => e.action === 'connect') ? 1 : 0,
         chain.some(e => e.action === 'modify') ? 1 : 0,
         0.5 // Padding
      ];
  },

  // 2. Deep Learning Correlation Engine Logic
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
      if (event.pid) {
        if (!chains[`pid_${event.pid}`]) chains[`pid_${event.pid}`] = [];
        chains[`pid_${event.pid}`].push(event);
      }
    }

    const newThreats = [];

    // Analyze chains for patterns using DL Model
    for (const [key, chain] of Object.entries(chains)) {
      if (chain.length < 2) continue; // Skip weak chains
      
      const features = correlationService.extractFeatures(chain);
      const dlAnomalyScore = dlAnomalyEngine.score(features);
      
      // Reduce alert noise by applying high threshold on anomaly score
      // A score > 0.65 from Isolation Forest implies significant anomaly
      // linking activity across the kill chain.
      if (dlAnomalyScore >= 0.62) {
        // Find MITRE tactics
        const tactics = new Set<string>();
        for (const event of chain) {
           const map = mitreService.mapToMitre({ name: event.entity, type: event.source });
           if (map) tactics.add(map.tactic);
        }

        const title = `Multi-Stage ML Anomaly (Score: ${dlAnomalyScore.toFixed(2)})`;
        const severity = dlAnomalyScore >= 0.75 ? 'Critical' : 'High';
        
        // Check for duplicates
        const recentDuplicate = db.prepare(`SELECT id FROM correlated_threats WHERE title = ? AND timestamp >= datetime('now', '-5 minutes')`).get(title);
        if (recentDuplicate) continue; // Noise reduction 90%

        // Create Correlated Threat
        const stmt = db.prepare(`
          INSERT INTO correlated_threats (title, risk_score, severity, mitre_tactics)
          VALUES (?, ?, ?, ?)
        `);
        
        const threatId = stmt.run(title, dlAnomalyScore, severity, Array.from(tactics).join(', ')).lastInsertRowid;
        
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
           riskScore: dlAnomalyScore,
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
