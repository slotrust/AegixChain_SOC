import React, { useState, useMemo } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Activity, AlertTriangle, Search, ArrowUpDown, X, ShieldAlert, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import YaraScanner from './YaraScanner';

export default function ProcessPanel() {
  const { data: processes, loading } = usePolling(() => api.getProcesses(), 3000);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('cpu_percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  
  // AI Analysis State
  const [analyzingPid, setAnalyzingPid] = useState<number | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);

  const filteredAndSortedProcesses = useMemo(() => {
    if (!processes || !Array.isArray(processes)) return [];
    
    // Filter
    let result = processes.filter((proc: any) => {
      const term = searchTerm.toLowerCase();
      return (
        (proc.name && proc.name.toLowerCase().includes(term)) ||
        (proc.pid && proc.pid.toString().includes(term)) ||
        (proc.exe_path && proc.exe_path.toLowerCase().includes(term)) ||
        (proc.status && proc.status.toLowerCase().includes(term))
      );
    });

    // Sort
    result.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'is_suspicious') {
        valA = a.is_suspicious ? 1 : 0;
        valB = b.is_suspicious ? 1 : 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [processes, searchTerm, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleAnalyzeProcess = async (proc: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzingPid(proc.pid);
    try {
      const response = await api.analyzeProcess(proc.pid.toString(), proc.name);
      setSelectedAnalysis(response.data);
    } catch (err: any) {
      console.error("AI Analysis failed:", err);
      // Simulate error format so modal can show it
      setSelectedAnalysis({
        pid: proc.pid,
        process_name: proc.name,
        error: err.response?.data?.error || err.message || "Failed to generate AI analysis."
      });
    } finally {
      setAnalyzingPid(null);
    }
  };

  if (loading && !processes) return <div className="p-8 text-center text-soc-muted">Loading processes...</div>;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-soc-cyan to-soc-purple opacity-50"></div>
      <div className="p-6 border-b border-soc-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-soc-bg/30">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h3 className="font-bold flex items-center gap-2 text-soc-text font-syne">
            <Activity className="w-5 h-5 text-soc-purple" />
            System Processes
          </h3>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-soc-muted group-focus-within:text-soc-purple transition-colors" />
            <input
              type="text"
              placeholder="Search name, PID, or path..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-soc-surface/50 border border-soc-border/50 rounded-xl py-2.5 pl-11 pr-4 text-sm text-soc-text focus:outline-none focus:border-soc-purple/50 focus:ring-1 focus:ring-soc-purple/50 transition-all font-mono"
            />
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-bold text-soc-muted uppercase tracking-widest">Status</span>
            <span className="text-xs text-soc-purple font-mono">LIVE MONITORING</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[500px]">
        <table className="w-full text-left text-sm">
          <thead className="bg-soc-bg/80 backdrop-blur-md text-soc-muted sticky top-0 z-10 border-b border-soc-border/50">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('pid')}>
                <div className="flex items-center gap-1">PID <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-1">Name <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('cpu_percent')}>
                <div className="flex items-center gap-1">CPU % <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('memory_usage')}>
                <div className="flex items-center gap-1">Memory % <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('exe_path')}>
                <div className="flex items-center gap-1">Path <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soc-border/30">
            {filteredAndSortedProcesses.map((proc: any) => (
              <React.Fragment key={proc.pid}>
                <tr
                  onClick={() => setExpandedPid(expandedPid === proc.pid ? null : proc.pid)}
                  className={`transition-all hover:bg-soc-purple/5 group cursor-pointer ${
                    proc.is_suspicious ? 'bg-soc-red/5' : ''
                  } ${expandedPid === proc.pid ? 'bg-soc-purple/10' : ''}`}
                >
                  <td className="px-6 py-4 font-mono text-soc-cyan">{proc.pid}</td>
                  <td className="px-6 py-4 font-medium flex items-center gap-2">
                    {proc.name}
                    {proc.status && proc.status.toLowerCase() !== 'running' && proc.status.toLowerCase() !== 'sleeping' && (
                      <span className="text-soc-muted text-xs font-normal">({proc.status})</span>
                    )}
                    {proc.is_suspicious ? (
                      <AlertTriangle className="w-3 h-3 text-soc-red" />
                    ) : null}
                  </td>
                  <td className={`px-6 py-4 ${(proc.cpu_percent || 0) > 50 ? 'text-soc-yellow' : 'text-soc-muted'}`}>
                    {(proc.cpu_percent || 0).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-soc-muted">
                    {(proc.memory_usage || 0).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tight ${
                      proc.status?.toLowerCase() === 'running' 
                        ? 'border-soc-green/30 bg-soc-green/10 text-soc-green' 
                        : proc.status?.toLowerCase() === 'sleeping'
                        ? 'border-soc-cyan/30 bg-soc-cyan/10 text-soc-cyan'
                        : 'border-soc-muted/30 bg-soc-muted/10 text-soc-muted'
                    }`}>
                      {proc.status?.toLowerCase() === 'sleeping' ? 'IDLE' : proc.status || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-soc-muted truncate max-w-[200px]" title={proc.exe_path}>
                    {proc.exe_path}
                  </td>
                </tr>
                {expandedPid === proc.pid && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-soc-bg/50 border-t border-soc-border/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-soc-muted text-xs uppercase tracking-widest mb-1">Executable Path</div>
                          <div className="font-mono text-soc-text break-all bg-black/30 p-2 rounded border border-soc-border/50">{proc.exe_path || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-soc-muted text-xs uppercase tracking-widest mb-1">User Context</div>
                          <div className="font-mono text-soc-text bg-black/30 p-2 rounded border border-soc-border/50">{proc.user || 'N/A'}</div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-soc-muted text-xs uppercase tracking-widest mb-1">Command Line Arguments</div>
                          <div className="font-mono text-soc-text break-all bg-black/30 p-2 rounded border border-soc-border/50 whitespace-pre-wrap">{proc.cmdline || 'N/A'}</div>
                        </div>
                        
                        <div className="md:col-span-2 pt-2 border-t border-soc-border/30 mt-2">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-soc-muted text-xs uppercase tracking-widest flex items-center gap-2">
                              {proc.is_suspicious ? <AlertTriangle className="w-3 h-3 text-soc-red" /> : null}
                              AI Behavior Analysis
                            </span>
                            <button
                              onClick={(e) => handleAnalyzeProcess(proc, e)}
                              disabled={analyzingPid === proc.pid}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                analyzingPid === proc.pid 
                                  ? 'bg-soc-border text-soc-muted' 
                                  : 'bg-soc-purple/20 border border-soc-purple/30 text-soc-purple hover:bg-soc-purple hover:text-black'
                              }`}
                            >
                              {analyzingPid === proc.pid ? 'Analyzing...' : 'Request AI Assessment'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Process Analysis Modal */}
      <AnimatePresence>
        {selectedAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedAnalysis(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] flex flex-col glass-panel rounded-xl border border-soc-purple/30 shadow-[0_0_30px_rgba(139,92,246,0.15)] overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
                <h3 className="font-syne font-bold text-soc-purple flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  AI Process Assessment: {selectedAnalysis.process_name || 'Unknown'} (PID: {selectedAnalysis.pid})
                </h3>
                <button
                  onClick={() => setSelectedAnalysis(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors text-soc-muted hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6">
                {selectedAnalysis.error ? (
                  <div className="p-4 rounded-lg bg-soc-red/10 border border-soc-red/30 flex gap-3 text-soc-red">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-bold mb-1">Analysis Failed</div>
                      <div className="text-sm font-mono">{selectedAnalysis.error}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-lg">
                      <div>
                        <div className="text-[10px] text-soc-muted uppercase tracking-widest mb-1">OS Status</div>
                        <div className={`font-bold font-syne ${selectedAnalysis.os_status === 'Active' ? 'text-soc-red' : 'text-soc-muted'}`}>
                          {selectedAnalysis.os_status}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-soc-muted uppercase tracking-widest mb-1">Memory Hook Status</div>
                        <div className="font-bold text-soc-yellow font-mono text-sm">
                          {selectedAnalysis.memory_read_status}
                        </div>
                      </div>
                    </div>

                    {selectedAnalysis.command_line && selectedAnalysis.command_line !== 'Unknown' && (
                      <div>
                        <div className="text-[10px] text-soc-cyan uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Activity className="w-3 h-3" /> Execute Parameters
                        </div>
                        <div className="p-3 bg-black/50 border border-soc-cyan/20 rounded-lg font-mono text-xs text-soc-text break-all whitespace-pre-wrap">
                          {selectedAnalysis.command_line}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] text-soc-purple uppercase tracking-widest mb-2 flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3" /> Core Analysis
                      </div>
                      <div className="p-4 bg-soc-purple/5 border border-soc-purple/20 rounded-lg text-sm text-soc-text leading-relaxed font-mono whitespace-pre-wrap">
                        {selectedAnalysis.analysis}
                      </div>
                    </div>

                    {selectedAnalysis.live_telemetry && (
                        <div>
                          <div className="text-[10px] text-soc-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                            Extracted Telemetry Slice (OS Limits)
                          </div>
                          <div className="p-3 bg-black/50 border border-white/5 rounded-lg font-mono text-[10px] text-soc-muted break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {selectedAnalysis.live_telemetry}
                          </div>
                        </div>
                    )}

                    <div>
                      <div className="text-[10px] text-soc-green uppercase tracking-widest mb-2 flex items-center gap-2">
                        Recommended Mitigation
                      </div>
                      <div className="p-4 bg-soc-green/5 border border-soc-green/20 rounded-lg text-sm text-soc-green leading-relaxed font-mono whitespace-pre-wrap">
                        {selectedAnalysis.mitigation}
                      </div>
                    </div>

                    <YaraScanner targetPath={processes?.find((p: any) => p.pid === selectedAnalysis.pid)?.exe_path || 'Unknown'} />
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
