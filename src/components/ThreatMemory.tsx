import React, { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Database, Check, X, ShieldAlert, Cpu, Globe, Crosshair, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

export default function ThreatMemory() {
  const { data, refresh } = usePolling(() => api.getMemoryHistory(), 5000);
  const history = Array.isArray(data) ? data : [];
  const [filter, setFilter] = useState('All');
  const [selectedThreat, setSelectedThreat] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const handleFeedback = async (id: number, verdict: string) => {
    try {
      await api.updateMemoryFeedback(id, verdict);
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleThreatClick = async (threat: any) => {
    setSelectedThreat(threat);
    setIsGenerating(true);
    setAiSummary('');
    try {
       const res = await api.askAssistant(`Summarize this threat memory incident clearly: \n\n Threat: ${threat.threat_type}\n Target: ${threat.ip_address || threat.process_name}\n Findings: ${threat.patterns || 'Anomalous behaviour detected'}\n Action: ${threat.action_taken}`);
       setAiSummary(res.data.reply || res.data || "Summary generated successfully based on threat memory engine data.");
    } catch (error) {
       console.error("AI summary error: ", error);
       setAiSummary("*Error generating detailed AI summary for this threat.*");
    } finally {
       setIsGenerating(false);
    }
  };

  const filteredHistory = filter === 'All' 
    ? history 
    : filter === 'Action Taken'
      ? history.filter(h => h.action_taken !== 'Logged')
      : history.filter(h => h.threat_type === filter);

  return (
    <div className="space-y-4">
       <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-soc-border">
         <div>
           <h3 className="text-xl font-bold font-syne text-soc-cyan flex items-center gap-2">
             <Database className="w-5 h-5 text-soc-cyan" />
             Threat Memory Engine
           </h3>
           <p className="text-xs text-soc-muted font-mono mt-1">Adaptive Decision Matrix & Historical Threat Store</p>
         </div>
         <div className="flex gap-4 items-center">
            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-soc-purple">{history.length}</div>
              <div className="text-[10px] uppercase tracking-widest text-soc-muted">Stored Threat Signatures</div>
            </div>
            <div className="px-4 py-2 bg-soc-cyan/10 border border-soc-cyan/30 rounded-lg">
                <div className="text-sm font-bold text-soc-cyan">Auto-Learning</div>
                <div className="text-xs text-soc-muted">Enabled</div>
            </div>
         </div>
       </div>

       <div className="flex gap-2 mb-4">
         {['All', 'network', 'process', 'Action Taken'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors \${
                 filter === f ? 'bg-soc-cyan/20 text-soc-cyan border border-soc-cyan/30' : 'bg-soc-bg border border-soc-border text-soc-muted'
              }`}
            >
              {f.toUpperCase()}
            </button>
         ))}
       </div>

       <div className="grid gap-3">
         <AnimatePresence>
           {filteredHistory.map((threat: any) => (
             <motion.div
                key={threat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => handleThreatClick(threat)}
                className="glass-panel p-4 rounded-xl border border-soc-border/50 flex gap-4 items-start cursor-pointer hover:border-soc-purple/50 transition-all shadow-[0_0_10px_rgba(168,85,247,0.05)] hover:bg-soc-purple/5"
             >
                <div className={`p-2 rounded-lg \${threat.user_feedback === 'malicious' ? 'bg-soc-red/20 text-soc-red' : threat.user_feedback === 'safe' ? 'bg-soc-green/20 text-soc-green' : 'bg-soc-yellow/20 text-soc-yellow'}`}>
                    {threat.threat_type === 'network' ? <Globe className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
                </div>

                <div className="flex-1 space-y-2 pointer-events-none">
                   <div className="flex justify-between">
                     <div>
                       <span className="text-xs font-mono text-soc-muted">{new Date(threat.last_seen).toLocaleString()}</span>
                       <h4 className="font-bold text-soc-text text-sm mt-1">
                         {threat.threat_type === 'network' ? threat.ip_address : threat.process_name}
                       </h4>
                     </div>
                     <div className="text-right">
                       <span className={`px-2 py-1 text-[10px] rounded border font-mono \${
                         threat.risk_level === 'High' ? 'bg-soc-red/20 text-soc-red border-soc-red/30' : 'bg-soc-yellow/20 text-soc-yellow border-soc-yellow/30'
                       }`}>
                         {threat.risk_level} RISK
                       </span>
                     </div>
                   </div>

                   <div className="grid grid-cols-3 gap-4 bg-black/40 p-2 rounded border border-white/5">
                     <div>
                       <div className="text-[10px] text-soc-muted uppercase tracking-widest">Occurrences</div>
                       <div className="text-xs font-mono font-bold text-soc-text">{threat.occurrences}</div>
                     </div>
                     <div>
                       <div className="text-[10px] text-soc-muted uppercase tracking-widest">Agent Confidence</div>
                       <div className="text-xs font-mono font-bold text-soc-purple">{Math.round(threat.agent_confidence * 100)}%</div>
                     </div>
                     <div>
                       <div className="text-[10px] text-soc-muted uppercase tracking-widest">Action Taken</div>
                       <div className="text-xs font-mono font-bold text-soc-cyan truncate">{threat.action_taken}</div>
                     </div>
                   </div>
                </div>

                <div className="flex flex-col gap-2 border-l border-soc-border pl-4">
                  <div className="text-[10px] text-soc-muted uppercase tracking-widest text-center mb-1">Feedback Loop</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFeedback(threat.id, 'safe'); }}
                    className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors \${
                      threat.user_feedback === 'safe' ? 'bg-soc-green/20 border-soc-green text-soc-green' : 'bg-soc-bg border-soc-border text-soc-muted hover:text-soc-green hover:border-soc-green/50'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFeedback(threat.id, 'malicious'); }}
                    className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors \${
                      threat.user_feedback === 'malicious' ? 'bg-soc-red/20 border-soc-red text-soc-red' : 'bg-soc-bg border-soc-border text-soc-muted hover:text-soc-red hover:border-soc-red/50'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
             </motion.div>
           ))}
           {filteredHistory.length === 0 && (
             <div className="text-center p-8 text-soc-muted font-mono text-sm border border-soc-border border-dashed rounded-xl">
               No retained threat memories found.
             </div>
           )}
         </AnimatePresence>
       </div>

       {/* AI Summary Modal */}
       <AnimatePresence>
         {selectedThreat && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="glass-panel bg-soc-surface border border-soc-border rounded-xl w-full max-w-2xl overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.8)]"
             >
               <div className="p-4 border-b border-soc-border flex justify-between items-center bg-soc-purple/10">
                 <h3 className="font-syne font-bold text-soc-purple flex items-center gap-2">
                   <Database className="w-5 h-5" />
                   Aegix AI Memory Analysis
                 </h3>
                 <button onClick={() => setSelectedThreat(null)} className="p-1 text-soc-muted hover:text-white rounded-md hover:bg-white/10 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="p-6">
                 <div className="bg-black/40 border border-soc-border rounded-lg p-4 mb-4">
                    <p className="text-xs text-soc-muted uppercase tracking-widest mb-1">Target Identified:</p>
                    <p className="text-soc-text font-mono text-sm">{selectedThreat.threat_type === 'network' ? selectedThreat.ip_address : selectedThreat.process_name}</p>
                 </div>
                 
                 <div className="bg-soc-surface p-4 rounded-xl border border-soc-border/50 shadow-inner">
                    <h4 className="text-xs font-bold text-soc-cyan uppercase tracking-widest mb-3 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Comprehensive AI Summary
                    </h4>
                    {isGenerating ? (
                      <div className="flex items-center gap-3 text-soc-muted text-sm py-4">
                        <RefreshCw className="w-4 h-4 animate-spin text-soc-purple" />
                        Aegix AI is generating memory context...
                      </div>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed text-soc-text">
                         <Markdown>{aiSummary}</Markdown>
                      </div>
                    )}
                 </div>
               </div>
               
               <div className="p-4 border-t border-soc-border bg-soc-bg flex justify-end">
                 <button onClick={() => setSelectedThreat(null)} className="px-4 py-2 rounded-lg bg-soc-surface border border-soc-border hover:bg-soc-border text-sm text-soc-text transition-colors">
                   Close Analysis
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
  );
}
