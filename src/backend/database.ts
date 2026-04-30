import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { authUtils } from './utils/auth.js';

// Handles via process.cwd()

const dbPath = path.join(process.cwd(), 'soc.db');
console.log(`Initializing database at: ${dbPath}`);

let db: any;
try {
  db = new Database(dbPath);
  console.log("Database connection established.");
} catch (err) {
  console.error("Failed to connect to database in current directory, trying /tmp/soc.db", err);
  try {
    db = new Database('/tmp/soc.db');
    console.log("Database connection established in /tmp/soc.db");
  } catch (err2) {
    console.error("Failed to connect to database in /tmp as well", err2);
    throw err2;
  }
}

export { db };

export async function initDb() {
  try {
    // Logs Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_ip VARCHAR(45) NOT NULL,
        event_type VARCHAR(50),
        username VARCHAR(100),
        status_code INTEGER,
        payload TEXT,
        is_anomaly BOOLEAN DEFAULT 0,
        mitre_tactic VARCHAR(100)
      )
    `);

    try {
      db.exec(`ALTER TABLE logs ADD COLUMN mitre_tactic VARCHAR(100)`);
    } catch (e) {
      // Column might already exist
    }

    // Alerts Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id INTEGER,
        severity VARCHAR(10),
        reason TEXT,
        score FLOAT,
        mitigations TEXT,
        acknowledged BOOLEAN DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        resolution_action TEXT,
        occurrences INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (log_id) REFERENCES logs(id)
      )
    `);

    try {
      db.exec(`ALTER TABLE alerts ADD COLUMN status VARCHAR(20) DEFAULT 'active'`);
      db.exec(`ALTER TABLE alerts ADD COLUMN resolution_action TEXT`);
      db.exec(`ALTER TABLE alerts ADD COLUMN occurrences INTEGER DEFAULT 1`);
    } catch (e) {
      // Columns might already exist
    }

    // Users Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'analyst',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat History Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Chat history table initialized.");

    // Behavioral AI Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS behavioral_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id VARCHAR(100) DEFAULT 'default',
        process_name VARCHAR(255),
        avg_cpu FLOAT DEFAULT 0,
        std_cpu FLOAT DEFAULT 0,
        avg_mem FLOAT DEFAULT 0,
        std_mem FLOAT DEFAULT 0,
        exec_count INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_id, process_name)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS behavioral_anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id VARCHAR(100) DEFAULT 'default',
        process_name VARCHAR(255),
        score FLOAT,
        risk_level VARCHAR(20),
        explanation TEXT,
        process_data TEXT,
        is_reviewed BOOLEAN DEFAULT 0,
        is_false_positive BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Threat Memory Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS threat_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        threat_type VARCHAR(100),
        process_name VARCHAR(255),
        file_hash VARCHAR(255),
        ip_address VARCHAR(100),
        anomaly_score FLOAT,
        risk_level VARCHAR(20),
        action_taken VARCHAR(100),
        user_feedback VARCHAR(50) DEFAULT 'unreviewed',
        agent_confidence FLOAT,
        occurrences INTEGER DEFAULT 1,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // MITRE Timeline Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS mitre_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_id INTEGER,
        tactic VARCHAR(100),
        technique_id VARCHAR(50),
        technique_name VARCHAR(255),
        confidence FLOAT,
        description TEXT
      )
    `);

    // Normalized Events for Correlation
    db.exec(`
      CREATE TABLE IF NOT EXISTS normalized_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50),
        entity VARCHAR(255),
        action VARCHAR(50),
        metadata TEXT,
        pid INTEGER
      )
    `);

    // Correlated Threats (Cases)
    db.exec(`
      CREATE TABLE IF NOT EXISTS correlated_threats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        title VARCHAR(255),
        risk_score FLOAT,
        severity VARCHAR(20),
        status VARCHAR(20) DEFAULT 'open',
        mitre_tactics TEXT
      )
    `);

    // Threat Event Links
    db.exec(`
      CREATE TABLE IF NOT EXISTS correlated_threat_events (
        threat_id INTEGER,
        event_id INTEGER,
        FOREIGN KEY(threat_id) REFERENCES correlated_threats(id),
        FOREIGN KEY(event_id) REFERENCES normalized_events(id)
      )
    `);

    // Processes Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pid INTEGER,
        name VARCHAR(255),
        cpu_percent FLOAT,
        memory_usage FLOAT,
        exe_path TEXT,
        cmdline TEXT,
        user VARCHAR(100),
        status VARCHAR(50),
        is_suspicious BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Attempt to add columns if they don't exist (for existing databases)
    try {
      db.exec(`ALTER TABLE processes ADD COLUMN cmdline TEXT`);
    } catch (e) { /* Ignore if exists */ }
    try {
      db.exec(`ALTER TABLE processes ADD COLUMN user VARCHAR(100)`);
    } catch (e) { /* Ignore if exists */ }

    // Network Connections Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS network_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_address VARCHAR(100),
        remote_address VARCHAR(100),
        status VARCHAR(50),
        pid INTEGER,
        is_suspicious BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT
      )
    `);

    // Agent Analysis Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_analysis (
        alert_id INTEGER PRIMARY KEY,
        analysis_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(alert_id) REFERENCES alerts(id)
      )
    `);

    // Blocked IPs Table (IPS)
    db.exec(`
      CREATE TABLE IF NOT EXISTS blocked_ips (
        ip VARCHAR(45) PRIMARY KEY,
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create essential indexes for performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_source_ip ON logs(source_ip)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_log_id ON alerts(log_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_processes_pid ON processes(pid)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_processes_timestamp ON processes(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_network_timestamp ON network_connections(timestamp)`);
    
    // Auto-unblock column
    try {
      db.exec(`ALTER TABLE blocked_ips ADD COLUMN expires_at DATETIME`);
    } catch (e) { /* Ignore if already exists */ }

    // Firewall Rules Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS firewall_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name VARCHAR(100) NOT NULL,
        action VARCHAR(20) NOT NULL,
        source_ip VARCHAR(45),
        destination_ip VARCHAR(45),
        port VARCHAR(20),
        protocol VARCHAR(20) DEFAULT 'ANY',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `);

    // Patched Packages Table (EDR)
    db.exec(`
      CREATE TABLE IF NOT EXISTS patched_packages (
        package_name VARCHAR(100) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        vulnerability_range TEXT,
        action_taken TEXT,
        counterattack TEXT
      )
    `);

    // Seed Behavioral Baselines if empty
    const baselineCount = db.prepare("SELECT COUNT(*) as count FROM behavioral_baselines").get().count;
    if (baselineCount === 0) {
      db.prepare(`
        INSERT INTO behavioral_baselines (device_id, process_name, avg_cpu, std_cpu, avg_mem, std_mem, exec_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', 'nginx', 2.5, 0.5, 45.0, 5.0, 100);
      db.prepare(`
        INSERT INTO behavioral_baselines (device_id, process_name, avg_cpu, std_cpu, avg_mem, std_mem, exec_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', 'node', 15.0, 4.0, 120.0, 20.0, 45);
      
      db.prepare(`
        INSERT INTO behavioral_anomalies (device_id, process_name, score, risk_level, explanation, process_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('default', 'powershell.exe', 0.85, 'High', 'Significant CPU deviation from baseline and uncommon execution.', JSON.stringify({ pid: 4920, cpu: 85.5 }));
    }

    // Seed Threat Memory if empty
    const memoryCount = db.prepare("SELECT COUNT(*) as count FROM threat_memory").get().count;
    if (memoryCount === 0) {
      db.prepare(`
        INSERT INTO threat_memory (threat_type, process_name, file_hash, ip_address, anomaly_score, risk_level, action_taken, agent_confidence, occurrences, user_feedback)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('process', 'svchost.exe', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '', 0.85, 'High', 'Blocked', 0.92, 12, 'malicious');

      db.prepare(`
        INSERT INTO threat_memory (threat_type, process_name, file_hash, ip_address, anomaly_score, risk_level, action_taken, agent_confidence, occurrences, user_feedback)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('network', '', '', '185.199.108.153', 0.75, 'Medium', 'Logged', 0.88, 4, 'unreviewed');
    }

    // Seed MITRE Timeline if empty
    const mitreCount = db.prepare("SELECT COUNT(*) as count FROM mitre_timeline").get().count;
    if (mitreCount === 0) {
      db.prepare(`
        INSERT INTO mitre_timeline (tactic, technique_id, technique_name, confidence, description)
        VALUES (?, ?, ?, ?, ?)
      `).run('Execution', 'T1059', 'Command and Scripting Interpreter', 0.85, 'Suspicious usage of powershell.exe with encoded commands.');
      
      db.prepare(`
        INSERT INTO mitre_timeline (tactic, technique_id, technique_name, confidence, description)
        VALUES (?, ?, ?, ?, ?)
      `).run('Defense Evasion', 'T1070', 'Indicator Removal on Host', 0.90, 'Attempted clearing of Windows Event Logs.');
    }

    // Seed admin user if not exists
    const adminExists = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
    if (!adminExists) {
      const hashedPassword = await authUtils.hashPassword('admin123');
      db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run('admin', hashedPassword, 'admin');
      console.log("Default admin user created.");
    }

  } catch (err) {
    console.error("Error during table initialization:", err);
    throw err;
  }
}
