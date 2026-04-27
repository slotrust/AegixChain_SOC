import React, { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { ShieldAlert, Crosshair, HelpCircle, Activity, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function MitreAttackChain() {
  const { data, error } = usePolling(() => api.getMitreTimeline(), 5000);
  const timeline = Array.isArray(data) ? data : [];
  const [selectedTechnique, setSelectedTechnique] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

  const fetchDetails = async (id: string) => {
    if (selectedTechnique === id) {
      setSelectedTechnique(null);
      setDetails(null);
      return;
    }
    
    setSelectedTechnique(id);
    try {
      const res = await api.getMitreDetails(id);
      setDetails(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-soc-border">
        <div>
          <h3 className="text-xl font-bold font-syne text-soc-purple flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-soc-purple" />
            AI Attack Pattern Recognition
          </h3>
          <p className="text-xs text-soc-muted font-mono mt-1">Real-time MITRE ATT&CK Mapping</p>
        </div>
        <div className="flex gap-4 items-center">
           <div className="text-right">
             <div className="text-2xl font-bold font-mono text-soc-cyan">{timeline.length}</div>
             <div className="text-[10px] uppercase tracking-widest text-soc-muted">Mapped Techniques</div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel p-4 rounded-xl border border-soc-border/50">
             <h4 className="text-xs font-mono font-bold text-soc-muted uppercase tracking-widest mb-4">Attack Chain View</h4>
             
             {timeline.length === 0 ? (
               <div className="text-center p-8 text-soc-muted font-mono text-sm border border-soc-border border-dashed rounded-xl">
                 No attack patterns recognized yet. Waiting for system events.
               </div>
             ) : (
                <div className="flex flex-col relative space-y-4">
                  <div className="absolute left-[39px] top-4 bottom-4 w-px bg-soc-border/30 z-0"></div>
                  <AnimatePresence>
                    {timeline.map((event: any, idx: number) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex gap-4 relative z-10"
                      >
                         <div className="mt-2 w-[80px] text-right shrink-0 pr-4">
                            <div className="text-[10px] font-mono text-soc-muted">{new Date(event.timestamp).toLocaleTimeString()}</div>
                         </div>
                         <div className="w-4 h-4 rounded-full bg-soc-bg border-2 border-soc-purple mt-2.5 shrink-0"></div>
                         
                         <div 
                           className={`flex-1 p-3 rounded-lg border transition-colors cursor-pointer \${selectedTechnique === event.technique_id ? 'bg-soc-purple/10 border-soc-purple' : 'bg-black/40 border-soc-border hover:border-soc-purple/50'}`}
                           onClick={() => fetchDetails(event.technique_id)}
                         >
                           <div className="flex justify-between items-start">
                             <div>
                                <div className="text-xs font-mono font-bold text-soc-purple uppercase tracking-widest mb-1">{event.tactic}</div>
                                <div className="font-bold text-soc-text text-sm flex items-center gap-2">
                                  {event.technique_id}: {event.technique_name}
                                </div>
                             </div>
                             <div className={`px-2 py-1 text-[10px] rounded border font-mono \${event.confidence > 0.8 ? 'bg-soc-red/20 text-soc-red border-soc-red/30' : 'bg-soc-yellow/20 text-soc-yellow border-soc-yellow/30'}`}>
                                {Math.round(event.confidence * 100)}% Match
                             </div>
                           </div>
                         </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
             )}
          </div>
        </div>

        <div className="space-y-4">
           {details ? (
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass-panel p-6 rounded-xl border border-soc-purple/30 bg-soc-purple/5"
             >
                <div className="text-[10px] font-mono text-soc-purple tracking-widest uppercase mb-1">Technique Details</div>
                <h4 className="text-xl font-bold text-soc-text font-syne flex items-center gap-2 mb-4">
                  {details.id}
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] text-soc-muted uppercase tracking-widest">Tactic</div>
                    <div className="text-sm font-mono font-bold text-soc-cyan">{details.tactic}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-soc-muted uppercase tracking-widest">Name</div>
                    <div className="text-sm font-bold text-soc-text">{details.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-soc-muted uppercase tracking-widest">Description</div>
                    <div className="text-sm text-soc-muted mt-1 leading-relaxed">
                      {details.description}
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-soc-border">
                    <a 
                      href={`https://attack.mitre.org/techniques/\${details.id.replace('.', '/')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-soc-purple hover:text-white flex items-center gap-1 transition-colors"
                    >
                      View full MITRE ATT&CK definition <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
             </motion.div>
           ) : (
             <div className="glass-panel p-6 rounded-xl border border-soc-border/50 h-[300px] flex flex-col items-center justify-center text-center">
                <HelpCircle className="w-10 h-10 text-soc-muted mb-4 opacity-50" />
                <div className="text-sm text-soc-muted font-mono">
                  Select a technique from the attack chain to view MITRE ATT&CK details
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
