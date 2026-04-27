import { db } from '../database.js';

export const memoryService = {
  addThreat: (threat: any) => {
    // Check if exactly matches (same process, hash, ip)
    const existing = db.prepare(`
      SELECT * FROM threat_memory 
      WHERE process_name = ? AND file_hash = ? AND ip_address = ?
    `).get(threat.process_name || '', threat.file_hash || '', threat.ip_address || '');

    if (existing) {
      // Update existing threat
      const updateStmt = db.prepare(`
        UPDATE threat_memory 
        SET occurrences = occurrences + 1,
            last_seen = CURRENT_TIMESTAMP,
            anomaly_score = ?,
            risk_level = ?,
            action_taken = ?,
            agent_confidence = ?
        WHERE id = ?
      `);
      updateStmt.run(
        threat.anomaly_score || existing.anomaly_score,
        threat.risk_level || existing.risk_level,
        threat.action_taken || existing.action_taken,
        threat.agent_confidence || existing.agent_confidence,
        existing.id
      );
      return { ...existing, occurrences: existing.occurrences + 1 };
    } else {
      // Insert new
      const insertStmt = db.prepare(`
        INSERT INTO threat_memory (
          threat_type, process_name, file_hash, ip_address, 
          anomaly_score, risk_level, action_taken, agent_confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const res = insertStmt.run(
        threat.threat_type || 'Unknown',
        threat.process_name || '',
        threat.file_hash || '',
        threat.ip_address || '',
        threat.anomaly_score || 0.0,
        threat.risk_level || 'Low',
        threat.action_taken || 'Logged',
        threat.agent_confidence || 0.5
      );
      return { id: res.lastInsertRowid, ...threat, occurrences: 1 };
    }
  },

  matchThreat: (threat: any) => {
    // Returns matched threat logic
    // Very simple fuzzy matching: similar IP or process
    const params: string[] = [];
    const conditions: string[] = [];
    
    if (threat.process_name) {
      conditions.push(`process_name = ?`);
      params.push(threat.process_name);
    }
    if (threat.file_hash) {
      conditions.push(`file_hash = ?`);
      params.push(threat.file_hash);
    }
    if (threat.ip_address) {
      conditions.push(`ip_address = ?`);
      params.push(threat.ip_address);
    }

    if (conditions.length === 0) return null;

    const query = `
      SELECT * FROM threat_memory 
      WHERE ` + conditions.join(' OR ') + `
      ORDER BY last_seen DESC LIMIT 1
    `;
    const matched = db.prepare(query).get(...params);

    if (matched) {
      // Calculate a "memory confidence score"
      let score = 0.5;
      if (matched.process_name === threat.process_name) score += 0.2;
      if (matched.file_hash === threat.file_hash) score += 0.3;
      if (matched.ip_address === threat.ip_address) score += 0.2;
      if (matched.user_feedback === 'malicious') score += 0.3;
      if (matched.user_feedback === 'safe') score -= 0.5;

      // Apply decay logic (if last_seen is older than 30 days, reduce influence)
      const lastSeenDate = new Date(matched.last_seen);
      const daysOld = (Date.now() - lastSeenDate.getTime()) / (1000 * 3600 * 24);
      const decay = Math.max(0, daysOld * 0.01);
      
      const finalConfidence = Math.max(0, Math.min(1, score - decay));

      return {
        ...matched,
        memory_confidence_score: finalConfidence
      };
    }

    return null;
  },

  getHistory: (filters: any) => {
    let query = `SELECT * FROM threat_memory ORDER BY last_seen DESC`;
    return db.prepare(query).all();
  },

  updateFeedback: (id: number, verdict: string) => {
    // verdict = 'safe' or 'malicious'
    const stmt = db.prepare(`UPDATE threat_memory SET user_feedback = ? WHERE id = ?`);
    stmt.run(verdict, id);
    return { success: true };
  }
};
