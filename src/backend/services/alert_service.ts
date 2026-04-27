import { db } from "../database.js";
import { aegixBridge } from "./aegix_bridge.js";
import { sseService } from "./sse_service.js";

export const settingsService = {
  getSettings: () => {
    const rows = db.prepare("SELECT key, value FROM settings").all() as {key: string, value: string}[];
    const settings: Record<string, any> = {
      auto_ack_enabled: false,
      auto_ack_severity: 'Low',
      auto_ack_delay_minutes: 60,
      anomaly_threshold: 0.35,
      critical_threshold: 0.85
    };
    
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch (e) {
        settings[row.key] = row.value;
      }
    }
    return settings;
  },

  updateSettings: (newSettings: Record<string, any>) => {
    const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const transaction = db.transaction((settings: Record<string, any>) => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });
    transaction(newSettings);
    return settingsService.getSettings();
  }
};

export const alertService = {
  createAlert: (alert: any, skipAegix: boolean = false) => {
    // 1. Intelligent Severity Classification
    // Base severity comes from alert or defaults to Low.
    let calculatedSeverity = alert.severity || 'Low';
    let status = alert.status || 'active'; // can be 'active', 'auto_resolved', 'suppressed'
    let resolutionAction = alert.resolution_action || alert.mitigations || 'None';
    let anomalyScore = alert.score || 0;

    // Check user settings
    const settings = settingsService.getSettings();
    const criticalThreshold = settings.critical_threshold || 0.85;

    // Adjust severity based on score if not explicitly Critical
    if (anomalyScore >= criticalThreshold) {
       calculatedSeverity = 'Critical';
    } else if (status === 'auto_resolved') {
       // Auto-resolved events aren't Critical by human standards anymore, they are handled.
       // However, we can preserve the recorded severity but just change the status.
    } else if (anomalyScore < (settings.anomaly_threshold || 0.35)) {
       calculatedSeverity = 'Low';
       status = 'suppressed';
       resolutionAction = 'Ignored (Low Anomaly Score)';
    }

    // 2. Alert Deduplication
    const existing = db.prepare(`
      SELECT id, occurrences FROM alerts 
      WHERE reason = ? 
        AND created_at > datetime('now', '-10 minutes')
        AND status = ?
      LIMIT 1
    `).get(alert.reason, status);

    if (existing) {
       // Increment occurrence counter
       const existingAlert = existing as {id: number, occurrences: number};
       db.prepare(`UPDATE alerts SET occurrences = occurrences + 1, created_at = datetime('now') WHERE id = ?`).run(existingAlert.id);
       
       if (!skipAegix && status === 'active') {
         // Optionally inform Aegix Brain of repeat
       }
       return existingAlert.id;
    }

    // 3. Insert New Alert
    const stmt = db.prepare(`
      INSERT INTO alerts (log_id, severity, reason, score, mitigations, status, resolution_action, occurrences, acknowledged)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
    `);
    const info = stmt.run(
      alert.log_id || null,
      calculatedSeverity,
      alert.reason,
      anomalyScore,
      JSON.stringify(alert.mitigations || null),
      status,
      resolutionAction
    );
    
    // Feed to Aegix AI Brain only if not skipped and is active
    if (!skipAegix && status === 'active') {
      try {
        aegixBridge.processEvent({
          id: info.lastInsertRowid,
          event_type: 'alert',
          severity: calculatedSeverity,
          reason: alert.reason,
          score: anomalyScore,
          log_id: alert.log_id
        });
      } catch (e) {
        console.error("Failed to send alert to Aegix:", e);
      }
    }
    
    // Broadcast via SSE based on status
    try {
      if (status === 'active') {
         sseService.broadcast('new_alert', {
           id: info.lastInsertRowid,
           severity: calculatedSeverity,
           reason: alert.reason,
           occurrences: 1
         });
      } else if (status === 'auto_resolved') {
         sseService.broadcast('auto_resolved', {
           id: info.lastInsertRowid,
           reason: alert.reason,
           action: resolutionAction
         });
      }
    } catch (e) {
      console.error("Failed to broadcast SSE:", e);
    }

    return info.lastInsertRowid;
  },

  getAlerts: (severity?: string, status: string = 'active', limit = 20, offset = 0) => {
    let query = `
      SELECT a.*, l.source_ip, l.event_type, l.username, l.status_code, l.payload
      FROM alerts a
      LEFT JOIN logs l ON a.log_id = l.id
    `;
    const params: any[] = [];
    const conditions: string[] = ["a.status = ?"];
    params.push(status);

    if (severity) {
      conditions.push("a.severity = ?");
      params.push(severity);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  },

  getAlertById: (id: number) => {
    return db.prepare(`
      SELECT a.*, l.source_ip, l.event_type, l.username, l.status_code, l.payload
      FROM alerts a
      LEFT JOIN logs l ON a.log_id = l.id
      WHERE a.id = ?
    `).get(id);
  },

  acknowledgeAlert: (id: number, acknowledged: boolean) => {
    db.prepare("UPDATE alerts SET acknowledged = ? WHERE id = ?").run(acknowledged ? 1 : 0, id);
    return alertService.getAlertById(id);
  },

  autoAcknowledgeAlerts: () => {
    const settings = settingsService.getSettings();
    if (!settings.auto_ack_enabled) return 0;

    const delayMinutes = settings.auto_ack_delay_minutes || 60;
    const severity = settings.auto_ack_severity || 'Low';

    const info = db.prepare(`
      UPDATE alerts 
      SET acknowledged = 1 
      WHERE acknowledged = 0 
        AND severity = ? 
        AND created_at <= datetime('now', ?)
    `).run(severity, `-${delayMinutes} minutes`);

    if (info.changes > 0) {
      console.log(`Auto-acknowledged ${info.changes} alerts with severity ${severity} older than ${delayMinutes} minutes.`);
    }
    return info.changes;
  }
};
