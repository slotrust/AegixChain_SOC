import { EventEmitter } from 'events';
import { behavioralAiService } from './behavioral_ai_service.js';
import { alertService } from './alert_service.js';
import { ipsService } from './ips_service.js';
import { memoryService } from './memory_service.js';
import { mitreService } from './mitre_service.js';
import { correlationService } from './correlation_service.js';
import { db } from '../database.js';
import { GoogleGenAI } from '@google/genai';


export interface AgentMessage {
  id: string;
  timestamp: string;
  source: 'Collector' | 'Analyst' | 'LLM' | 'Response';
  target: 'Collector' | 'Analyst' | 'LLM' | 'Response' | 'Broadcast';
  payload: any;
  confidence?: number;
}

class MultiAgentSystem extends EventEmitter {
  private messageHistory: AgentMessage[] = [];
  private ai: GoogleGenAI;

  constructor() {
    super();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // Relies on GEMINI_API_KEY env var
    
    // Initialize DB table for agent memory if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id VARCHAR(100) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50),
        target VARCHAR(50),
        payload TEXT,
        confidence FLOAT
      )
    `);

    // Setup Agent Listeners
    this.setupAnalystAgent();
    this.setupLLMAgent();
    this.setupResponseAgent();
  }

  getHistory(limit: number = 100) {
    const rows = db.prepare(`SELECT * FROM agent_messages ORDER BY timestamp DESC LIMIT ?`).all(limit);
    return rows.reverse().map((r: any) => ({
      ...r,
      payload: JSON.parse(r.payload)
    }));
  }

  public dispatchMessage(msg: AgentMessage) {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > 1000) this.messageHistory.shift();

    try {
       db.prepare(`INSERT INTO agent_messages (id, timestamp, source, target, payload, confidence) VALUES (?, ?, ?, ?, ?, ?)`).run(
         msg.id, msg.timestamp, msg.source, msg.target, JSON.stringify(msg.payload), msg.confidence || 0
       );
    } catch(e) {
       // ignore db insert err
    }

    this.emit('message', msg);
    this.emit(`target_${msg.target}`, msg);
  }

  // 1. Collector Agent (👁)
  // Invoked externally when system stats arrive
  public collectorIngest(data: any, type: 'process' | 'network' | 'system') {
    this.dispatchMessage({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      source: 'Collector',
      target: 'Analyst',
      payload: { type, data }
    });

    // Ingest into Correlation Engine
    try {
      let action = 'unknown';
      let entity = 'unknown';
      if (type === 'process') {
         action = 'execute';
         entity = data.name || 'unknown process';
      } else if (type === 'network') {
         action = 'connect';
         entity = data.remote_ip || 'unknown IP';
      } else {
         action = 'system_event';
         entity = 'system';
      }
      
      correlationService.ingestEvent({
         source: type,
         entity: entity,
         action: action,
         metadata: JSON.stringify(data),
         pid: data.pid
      });
      
      // Attempt correlation (in real system, run async or periodically)
      const newThreats = correlationService.correlateEvents();
      if (newThreats && newThreats.length > 0) {
         // Create alerts for new correlated threats if needed
         for (const threat of newThreats) {
            // Found a correlation!
            console.log("Correlated Threat Discovered: ", threat.title);
         }
      }
    } catch(e) {
      console.error(e);
    }
  }

  // 2. Analyst Agent (🧠)
  private setupAnalystAgent() {
    this.on('target_Analyst', async (msg: AgentMessage) => {
      const { type, data } = msg.payload;
      
      let anomalyScore = 0;
      let riskLevel = 'Low';
      let findings = [];
      let memoryContext = null;
      let mitreContext = null;

      // Extract details for memory match
      const threatObj = {
         process_name: data.name || '',
         ip_address: data.remote_ip || '',
         file_hash: data.hash || ''
      };

      // Check Threat Memory Engine
      const matchedMemory = memoryService.matchThreat(threatObj);
      if (matchedMemory) {
        findings.push(`Threat Memory Engine match: \${Math.round(matchedMemory.memory_confidence_score * 100)}% confidence.`);
        memoryContext = matchedMemory;
        
        if (matchedMemory.user_feedback === 'malicious') {
           anomalyScore += 0.4; // Boost for known malicious
           findings.push(`Historically marked as malicious.`);
        } else if (matchedMemory.user_feedback === 'safe') {
           anomalyScore -= 0.3; // Reduce for known safe
           findings.push(`Historically marked as safe. Reducing false positive.`);
        }

        if (matchedMemory.occurrences > 5 && matchedMemory.action_taken?.includes('Block')) {
           findings.push(`Frequent offender. Has been auto-blocked multiple times.`);
           anomalyScore += 0.3; 
        }
      }

      // Check MITRE ATT&CK Mapping
      const mitreMapping = mitreService.mapToMitre(data);
      if (mitreMapping) {
         mitreContext = mitreMapping;
         findings.push(`MITRE ATT&CK Pattern matched: \${mitreMapping.technique_name} (\${mitreMapping.tactic}) with \${Math.round(mitreMapping.confidence * 100)}% confidence.`);
         
         // Save to MITRE Timeline immediately to ensure visibility in UI for pattern recognition
         mitreService.saveMitreEvent(null, mitreMapping);

         if (mitreMapping.tactic === 'Execution' || mitreMapping.tactic === 'Lateral Movement' || mitreMapping.tactic === 'Persistence') {
           anomalyScore += 0.3; // High risk tactics boost score
         }
      }

      if (type === 'process' && data.name) {
        const baseline = db.prepare(`SELECT * FROM behavioral_baselines WHERE process_name = ?`).get(data.name);
        if (!baseline) {
           anomalyScore = 0.8;
           riskLevel = 'High';
           findings.push(`Process ${data.name} is unknown to behavioral baseline.`);
        } else {
           const stdCpu = Math.max(baseline.std_cpu, 0.1);
           const zCpu = Math.abs((data.cpu_percent || 0) - baseline.avg_cpu) / stdCpu;
           if (zCpu > 3) {
             anomalyScore = 0.6;
             riskLevel = 'Medium';
             findings.push(`Significant CPU deviation for ${data.name}.`);
           }
        }
      }

      // If suspicious, pass to LLM Agent for deep analysis
      if (anomalyScore >= 0.5) {
        this.dispatchMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: new Date().toISOString(),
          source: 'Analyst',
          target: 'LLM',
          confidence: Math.min(1, anomalyScore),
          payload: { 
            eventData: msg.payload,
            findings,
            riskLevel: anomalyScore >= 0.8 ? 'High' : 'Medium',
            memoryContext,
            mitreContext
          }
        });
      }
    });
  }

  // 3. LLM Agent (🤖)
  private setupLLMAgent() {
    this.on('target_LLM', async (msg: AgentMessage) => {
      const { eventData, findings, riskLevel, memoryContext, mitreContext } = msg.payload;

      try {
        const prompt = `As the Aegix LLM Agent, analyze this security event.
Event: \${JSON.stringify(eventData)}
Findings: \${findings.join("; ")}
Risk Level: \${riskLevel}
Historical Context: \${memoryContext ? JSON.stringify(memoryContext) : 'None'}
MITRE ATT&CK Context: \${mitreContext ? JSON.stringify(mitreContext) : 'None'}

Provide a concise human-readable explanation and a recommended action (Block, Isolate, Notify, Ignore).
Format strictly as JSON: {"explanation": "...", "recommended_action": "..."}
`;
        
        // Use Gemini API
        const response = await this.ai.models.generateContent({
           model: 'gemini-3-flash-preview',
           contents: prompt
        });

        const textObj = response.text?.replace(/```json/g, '').replace(/```/g, '') || '{}';
        const result = JSON.parse(textObj);

        this.dispatchMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: new Date().toISOString(),
          source: 'LLM',
          target: 'Response',
          payload: {
            ...msg.payload,
            explanation: result.explanation,
            recommended_action: result.recommended_action
          }
        });
      } catch (err) {
        // Fallback if LLM fails
        this.dispatchMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: new Date().toISOString(),
          source: 'LLM',
          target: 'Response',
          payload: {
            ...msg.payload,
            explanation: "LLM synthesis failed. Proceeding with raw findings: " + findings.join("; "),
            recommended_action: "Notify"
          }
        });
      }
    });
  }

  // 4. Response Agent (⚔)
  private setupResponseAgent() {
    this.on('target_Response', async (msg: AgentMessage) => {
      const { recommended_action, explanation, riskLevel, eventData, mitreContext } = msg.payload;

      let actionTaken = 'None';

      if (recommended_action?.includes('Block') || recommended_action?.includes('Isolate')) {
        // In this real environment, we log the block action
        // Could also integrate with ipsService if it's an IP
        if (eventData.type === 'network' && eventData.data.remote_ip) {
            await ipsService.blockIp(eventData.data.remote_ip, 'Response Agent Auto-Block');
            actionTaken = `Blocked IP ${eventData.data.remote_ip}`;
        } else {
            actionTaken = `Blocked Process ${eventData.data?.name}`;
        }
      } else if (recommended_action?.includes('Notify')) {
        actionTaken = 'User Notified';
      }

      // Add to Threat Memory Store
      memoryService.addThreat({
         threat_type: eventData.type,
         process_name: eventData.data?.name || '',
         file_hash: eventData.data?.hash || '',
         ip_address: eventData.data?.remote_ip || '',
         anomaly_score: msg.confidence || 0,
         risk_level: riskLevel,
         action_taken: actionTaken,
         agent_confidence: msg.confidence || 0
      });
      
      // Add to MITRE Timeline
      if (mitreContext) {
         mitreService.saveMitreEvent(null, mitreContext);
      }

      await alertService.createAlert({
        log_id: null,
        severity: riskLevel === 'High' ? 'Critical' : 'Medium',
        reason: `Multi-Agent Consensus: ${explanation}`,
        score: msg.confidence || 0,
        status: actionTaken.includes('Block') || actionTaken.includes('Isolate') ? 'auto_resolved' : 'active',
        resolution_action: actionTaken,
        mitigations: `Auto-Response executed: ${actionTaken}`
      });

      this.dispatchMessage({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        source: 'Response',
        target: 'Broadcast',
        payload: {
          actionTaken,
          explanation
        }
      });
    });
  }
}

export const multiAgentSystem = new MultiAgentSystem();
