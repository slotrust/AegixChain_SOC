import { db } from '../database.js';

export const mitreDataset = [
  {
    id: 'T1059',
    name: 'Command and Scripting Interpreter',
    tactic: 'Execution',
    description: 'Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries.',
    keywords: ['cmd.exe', 'powershell.exe', 'bash', 'sh', 'python', 'script']
  },
  {
    id: 'T1547',
    name: 'Boot or Logon Autostart Execution',
    tactic: 'Persistence',
    description: 'Adversaries may configure system settings to automatically execute a program during system boot or logon.',
    keywords: ['registry', 'startup', 'autorun', 'hkcu', 'hklm', 'schtasks']
  },
  {
    id: 'T1003',
    name: 'OS Credential Dumping',
    tactic: 'Credential Access',
    description: 'Adversaries may attempt to dump credentials to obtain account login and credential material, normally in the form of a hash or a clear text password.',
    keywords: ['lsass', 'mimikatz', 'dump', 'shadow', 'passwd']
  },
  {
    id: 'T1078',
    name: 'Valid Accounts',
    tactic: 'Defense Evasion',
    description: 'Adversaries may obtain and abuse credentials of existing accounts as a means of gaining Initial Access, Persistence, Privilege Escalation, or Defense Evasion.',
    keywords: ['login', 'auth', 'ssh', 'rdp', 'brute']
  },
  {
    id: 'T1021',
    name: 'Remote Services',
    tactic: 'Lateral Movement',
    description: 'Adversaries may use Valid Accounts to log into a service specifically designed to accept remote connections, such as telnet, SSH, and RDP.',
    keywords: ['ssh', 'rdp', 'smb', 'winrm', 'wmi']
  }
];

export const mitreService = {
  mapToMitre: (event: any) => {
    let matchedTechnique = null;
    let maxConfidence = 0;
    
    const eventString = JSON.stringify(event).toLowerCase();
    
    // Rule-based heuristic matching
    for (const technique of mitreDataset) {
      let matchCount = 0;
      for (const keyword of technique.keywords) {
        if (eventString.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
      
      const confidence = matchCount > 0 ? Math.min(1.0, 0.4 + (matchCount * 0.2)) : 0;
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        matchedTechnique = technique;
      }
    }
    
    // AI Fallback/Boost hook could go here if we wanted to call the LLM to refine it,
    // but we will do it rule based first and integrate the result into the Multi-Agent LLM payload
    
    if (matchedTechnique && maxConfidence >= 0.5) {
       return {
         technique_id: matchedTechnique.id,
         technique_name: matchedTechnique.name,
         tactic: matchedTechnique.tactic,
         confidence: maxConfidence,
         description: matchedTechnique.description
       };
    }
    
    return null;
  },
  
  saveMitreEvent: (eventId: number | null, mapping: any) => {
    const stmt = db.prepare(`
      INSERT INTO mitre_timeline (event_id, tactic, technique_id, technique_name, confidence, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const res = stmt.run(
      eventId || 0,
      mapping.tactic,
      mapping.technique_id,
      mapping.technique_name,
      mapping.confidence,
      mapping.description
    );
    
    return res.lastInsertRowid;
  },

  getTimeline: (limit = 50) => {
    return db.prepare(`SELECT * FROM mitre_timeline ORDER BY timestamp DESC LIMIT ?`).all(limit);
  },

  getTechniqueDetails: (id: string) => {
    return mitreDataset.find(t => t.id === id) || null;
  }
};
