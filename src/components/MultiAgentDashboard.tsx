import { safeStorage } from "../utils/storage";
import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'motion/react';
import { Network, Database, Brain, Sparkles, Shield, Activity, Share2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MultiAgentDashboard() {
  const [history, setHistory] = useState<any[]>([]);
  const [eventStream, setEventStream] = useState<EventSource | null>(null);

  useEffect(() => {
    fetchHistory();
    
    // Connect to SSE
    let token = safeStorage.getItem('soc_token');
    if (token === "null" || token === "undefined") {
      token = null;
    }
    const es = new EventSource(`/api/multi-agent/stream${token ? `?token=${token}` : ''}`);
    
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setHistory(prev => [msg, ...prev].slice(0, 100));
        toast.success(`Agent ${msg.source} sent message to ${msg.target}!`, {
            icon: '🤖',
            duration: 2000
        });
      } catch(e) {}
    };

    setEventStream(es);

    return () => {
      es.close();
    };
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await api.getMultiAgentHistory();
      setHistory(res.data);
    } catch(e) {
      toast.error('Failed to fetch multi-agent history');
    }
  };

  const getAgentIcon = (agent: string) => {
    switch(agent) {
      case 'Collector': return <Database className="w-5 h-5 text-soc-cyan" />;
      case 'Analyst': return <Activity className="w-5 h-5 text-soc-yellow" />;
      case 'LLM': return <Brain className="w-5 h-5 text-soc-purple" />;
      case 'Response': return <Shield className="w-5 h-5 text-soc-red" />;
      default: return <Share2 className="w-5 h-5 text-soc-muted" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-soc-cyan via-soc-purple to-soc-pink flex items-center gap-3">
            <Network className="w-8 h-8 text-soc-cyan" />
            Multi-Agent SOC Collaboration
          </h2>
          <p className="text-soc-muted mt-2 font-mono text-sm max-w-2xl">
            Real-time pipeline of specialized AI agents working autonomously. The Collector streams system metrics, Analyst checks baselines, LLM provides forensic conclusions, and Response dynamically patches or blocks threats.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        {/* Agent Cards */}
        {['Collector', 'Analyst', 'LLM', 'Response'].map(agent => (
           <div key={agent} className="glass-panel p-4 rounded-xl flex items-center gap-4 relative overflow-hidden border border-soc-border/50">
             <div className="p-3 bg-soc-surface rounded-lg">
                {getAgentIcon(agent)}
             </div>
             <div>
               <h4 className="font-bold text-soc-text font-syne">{agent} Agent</h4>
               <div className="text-xs text-soc-cyan uppercase font-mono animate-pulse">Online & Ready</div>
             </div>
           </div>
        ))}
      </div>

      <div className="glass-panel rounded-xl border border-soc-border/50 overflow-hidden">
        <div className="bg-soc-surface/50 p-4 border-b border-soc-border/50 flex justify-between items-center">
            <h3 className="font-bold text-lg flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-soc-cyan" />
               Agent Message Bus / Live Feed
            </h3>
            <span className="text-xs font-mono text-soc-muted border border-soc-border px-2 py-1 rounded bg-soc-surface">SSE CONNECTED</span>
        </div>
        <div className="p-6">
           <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
             <AnimatePresence>
                {history.map((msg, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={msg.id || i}
                    className="border border-soc-border/50 bg-soc-surface/30 rounded-lg p-4 flex flex-col gap-2 relative"
                  >
                     <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 font-mono text-xs">
                                {getAgentIcon(msg.source)}
                                <span className="font-bold text-soc-text ml-1">{msg.source}</span>
                            </div>
                            <span className="text-soc-muted">→</span>
                            <div className="flex items-center gap-1 font-mono text-xs">
                                {getAgentIcon(msg.target)}
                                <span className="font-bold text-soc-text ml-1">{msg.target}</span>
                            </div>
                         </div>
                         <div className="text-xs font-mono text-soc-muted">{new Date(msg.timestamp).toLocaleString()}</div>
                     </div>
                     <div className="bg-soc-background rounded p-3 text-sm font-mono text-soc-muted overflow-x-auto border border-soc-border border-dashed mt-2">
                         <pre>{JSON.stringify(msg.payload, null, 2)}</pre>
                     </div>
                     {msg.confidence !== undefined && msg.confidence > 0 && (
                         <div className="absolute top-4 right-[150px] text-xs font-bold px-2 py-0.5 rounded bg-soc-red/20 text-soc-red border border-soc-red/50">
                             Risk / Conf: {(msg.confidence * 100).toFixed(0)}%
                         </div>
                     )}
                  </motion.div>
                ))}
             </AnimatePresence>
             {history.length === 0 && (
                 <div className="text-center text-soc-muted py-10 opacity-60 flex flex-col items-center">
                    <Activity className="w-10 h-10 mb-3 animate-bounce" />
                    Waiting for real-time telemetry to trigger Multi-Agent cascade...
                 </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
