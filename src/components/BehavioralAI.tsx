import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { motion } from 'motion/react';
import { ShieldAlert, ShieldCheck, Activity, CheckCircle, XCircle, Brain, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function BehavioralAI() {
  const [anomalies, setAnomalies] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [isLearning, setIsLearning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [anomaliesRes, baselinesRes, statusRes] = await Promise.all([
        api.getBehavioralAnomalies(),
        api.getBehavioralBaselines(),
        api.getBehavioralStatus()
      ]);
      setAnomalies(anomaliesRes.data);
      setBaselines(baselinesRes.data);
      setIsLearning(statusRes.data.isLearningMode);
    } catch (e) {
      toast.error('Failed to load Behavioral AI data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleMode = async () => {
    try {
      const res = await api.setBehavioralMode(!isLearning);
      setIsLearning(res.data.isLearningMode);
      toast.success(res.data.isLearningMode ? 'Learning mode enabled. AI is currently building baselines.' : 'Protection mode enabled. AI is now blocking deviations.');
    } catch (e) {
      toast.error('Failed to toggle mode');
    }
  };

  const handleReview = async (id: number, action: 'confirm' | 'dismiss') => {
    try {
      await api.reviewBehavioralAnomaly(id, action);
      toast.success(action === 'confirm' ? 'Anomaly confirmed. Alert escalated.' : 'Anomaly dismissed as false positive.');
      fetchData(); // Refresh to update list
    } catch (e) {
      toast.error('Failed to review anomaly');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Brain className="w-12 h-12 text-soc-cyan animate-pulse" />
          <p className="text-soc-muted font-mono animate-pulse">Loading Behavioral AI Matrix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-soc-cyan to-soc-purple flex items-center gap-3">
            <Brain className="w-8 h-8 text-soc-cyan" />
            Self-Learning Behavioral AI
          </h2>
          <p className="text-soc-muted mt-2 font-mono text-sm max-w-2xl">
            Adaptive endpoint defense layer. Employs statistical moving averages and automated Z-score anomaly detection to identify unseen executables or heavy deviations from normal activity profiles without hardcoded signatures.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
             onClick={fetchData}
             className="px-3 py-2 bg-soc-surface rounded flex items-center hover:bg-soc-surface/80"
          >
            <RefreshCw className="w-5 h-5 text-soc-cyan" />
          </button>

          <button
            onClick={handleToggleMode}
            className={`px-6 py-3 rounded-lg border-2 font-bold font-mono tracking-widest transition-all duration-300 flex items-center gap-2 shadow-lg ${
              isLearning 
                ? 'bg-soc-cyan/20 border-soc-cyan text-soc-cyan shadow-[0_0_15px_rgba(0,229,192,0.3)]' 
                : 'bg-soc-purple/20 border-soc-purple text-soc-purple shadow-[0_0_15px_rgba(139,92,246,0.3)]'
            }`}
          >
            {isLearning ? <Activity className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            {isLearning ? 'LEARNING MODE' : 'PROTECTION MODE'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 border border-soc-border/50 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-soc-purple"></div>
          <h3 className="text-xl font-bold mb-4 font-syne text-soc-text flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-soc-red" />
            Detected Anomalies
          </h3>
          <div className="overflow-y-auto max-h-96 pr-2 custom-scrollbar space-y-4">
            {anomalies.length === 0 ? (
              <div className="text-center py-8 text-soc-muted">No anomalies detected recently.</div>
            ) : (
              anomalies.map((anom: any) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={anom.id} 
                  className={`p-4 rounded-lg border ${
                    anom.risk_level === 'High' ? 'bg-soc-red/10 border-soc-red/30' : 'bg-soc-yellow/10 border-soc-yellow/30'
                  } ${anom.is_reviewed ? 'opacity-50' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-mono font-bold text-lg text-soc-text">{anom.process_name}</div>
                    <div className="text-xs text-soc-muted">{new Date(anom.timestamp).toLocaleString()}</div>
                  </div>
                  <p className="text-sm text-soc-muted mb-4">{anom.explanation}</p>
                  
                  {!anom.is_reviewed && (
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => handleReview(anom.id, 'dismiss')}
                        className="px-3 py-1 flex items-center gap-1 bg-soc-surface hover:bg-soc-surface/80 rounded border border-soc-border text-xs transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-soc-yellow" /> Dismiss
                      </button>
                      <button 
                         onClick={() => handleReview(anom.id, 'confirm')}
                        className="px-3 py-1 flex items-center gap-1 bg-soc-red/20 hover:bg-soc-red/30 rounded border border-soc-red text-soc-red text-xs transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" /> Confirm Threat
                      </button>
                    </div>
                  )}
                  {anom.is_reviewed && (
                    <div className="text-xs text-right mt-2 font-mono text-soc-muted italic">
                      {anom.is_false_positive ? 'Dismissed as false positive' : 'Confirmed as threat'}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel p-6 border border-soc-border/50 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-soc-cyan"></div>
          <h3 className="text-xl font-bold mb-4 font-syne text-soc-text flex items-center gap-2">
            <Activity className="w-5 h-5 text-soc-cyan" />
            Behavioral Baselines
          </h3>
          <div className="overflow-x-auto overflow-y-auto max-h-96 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-soc-border text-soc-muted font-mono text-xs">
                  <th className="py-2 px-3 tracking-wider">Process</th>
                  <th className="py-2 px-3 tracking-wider">Avg CPU</th>
                  <th className="py-2 px-3 tracking-wider">Avg Mem</th>
                  <th className="py-2 px-3 tracking-wider">Executions</th>
                  <th className="py-2 px-3 tracking-wider">Last Seen</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {baselines.map((base: any) => (
                  <tr key={base.id} className="border-b border-soc-border/50 hover:bg-soc-surface/30">
                    <td className="py-3 px-3 font-mono text-soc-cyan max-w-[150px] truncate">{base.process_name}</td>
                    <td className="py-3 px-3">{base.avg_cpu.toFixed(2)}%</td>
                    <td className="py-3 px-3">{base.avg_mem.toFixed(2)}%</td>
                    <td className="py-3 px-3">{base.exec_count}</td>
                    <td className="py-3 px-3 text-xs text-soc-muted">{new Date(base.last_seen).toLocaleTimeString()}</td>
                  </tr>
                ))}
                {baselines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-soc-muted">No baselines formed yet. Enable Learning Mode to start accumulating profiles.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
