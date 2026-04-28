import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

// handled

class AegixBridge extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  public isReady = false;
  private history: any[] = [];

  start() {
    
    const scriptPath = path.join(process.cwd(), 'src/backend/ai/aegix_brain.py');
    
    const spawnPython = (command: string) => {
      this.pythonProcess = spawn(command, [scriptPath], {
        env: {
            ...process.env,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || ''
        }
      });

      this.pythonProcess.on('error', (err: any) => {
        console.error("aegixBridge Python Error:", err.message);
        if (err.code === 'ENOENT' && command === 'python3') {
          spawnPython('python');
        }
      });

      this.pythonProcess.stdin?.on('error', (err) => {
        console.error("aegixBridge stdin error:", err);
        this.isReady = false;
      });

      let buffer = '';
      this.pythonProcess.stdout?.on('data', (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (!line) continue;
          
          try {
            const msg = JSON.parse(line);
            if (msg.status === 'ready') {
              this.isReady = true;
            } else if (msg.type === 'sentinel_result' || msg.type === 'aegix_result') {
              this.history.unshift({
                timestamp: new Date().toISOString(),
                ...msg.data
              });
              // Keep only last 50
              if (this.history.length > 50) this.history.pop();
              
              // Process Autonomous Actions from the Brain
              const action = msg.data.action;
              const executions = msg.data.execution_details || [];
              const eventSeverity = msg.data.event?.severity;
              const tiResult = msg.data.ti_result;
              const sourceIp = msg.data.event?.source_ip;
              const logId = msg.data.event?.id || msg.data.event?.log_id;
              
              if (logId && msg.data.mitre_tactic) {
                  import('../database.js').then(({ db }) => {
                      db.prepare("UPDATE logs SET mitre_tactic = ? WHERE id = ?").run(msg.data.mitre_tactic, logId);
                  }).catch(e => console.error("Failed to update mitre tactic", e));
              }
              
              // Auto-block based on Threat Intel
              if (tiResult?.malicious && sourceIp) {
                  import('./ips_service.js').then(({ ipsService }) => {
                      const blockReason = `[Auto-TI Block] Flagged as malicious by OSINT feed (${tiResult.source}).`;
                      ipsService.blockIp(sourceIp, blockReason, 24); // Default 24 hour block
                  }).catch(e => console.error("Failed to dynamically import ipsService:", e));
              }
              
              if (eventSeverity === 'Critical' && (action === "MANUAL_REVIEW" || action === "LLM_DECISION")) {
                  import('./alert_service.js').then(({ alertService }) => {
                     // Fire automatic high severity alert since Aegix Python identified it and requires manual review
                     let reason = `[Aegix Brain Critical] AI evaluated multi-layered threat path over threshold. ${msg.data.reasoning || ''}`;
                     
                     if (tiResult?.malicious) {
                         reason = `[Threat Intel Hit] ${tiResult.source} flags IP as highly malicious. ${msg.data.reasoning || ''}`;
                     } else if (msg.data.kill_chain?.confidence === 'Critical') {
                         reason = `[Kill-Chain Detected] ${msg.data.kill_chain.message}`;
                     } else if (msg.data.analysis && msg.data.analysis.includes("evil.exe")) {
                         reason = `[Sigma Rule Trigger] Critical process interaction (evil.exe) detected.`;
                     }
                        
                     alertService.createAlert({
                        log_id: msg.data.event?.id || Math.floor(Math.random() * 1000000),
                        severity: "Critical",
                        reason: reason,
                        score: msg.data.dl_threat_score || 0.95,
                        mitigations: `Action needed, status: ${action}`
                     }, true); // skipAegix to prevent infinity loop
                  }).catch(e => console.error("Failed to dynamically import alertService:", e));
              }

              if (action && action !== "MANUAL_REVIEW" && action !== "IGNORE" && action !== "LLM_DECISION") {
                const sourceIp = msg.data.event?.source_ip;
                const reasoning = msg.data.reasoning || "Autonomous Aegix RL Response";
                
                // We no longer create alerts for DATA_FORTRESS, HONEYPOT, MULTI_AGENT_SPAWN
                // because the user requested: "if the AI can resolve the problem, then there is no need for the alert,
                // just add it to the AI response and memory for reference" - which is already done via this.history.unshift()
                
                if (sourceIp) {
                  import('./ips_service.js').then(({ ipsService }) => {
                    if (action === "BLOCK_IP") {
                      ipsService.blockIp(sourceIp, `[RL Brain] ${reasoning}`, 1); // 1 hr block
                    } else if (action === "ISOLATE_ENDPOINT" || action === "ISOLATE_HOST" || action === "LIMIT_NETWORK") {
                      ipsService.blockIp(sourceIp, `[RL Brain] Endpoint Isolation: ${reasoning}`, 24); // 24 hr block
                    }
                  }).catch(e => console.error("Failed to dynamically import ipsService:", e));
                }

                if (action === "KILL_PROCESS") {
                  if (msg.data.event?.pid || msg.data.event?.details?.pid) {
                    const pidToKill = msg.data.event?.pid || msg.data.event?.details?.pid;
                    try {
                      import('child_process').then(({ exec }) => {
                          exec(`kill -9 ${pidToKill}`, (err) => {
                             if (err) console.error(`Failed to kill process ${pidToKill}:`, err);
                             else console.log(`[Aegix Autonomous] Killed process ${pidToKill}`);
                          });
                      });
                    } catch (e) {
                      console.error("Failed to execute KILL_PROCESS action:", e);
                    }
                  }
                }
              }
              
              // We no longer create alerts for autonomous Sigma rule generation (Layer Hardening)
              // because the action is self-resolved by the AI.
              if (msg.data.hardening_action) {
                  // Hardening action logged to AI memory only
              }

              this.emit('result', msg.data);
            } else if (msg.error) {
            } else if (msg.status === 'warning') {
            } else {
            }
          } catch (e) {
          }
        }
      });

      this.pythonProcess.stderr?.on('data', (data) => {
      });

      this.pythonProcess.on('close', (code) => {
        if (code !== null) {
          this.isReady = false;
          // Restart after 5 seconds
          setTimeout(() => this.start(), 5000);
        }
      });
    };

    try {
      import('child_process').then(({ exec }) => {
         const installCmd = 'python3 -m pip install --no-cache-dir PyYAML google-genai requests --break-system-packages || (wget -qO- https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages && python3 -m pip install --no-cache-dir PyYAML google-genai requests --break-system-packages)';
         exec(installCmd, (error, stdout, stderr) => {
           if (error) {
           } else {
           }
           // Start python process after dependencies are checked/installed
           spawnPython('python3');
         });
      }).catch(() => {
        // Fallback if import fails
        spawnPython('python3');
      });
    } catch (e) {
      spawnPython('python3');
    }
  }

  processEvent(event: any) {
    if (!this.isReady || !this.pythonProcess || !this.pythonProcess.stdin) {
      return;
    }
    try {
      this.pythonProcess.stdin.write(JSON.stringify(event) + '\n', (err) => {
        if (err) {
            console.error("Failed to write to python process stdin:", err);
            this.isReady = false;
        }
      });
    } catch (e) {
      console.error("Exception writing to python process", e);
      this.isReady = false;
    }
  }

  getHistory() {
    return this.history;
  }
}

export const aegixBridge = new AegixBridge();
