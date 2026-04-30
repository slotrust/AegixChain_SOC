import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Cpu, ListChecks, Code, MessageSquare, SearchCode, Database, Zap, ShieldOff, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface IncidentDetailProps {
  incident: any;
  onClose: () => void;
  onAskAI: (incident: any) => void;
  onForensics?: (incident: any) => void;
}

export default function IncidentDetail({ incident, onClose, onAskAI, onForensics }: IncidentDetailProps) {
  const [showPayload, setShowPayload] = useState(false);
  const [isIsolating, setIsIsolating] = useState(false);
  
  // States for LangGraph Agent Analysis
  const [agentAnalysis, setAgentAnalysis] = useState<any>(null);
  const [isRunningAgent, setIsRunningAgent] = useState(false);

  useEffect(() => {
    if (incident && incident.id) {
       // Check if analysis already exists
       fetch(`/api/agent/analysis/${incident.id}`)
          .then(res => res.json())
          .then(data => {
             if (data && !data.error) {
                 setAgentAnalysis(data);
             }
          })
          .catch(() => {});
    }
  }, [incident]);

  const handleRunAgent = async () => {
      setIsRunningAgent(true);
      try {
          const res = await fetch('/api/agent/analyze-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alertId: incident.id })
          });
          const data = await res.json();
          if (data && !data.error) {
              setAgentAnalysis(data);
              toast.success("Agent Analysis Complete");
          } else {
              toast.error(data.error || "Agent Analysis Failed");
          }
      } catch (e) {
          toast.error("Agent Analysis Failed");
      } finally {
          setIsRunningAgent(false);
      }
  };

  if (!incident) return null;

  const handleIsolateEndpoint = async () => {
    if (!incident.source_ip) {
      toast.error("Cannot isolate: No source IP associated with this incident.");
      return;
    }

    // Double confirmation for real actions in a SOC UI is good practice
    if (!window.confirm(`Respond Engine WARNING: Are you sure you want to completely isolate endpoint ${incident.source_ip} from the network?`)) {
      return;
    }

    setIsIsolating(true);
    try {
      // 24 Hour Isolation Block
      await api.blockIp(incident.source_ip, `Response Engine triggered network isolation for Critical Incident #${incident.id}`, 24);
      toast.success(`Endpoint ${incident.source_ip} successfully isolated. IPS rules applied.`);
    } catch (err) {
      console.error("Failed to isolate endpoint:", err);
      toast.error("Failed to trigger network isolation.");
    } finally {
      setIsIsolating(false);
    }
  };

  let mitigations: string[] = [];
  try {
    if (incident.mitigations) {
      const parsed = typeof incident.mitigations === 'string' 
        ? JSON.parse(incident.mitigations) 
        : incident.mitigations;
      mitigations = Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error("Failed to parse mitigations:", e);
  }

  let payload: any = {};
  try {
    if (incident.payload) {
      payload = typeof incident.payload === 'string' 
        ? JSON.parse(incident.payload) 
        : incident.payload;
    }
  } catch (e) {
    console.error("Failed to parse payload:", e);
  }

  let details = "";
  let detailsType = "default";
  
  if (payload) {
    if (payload.cmdline) {
      details = payload.cmdline;
      detailsType = "command";
    } else if (payload.file) {
      details = `Target: ${payload.file}`;
      detailsType = "file";
    } else if (payload.destination) {
      details = `${payload.protocol} -> ${payload.destination}`;
      detailsType = "network";
    } else if (payload.user_agent) {
      details = payload.user_agent;
      detailsType = "user_agent";
    } else if (payload.action) {
      details = `Action: ${payload.action}`;
      detailsType = "command";
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="glass-panel bg-soc-surface border border-soc-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-soc-border flex justify-between items-center bg-soc-bg/50">
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                incident.severity === 'Critical' ? 'bg-soc-red/10 text-soc-red' : 
                incident.severity === 'Medium' ? 'bg-soc-yellow/10 text-soc-yellow' : 'bg-soc-cyan/10 text-soc-cyan'
              }`}>
                {incident.severity}
              </span>
              <h2 className="text-xl font-bold font-syne">Incident #{incident.id}</h2>
              <span className="text-soc-muted text-sm">{new Date(incident.created_at || incident.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              {onForensics && (
                <button 
                  onClick={() => onForensics(incident)} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-soc-cyan/10 text-soc-cyan hover:bg-soc-cyan/20 rounded-lg text-xs font-bold transition-colors border border-soc-cyan/30"
                >
                  <SearchCode className="w-4 h-4" />
                  Forensics
                </button>
              )}
              <button onClick={onClose} className="p-2 hover:bg-soc-border rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Episodic Memory & Self-Hardening Context */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-soc-purple/5 border border-soc-purple/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-soc-purple text-xs font-bold uppercase tracking-widest">
                  <Database className="w-4 h-4" />
                  Episodic Memory
                </div>
                <p className="text-xs text-soc-text/80">
                  This attack fingerprint has been embedded into the Vector DB. Future similar patterns will trigger immediate autonomous remediation.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-soc-cyan/5 border border-soc-cyan/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-soc-cyan text-xs font-bold uppercase tracking-widest">
                  <Zap className="w-4 h-4" />
                  Self-Hardening
                </div>
                <p className="text-xs text-soc-text/80">
                  Detection Layer 4 has been auto-strengthened based on this event. The system is now more resilient to this specific attack vector.
                </p>
              </div>
            </section>

            {/* Log Details */}
            <section>
              <h3 className="text-sm font-bold text-soc-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Log Context
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Source IP', value: incident.source_ip, mono: true },
                  { label: 'Username', value: incident.username },
                  { label: 'Event Type', value: incident.event_type, capitalize: true },
                  { label: 'Status Code', value: incident.status_code },
                  { label: 'Geo Region', value: incident.geo_country || 'Unknown' },
                  { label: 'Port', value: incident.port || payload?.port || 'N/A' },
                ].map((item, i) => (
                  <div key={i} className="bg-soc-bg p-3 rounded-xl border border-soc-border">
                    <div className="text-[10px] text-soc-muted uppercase font-bold mb-1">{item.label}</div>
                    <div className={`text-sm font-semibold ${item.mono ? 'font-mono text-soc-cyan' : ''} ${item.capitalize ? 'capitalize' : ''}`}>
                      {item.value}
                    </div>
                  </div>
                ))}
                {details && (
                  <div className="bg-soc-bg p-3 rounded-xl border border-soc-border col-span-2 md:col-span-3">
                    <div className="text-[10px] text-soc-muted uppercase font-bold mb-1">Action / Details</div>
                    <div className="text-sm font-mono text-soc-text break-all whitespace-pre-wrap flex items-start gap-2">
                      <div className="shrink-0 mt-0.5">
                        {detailsType === "command" && <span className="text-soc-yellow px-1.5 py-0.5 bg-soc-yellow/10 rounded border border-soc-yellow/20 text-[10px] font-bold">CMD</span>}
                        {detailsType === "file" && <span className="text-soc-purple px-1.5 py-0.5 bg-soc-purple/10 rounded border border-soc-purple/20 text-[10px] font-bold">FS</span>}
                        {detailsType === "network" && <span className="text-soc-cyan px-1.5 py-0.5 bg-soc-cyan/10 rounded border border-soc-cyan/20 text-[10px] font-bold">NET</span>}
                      </div>
                      <span className="opacity-90">{details}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* AI Analysis (Anomaly) */}
            <section>
              <h3 className="text-sm font-bold text-soc-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Anomaly Detection
              </h3>
              <div className="bg-soc-bg p-5 rounded-xl border border-soc-border">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-soc-muted uppercase tracking-widest">Anomaly Score</span>
                  <span className={`text-xl font-bold font-mono ${
                    (incident.score || 0) > 0.8 ? 'text-soc-red drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 
                    (incident.score || 0) > 0.5 ? 'text-soc-yellow drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 
                    'text-soc-cyan drop-shadow-[0_0_8px_rgba(0,229,192,0.8)]'
                  }`}>
                    {Math.round((incident.score || 0) * 100)}%
                  </span>
                </div>
                <div className="flex gap-1 h-3 w-full mb-6">
                  {[...Array(10)].map((_, i) => {
                    const threshold = (i + 1) * 10;
                    const score = (incident.score || 0) * 100;
                    const isActive = score >= threshold;
                    
                    let colorClass = 'bg-soc-border';
                    let shadowClass = '';
                    
                    if (isActive) {
                      if (score > 80) {
                        colorClass = 'bg-soc-red';
                        shadowClass = 'shadow-[0_0_10px_rgba(239,68,68,0.6)]';
                      } else if (score > 50) {
                        colorClass = 'bg-soc-yellow';
                        shadowClass = 'shadow-[0_0_10px_rgba(234,179,8,0.6)]';
                      } else {
                        colorClass = 'bg-soc-cyan';
                        shadowClass = 'shadow-[0_0_10px_rgba(0,229,192,0.6)]';
                      }
                    }

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex-1 rounded-sm ${colorClass} ${shadowClass} transition-all duration-500`}
                        style={{ opacity: isActive ? 1 : 0.2 }}
                      />
                    );
                  })}
                </div>
                <p className="text-sm text-soc-text leading-relaxed">
                  {incident.reason || "Pattern analysis indicates unusual activity from this source. Multiple features deviate from baseline behavior."}
                </p>
              </div>
            </section>

            {/* AI Agent Analysis (LangGraph) */}
            <section>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-soc-cyan uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4" /> {/* Or some other icon */}
                    Agentic Analysis (LangGraph)
                  </h3>
                  {!agentAnalysis && (
                      <button 
                         onClick={handleRunAgent}
                         disabled={isRunningAgent}
                         className="flex items-center gap-2 px-3 py-1.5 bg-soc-cyan/10 text-soc-cyan hover:bg-soc-cyan/20 rounded-lg text-xs font-bold transition-colors border border-soc-cyan/30 disabled:opacity-50"
                      >
                          <Play className="w-4 h-4" />
                          {isRunningAgent ? "Running..." : "Run AI Investigation"}
                      </button>
                  )}
              </div>

              {agentAnalysis && (
                  <div className="bg-soc-bg p-5 rounded-xl border border-soc-cyan/30 space-y-6">
                      <div>
                          <h4 className="text-xs font-bold text-soc-muted uppercase mb-2">Executive Summary</h4>
                          <p className="text-sm text-soc-text leading-relaxed">{agentAnalysis.summary}</p>
                      </div>

                      {agentAnalysis.mitre && agentAnalysis.mitre.length > 0 && (
                          <div>
                              <h4 className="text-xs font-bold text-soc-muted uppercase mb-2">MITRE ATT&CK Matrix</h4>
                              <div className="flex flex-wrap gap-2">
                                  {agentAnalysis.mitre.map((m: any, idx: number) => (
                                      <div key={idx} className="px-3 py-2 bg-soc-purple/10 border border-soc-purple/30 rounded-lg flex flex-col">
                                          <span className="text-xs font-bold text-soc-purple">{m.technique} - {m.name}</span>
                                          <span className="text-[10px] text-soc-muted">Confidence: {Math.round(m.confidence * 100)}%</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {agentAnalysis.attack_path && agentAnalysis.attack_path.length > 0 && (
                          <div>
                              <h4 className="text-xs font-bold text-soc-muted uppercase mb-2">Attack Path</h4>
                              <div className="space-y-2">
                                  {agentAnalysis.attack_path.map((path: any, idx: number) => (
                                      <div key={idx} className="flex gap-3 text-sm border-l-2 border-soc-cyan/50 pl-3 py-1">
                                          <span className="font-bold text-soc-cyan min-w-[120px]">{path.stage}</span>
                                          <span className="text-soc-text/80">{path.description}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {agentAnalysis.autonomous_action_recommendation && agentAnalysis.autonomous_action_recommendation.action && (
                         <div className="p-3 bg-soc-red/10 border border-soc-red/30 rounded-lg">
                              <h4 className="text-xs font-bold text-soc-red uppercase mb-1 flex items-center gap-2">
                                  <ShieldAlert className="w-3 h-3" />
                                  Autonomous Recommendation
                              </h4>
                              <div className="text-sm text-soc-text flex justify-between">
                                 <span>{agentAnalysis.autonomous_action_recommendation.action}</span>
                                 <span className="font-mono text-soc-red">Conf: {Math.round((agentAnalysis.autonomous_action_recommendation.confidence || 0) * 100)}%</span>
                              </div>
                         </div>
                      )}
                  </div>
              )}
            </section>

            {/* Mitigations */}
            {mitigations.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-soc-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ListChecks className="w-4 h-4" />
                  Recommended Mitigations
                </h3>
                <div className="space-y-2">
                  {mitigations.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-soc-bg rounded-xl border border-soc-border">
                      <div className="w-5 h-5 rounded-full bg-soc-cyan/20 text-soc-cyan flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{step}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Raw Payload */}
            <section>
              <button
                onClick={() => setShowPayload(!showPayload)}
                className="w-full flex items-center justify-between p-4 bg-soc-bg rounded-xl border border-soc-border hover:bg-soc-border transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Code className="w-4 h-4" />
                  Raw Payload Data
                </div>
                <span className="text-xs text-soc-muted">{showPayload ? 'Hide' : 'Show'}</span>
              </button>
              {showPayload && (
                <pre className="mt-2 p-4 bg-black text-soc-green font-mono text-xs rounded-xl overflow-x-auto border border-soc-border">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              )}
            </section>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-soc-border bg-soc-bg/50 flex flex-wrap gap-3">
            <button
              onClick={() => onAskAI(incident)}
              className="flex-[2] min-w-[200px] flex items-center justify-center gap-2 py-3 bg-soc-purple text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
            >
              <MessageSquare className="w-5 h-5" />
              Ask AI About This
            </button>
            <button
              onClick={handleIsolateEndpoint}
              disabled={isIsolating}
              className={`flex-1 min-w-[170px] flex items-center justify-center gap-2 py-3 font-bold rounded-xl transition-all ${
                incident.severity === 'Critical'
                  ? 'bg-soc-red/20 text-soc-red hover:bg-soc-red/40 border border-soc-red/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : 'bg-soc-surface border border-soc-border hover:bg-soc-border text-soc-text'
              } disabled:opacity-50`}
            >
              <ShieldOff className="w-5 h-5" />
              {isIsolating ? 'Isolating...' : 'Isolate Endpoint'}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-soc-border hover:bg-soc-muted/20 text-soc-text font-bold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
