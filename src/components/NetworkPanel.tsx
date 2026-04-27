import React, { useState, useMemo } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Globe, ShieldAlert, CheckCircle2, Search, ArrowUpDown } from 'lucide-react';

export default function NetworkPanel() {
  const { data: network, loading } = usePolling(() => api.getNetwork(), 3000);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedNetwork = useMemo(() => {
    if (!network || !Array.isArray(network)) return [];
    
    // Filter
    let result = network.filter((conn: any) => {
      const term = searchTerm.toLowerCase();
      return (
        (conn.local_address && conn.local_address.toLowerCase().includes(term)) ||
        (conn.remote_address && conn.remote_address.toLowerCase().includes(term)) ||
        (conn.pid && conn.pid.toString().includes(term)) ||
        (conn.status && conn.status.toLowerCase().includes(term))
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
  }, [network, searchTerm, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  if (loading && !network) return <div className="p-8 text-center text-soc-muted">Loading network...</div>;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-soc-cyan to-soc-purple opacity-50"></div>
      <div className="p-6 border-b border-soc-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-soc-bg/30">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h3 className="font-bold flex items-center gap-2 text-soc-text font-syne">
            <Globe className="w-5 h-5 text-soc-cyan" />
            Network Connections
          </h3>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-soc-muted group-focus-within:text-soc-cyan transition-colors" />
            <input
              type="text"
              placeholder="Search IP, PID, or status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-soc-surface/50 border border-soc-border/50 rounded-xl py-2.5 pl-11 pr-4 text-sm text-soc-text focus:outline-none focus:border-soc-cyan/50 focus:ring-1 focus:ring-soc-cyan/50 transition-all font-mono"
            />
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-bold text-soc-muted uppercase tracking-widest">Status</span>
            <span className="text-xs text-soc-cyan font-mono">LIVE MONITORING</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[600px]">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-soc-bg/80 backdrop-blur-md text-soc-muted sticky top-0 z-10 border-b border-soc-border/50">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('local_address')}>
                <div className="flex items-center gap-1">Local Address <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('remote_address')}>
                <div className="flex items-center gap-1">Remote Address <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors" onClick={() => handleSort('pid')}>
                <div className="flex items-center gap-1">PID <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:text-soc-text transition-colors text-right" onClick={() => handleSort('is_suspicious')}>
                <div className="flex items-center justify-end gap-1">Risk <ArrowUpDown className="w-3 h-3 opacity-50" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soc-border/30">
            {filteredAndSortedNetwork.map((conn: any, index: number) => (
              <tr
                key={`${conn.local_address}-${conn.remote_address}-${conn.pid}-${index}`}
                className={`transition-all hover:bg-soc-cyan/5 group ${
                  conn.is_suspicious ? 'bg-soc-red/5' : ''
                }`}
              >
                <td className="px-6 py-4 font-mono text-soc-muted group-hover:text-soc-text transition-colors">{conn.local_address}</td>
                <td className="px-6 py-4 font-mono text-soc-cyan font-medium">{conn.remote_address}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded border border-soc-green/30 bg-soc-green/10 text-soc-green text-[10px] font-bold uppercase tracking-tight">
                    {conn.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-soc-muted font-mono">{conn.pid}</td>
                <td className="px-6 py-4 text-right">
                  {conn.is_suspicious ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-soc-red/30 bg-soc-red/10 text-soc-red text-[10px] font-bold uppercase shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                      <ShieldAlert className="w-3 h-3" />
                      Suspicious
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-soc-green/30 bg-soc-green/10 text-soc-green text-[10px] font-bold uppercase">
                      <CheckCircle2 className="w-3 h-3" />
                      Safe
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
