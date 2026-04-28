import React, { useEffect, useRef } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Brain, ShieldAlert, Cpu, Activity, CheckCircle2, AlertTriangle, Zap, FileText, X, Skull, Volume2, VolumeX, Globe, Database, Server, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import MultiAgentDashboard from './MultiAgentDashboard';
import BehavioralAI from './BehavioralAI';
import ThreatMemory from './ThreatMemory';
import MitreAttackChain from './MitreAttackChain';
import CrossLayerCorrelation from './CrossLayerCorrelation';

export default function NovaBrain() {
  const { data: history } = usePolling(() => api.getNovaHistory(), 2000);
  const [selectedReport, setSelectedReport] = React.useState<string | null>(null);
  const [isHackerMode, setIsHackerMode] = React.useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = React.useState(false);
  const lastAlertId = useRef<string | null>(null);
  
  const events = Array.isArray(history) ? history : [];

  // Nova Voice: TTS for critical alerts
  useEffect(() => {
    if (!isVoiceEnabled || events.length === 0) return;
    const latest = events[0];
    if (latest.event?.severity === 'Critical' && latest.event?.id !== lastAlertId.current) {
      lastAlertId.current = latest.event.id;
      const utterance = new SpeechSynthesisUtterance(`Critical Alert detected: ${latest.event.reason}`);
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }, [events, isVoiceEnabled]);

  return (
    <div className={`space-y-6 max-w-6xl mx-auto transition-all duration-500 ${isHackerMode ? 'grayscale invert brightness-150' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-soc-purple to-soc-cyan flex items-center gap-3">
            <Brain className="w-8 h-8 text-soc-purple" />
            AEGIX AI Brain
          </h2>
          <p className="text-soc-muted mt-1 font-mono text-sm">Episodic Threat Memory & Layered Self-Hardening</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-2 rounded-lg border transition-all ${isVoiceEnabled ? 'bg-soc-purple/20 border-soc-purple text-soc-purple' : 'bg-soc-bg border-soc-border text-soc-muted'}`}
            title="Toggle Nova Voice"
          >
            {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsHackerMode(!isHackerMode)}
            className={`p-2 rounded-lg border transition-all ${isHackerMode ? 'bg-soc-red/20 border-soc-red text-soc-red' : 'bg-soc-bg border-soc-border text-soc-muted'}`}
            title="Toggle Hacker Perspective"
          >
            <Skull className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Multi-Agent & Behavioral Engine Layers */}
      <div className="space-y-12">
        <MultiAgentDashboard />
        <div className="h-px bg-soc-border/50 shrink-0"></div>
        <CrossLayerCorrelation />
        <div className="h-px bg-soc-border/50 shrink-0"></div>
        
        <ThreatMemory />
        <div className="h-px bg-soc-border/50 shrink-0"></div>
        <MitreAttackChain />
        <div className="h-px bg-soc-border/50 shrink-0"></div>
        <BehavioralAI />
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedReport(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[80vh] flex flex-col glass-panel rounded-xl border border-soc-cyan/30 shadow-[0_0_30px_rgba(0,229,192,0.15)] overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
                <h3 className="font-syne font-bold text-soc-cyan flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Post-Incident Report
                </h3>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors text-soc-muted hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="markdown-body prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                  <Markdown>{selectedReport}</Markdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
