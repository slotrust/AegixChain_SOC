import React, { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Link, Layers, BrainCircuit, Activity, FileText, Cpu, ChevronRight, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CrossLayerCorrelation() {
  const { data, error } = usePolling(() => api.getCorrelatedThreats(), 5000);
  const threats = Array.isArray(data) ? data : [];
  const [selectedThreat, setSelectedThreat] = useState<number | null>(null);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'process': return <Cpu className="w-4 h-4" />;
      case 'network': return <Activity className="w-4 h-4" />;
      case 'file': return <FileText className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-soc-border">
        <div>
          <h3 className="text-xl font-bold font-syne text-soc-cyan flex items-center gap-2">
            <Layers className="w-5 h-5 text-soc-cyan" />
            Cross-Layer Correlation Engine
          </h3>
          <p className="text-xs text-soc-muted font-mono mt-1">Multi-stage event correlation & attack chain analysis</p>
        </div>
        <div className="flex gap-4 items-center">
           <div className="text-right">
             <div className="text-2xl font-bold font-mono text-soc-yellow">{threats.length}</div>
             <div className="text-[10px] uppercase tracking-widest text-soc-muted">Correlated Cases</div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Threat List */}
        <div className="lg:col-span-1 space-y-4">
           {threats.length === 0 ? (
             <div className="text-center p-8 text-soc-muted font-mono text-sm border border-soc-border border-dashed rounded-xl">
               No correlated threats detected yet.
             </div>
           ) : (
             <div className="space-y-3">
                {threats.map((threat: any) => (
                  <div 
                    key={threat.id}
                    onClick={() => setSelectedThreat(threat.id === selectedThreat ? null : threat.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedThreat === threat.id ? 'bg-soc-purple/10 border-soc-purple shadow-[0_0_15px_rgba(147,51,234,0.1)]' : 'bg-black/40 border-soc-border hover:border-soc-purple/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                         <div className={`px-2 py-0.5 text-[9px] rounded font-mono uppercase tracking-widest ${
                           threat.severity === 'Critical' ? 'bg-soc-red/20 text-soc-red border border-soc-red/30' : 'bg-soc-yellow/20 text-soc-yellow border border-soc-yellow/30'
                         }`}>
                           {threat.severity}
                         </div>
                         <div className="text-[10px] text-soc-muted font-mono">
                           {new Date(threat.timestamp).toLocaleTimeString()}
                         </div>
                      </div>
                      <div className="text-xs font-mono font-bold text-soc-cyan">
                        Score: {Math.round(threat.risk_score * 100)}
                      </div>
                    </div>
                    <div className="font-bold text-soc-text text-sm mb-2">
                      {threat.title.split(' | ')[0]}
                    </div>
                    {threat.title.includes(' | ') && (
                       <div className="mt-2 text-xs font-mono bg-black/30 p-2 rounded border border-soc-border/50">
                          {threat.title.split(' | ')[1].split(', ').map((reason: string, i: number) => (
                              <div key={i} className="text-soc-muted mb-1 last:mb-0">
                                - {reason.replace('Reason: ', '')}
                              </div>
                          ))}
                       </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-soc-border/50">
                      <div className="text-[10px] text-soc-muted font-mono">
                        {threat.attack_chain?.length || 0} Linked Events
                      </div>
                      {threat.mitre_tactics && (
                        <div className="text-[10px] text-soc-purple font-mono truncate max-w-[150px]">
                          {threat.mitre_tactics}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        {/* Attack Chain Visualization */}
        <div className="lg:col-span-2">
           <div className="glass-panel p-6 rounded-xl border border-soc-border/50 min-h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <div>
                   <h4 className="text-sm font-mono font-bold text-soc-muted uppercase tracking-widest">Attack Chain Diagram</h4>
                </div>
                {selectedThreat && (
                   <div className="flex items-center gap-2 text-xs font-mono text-soc-purple">
                     <BrainCircuit className="w-4 h-4" />
                     Case #{selectedThreat}
                   </div>
                )}
              </div>

              {!selectedThreat ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-center">
                  <Link className="w-10 h-10 text-soc-muted mb-4 opacity-50" />
                  <div className="text-sm text-soc-muted font-mono">
                    Select a correlated threat case to view its attack chain
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Dynamic render of the selected threat's chain */}
                  {(() => {
                    const threat = threats.find((t: any) => t.id === selectedThreat);
                    if (!threat || !Array.isArray(threat.attack_chain)) return null;
                    
                    return (
                      <div className="flex flex-col md:flex-row items-center gap-4 justify-center py-10 overflow-x-auto px-4">
                         {threat.attack_chain.map((event: any, index: number) => (
                           <React.Fragment key={event.id}>
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.1 }}
                                className="w-48 bg-soc-bg border border-soc-border rounded-xl p-4 shrink-0 relative hover:border-soc-cyan/50 transition-colors"
                              >
                                 <div className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-soc-purple/20 border border-soc-purple flex items-center justify-center text-[10px] font-mono text-soc-purple">
                                   {index + 1}
                                 </div>
                                 <div className="flex items-center gap-2 mb-2 text-soc-cyan">
                                   {getSourceIcon(event.source)}
                                   <div className="text-[10px] uppercase tracking-widest font-mono">
                                     {event.source}
                                   </div>
                                 </div>
                                 
                                 <div className="text-xs font-bold text-soc-text truncate mb-1" title={event.entity}>
                                   {event.entity}
                                 </div>
                                 <div className="text-[10px] text-soc-red font-mono uppercase">
                                   {event.action}
                                 </div>
                                 
                                 <div className="mt-3 pt-3 border-t border-soc-border/50 text-[9px] text-soc-muted font-mono break-all">
                                   {(event.metadata || "").substring(0, 50)}...
                                 </div>
                              </motion.div>
                              
                              {index < threat.attack_chain.length - 1 && (
                                <motion.div 
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: index * 0.1 + 0.05 }}
                                  className="text-soc-border flex items-center justify-center transform rotate-90 md:rotate-0"
                                >
                                  <ChevronRight className="w-6 h-6 text-soc-cyan" />
                                </motion.div>
                              )}
                           </React.Fragment>
                         ))}
                      </div>
                    );
                  })()}
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
