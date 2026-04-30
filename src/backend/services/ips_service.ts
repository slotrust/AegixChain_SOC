import { db } from "../database.js";
import fs from "fs";

// In-memory cache for fast lookups
const blockedIpsCache = new Set<string>();

export const ipsService = {
  quarantineFile: (filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        // Absolute quarantine: strip execution and write permissions, only readable by owner
        fs.chmodSync(filePath, 0o400); 
        console.log(`[EDR] Absolute Quarantine Applied: Permission stripped for ${filePath}`);
        return true;
      }
    } catch(err) {
      console.error(`[EDR] Failed to quarantine file ${filePath}:`, err);
    }
    return false;
  },

  init: () => {
    try {
      // First, clean up expired IPs
      ipsService.cleanupExpiredBlocks();
      
      const rows = db.prepare("SELECT ip FROM blocked_ips WHERE expires_at IS NULL OR expires_at > datetime('now')").all() as { ip: string }[];
      rows.forEach(row => blockedIpsCache.add(row.ip));
      console.log(`[IPS] Loaded ${blockedIpsCache.size} blocked IPs from database.`);
    } catch (err) {
      console.error("[IPS] Failed to load blocked IPs on startup:", err);
    }
  },

  blockIp: (ip: string, reason: string, durationHours?: number | null) => {
    try {
      if (durationHours) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO blocked_ips (ip, reason, expires_at)
          VALUES (?, ?, datetime('now', ?))
        `);
        stmt.run(ip, reason, `+${Math.floor(durationHours * 60)} minutes`);
      } else {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO blocked_ips (ip, reason, expires_at)
          VALUES (?, ?, NULL)
        `);
        stmt.run(ip, reason);
      }
      
      blockedIpsCache.add(ip);
      console.log(`[IPS] Blocked IP: ${ip} - Reason: ${reason}${durationHours ? ` - Duration: ${durationHours}h` : ' - Permanent'}`);
      return true;
    } catch (err) {
      console.error(`[IPS] Failed to block IP ${ip}:`, err);
      return false;
    }
  },

  unblockIp: (ip: string) => {
    try {
      const stmt = db.prepare("DELETE FROM blocked_ips WHERE ip = ?");
      stmt.run(ip);
      blockedIpsCache.delete(ip);
      console.log(`[IPS] Unblocked IP: ${ip}`);
      return true;
    } catch (err) {
      console.error(`[IPS] Failed to unblock IP ${ip}:`, err);
      return false;
    }
  },

  isIpBlocked: (ip: string): boolean => {
    return blockedIpsCache.has(ip);
  },

  getBlockedIps: () => {
    try {
      return db.prepare("SELECT * FROM blocked_ips ORDER BY timestamp DESC").all();
    } catch (err) {
      console.error("[IPS] Failed to get blocked IPs:", err);
      return [];
    }
  },
  
  cleanupExpiredBlocks: () => {
    try {
      const expiredIps = db.prepare("SELECT ip FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").all() as { ip: string }[];
      if (expiredIps.length > 0) {
        const stmt = db.prepare("DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')");
        stmt.run();
        
        expiredIps.forEach(row => {
          blockedIpsCache.delete(row.ip);
          console.log(`[IPS] Auto-unblocked expired IP: ${row.ip}`);
        });
      }

      const stmtRules = db.prepare("DELETE FROM firewall_rules WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')");
      stmtRules.run();
    } catch (err) {
      console.error("[IPS] Failed to cleanup expired blocks:", err);
    }
  },

  getFirewallRules: () => {
    try {
      return db.prepare("SELECT * FROM firewall_rules ORDER BY created_at DESC").all();
    } catch (err) {
      console.error("[IPS] Failed to get firewall rules:", err);
      return [];
    }
  },

  addFirewallRule: (rule_name: string, action: string, source_ip?: string, destination_ip?: string, port?: string, protocol?: string, durationHours?: number | null) => {
    try {
      let expires_at = null;
      if (durationHours) {
        expires_at = `+${Math.floor(durationHours * 60)} minutes`;
      }
      
      const stmt = db.prepare(`
        INSERT INTO firewall_rules (rule_name, action, source_ip, destination_ip, port, protocol, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ${durationHours ? "datetime('now', ?)" : "NULL"})
      `);
      
      if (durationHours) {
        stmt.run(rule_name, action, source_ip, destination_ip, port, protocol || 'ANY', expires_at);
      } else {
        stmt.run(rule_name, action, source_ip, destination_ip, port, protocol || 'ANY');
      }
      return true;
    } catch (err) {
      console.error("[IPS] Failed to add firewall rule:", err);
      return false;
    }
  },

  deleteFirewallRule: (id: number) => {
    try {
      const stmt = db.prepare("DELETE FROM firewall_rules WHERE id = ?");
      stmt.run(id);
      console.log(`[IPS] Deleted firewall rule ID: ${id}`);
      return true;
    } catch (err) {
      console.error(`[IPS] Failed to delete firewall rule ${id}:`, err);
      return false;
    }
  }
};
