import React from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { motion } from 'motion/react';
import { Cpu, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';

export default function ResourceMonitor() {
  const { data: cpuStats } = usePolling(() => api.getCpuStats(), 2000);
  const { data: networkStats } = usePolling(() => api.getNetworkStats(), 2000);

  const cpuData = Array.isArray(cpuStats) ? cpuStats : [];
  const networkData = Array.isArray(networkStats) ? networkStats : [];

  const formatNetworkSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec) return "0 MB/s";
    return (bytesPerSec / 1024 / 1024).toFixed(2) + " MB/s";
  };

  const currentCpu = cpuData.length > 0 ? cpuData[cpuData.length - 1] : null;
  const currentNet = networkData.length > 0 ? networkData[networkData.length - 1] : null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 border border-white/10 p-3 rounded-lg shadow-xl backdrop-blur-sm">
          <p className="text-xs text-soc-muted mb-2 font-mono">
             {new Date(label).toLocaleTimeString()}
          </p>
          {payload.map((entry: any, index: number) => (
             <div key={index} className="flex items-center gap-2 text-sm font-bold mt-1" style={{ color: entry.color }}>
                <span>{entry.name}:</span>
                <span>{typeof entry.value === 'number' && entry.name.includes('CPU') ? entry.value.toFixed(1) + '%' : formatNetworkSpeed(entry.value)}</span>
             </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* CPU Monitor */}
      <div className="glass-panel rounded-xl flex flex-col overflow-hidden border-t-2 border-soc-cyan/50 relative">
        <div className="p-4 border-b border-white/10 bg-black/40 flex justify-between items-center z-10">
          <h2 className="font-syne font-bold text-soc-text flex items-center gap-2">
            <Cpu className="w-5 h-5 text-soc-cyan" />
            CPU Utilization
          </h2>
          <div className="flex gap-4">
             <div className="text-right">
                <div className="text-xs text-soc-muted">Overall Load</div>
                <div className="font-mono text-soc-cyan font-bold">{currentCpu?.currentLoad?.toFixed(1) || 0}%</div>
             </div>
          </div>
        </div>
        
        <div className="flex-1 p-4 min-h-[200px] z-10 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cpuData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' })}
                stroke="#ffffff40"
                tick={{ fill: '#ffffff60', fontSize: 10 }}
                tickMargin={10}
              />
              <YAxis 
                domain={[0, 100]}
                stroke="#ffffff40" 
                tick={{ fill: '#ffffff60', fontSize: 10 }}
                tickFormatter={(val) => `${val}%`}
                width={35}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="currentLoad" 
                name="Overall CPU"
                stroke="#00e5c0" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
              <Line 
                type="monotone" 
                dataKey="currentLoadUser" 
                name="User Load"
                stroke="#7f77dd" 
                strokeWidth={1} 
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Per Core Load Display */}
        <div className="p-4 bg-black/30 border-t border-white/5 grid grid-cols-4 sm:grid-cols-8 gap-2 z-10">
           {currentCpu?.cores?.map((core: any) => (
              <div key={core.core} className="bg-black/50 border border-white/10 rounded p-1 text-center relative overflow-hidden">
                 <div 
                    className="absolute bottom-0 left-0 right-0 bg-soc-cyan/30 transition-all duration-300"
                    style={{ height: `${core.load}%` }}
                 />
                 <div className="relative z-10 text-[8px] text-soc-muted tracking-widest">C{core.core}</div>
                 <div className="relative z-10 text-[10px] font-mono font-bold">{core.load.toFixed(0)}%</div>
              </div>
           ))}
        </div>
      </div>

      {/* Network Monitor */}
      <div className="glass-panel rounded-xl flex flex-col overflow-hidden border-t-2 border-soc-purple/50 relative">
        <div className="p-4 border-b border-white/10 bg-black/40 flex justify-between items-center z-10">
          <h2 className="font-syne font-bold text-soc-text flex items-center gap-2">
            <Activity className="w-5 h-5 text-soc-purple" />
            Network Traffic (Live)
          </h2>
          <div className="flex gap-4 text-right">
             <div>
                <div className="text-[10px] text-soc-muted flex items-center gap-1 justify-end"><ArrowDownRight size={12} className="text-soc-purple" /> Download</div>
                <div className="font-mono text-soc-purple font-bold text-sm">{formatNetworkSpeed(currentNet?.rx_sec || 0)}</div>
             </div>
             <div>
                <div className="text-[10px] text-soc-muted flex items-center gap-1 justify-end"><ArrowUpRight size={12} className="text-soc-cyan" /> Upload</div>
                <div className="font-mono text-soc-cyan font-bold text-sm">{formatNetworkSpeed(currentNet?.tx_sec || 0)}</div>
             </div>
          </div>
        </div>
        
        <div className="flex-1 p-4 min-h-[250px] z-10">
          <ResponsiveContainer width="100%" height="100%">
             <AreaChart data={networkData}>
               <defs>
                  <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#7f77dd" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#7f77dd" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#00e5c0" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#00e5c0" stopOpacity={0}/>
                  </linearGradient>
               </defs>
               <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
               <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' })}
                  stroke="#ffffff40"
                  tick={{ fill: '#ffffff60', fontSize: 10 }}
                  tickMargin={10}
               />
               <YAxis 
                  stroke="#ffffff40" 
                  tick={{ fill: '#ffffff60', fontSize: 10 }}
                  tickFormatter={(val) => (val / 1024 / 1024).toFixed(1)}
                  width={35}
               />
               <Tooltip content={<CustomTooltip />} />
               <Area 
                  type="monotone" 
                  dataKey="rx_sec" 
                  name="Download"
                  stroke="#7f77dd" 
                  fillOpacity={1} 
                  fill="url(#colorRx)" 
                  isAnimationActive={false}
               />
               <Area 
                  type="monotone" 
                  dataKey="tx_sec" 
                  name="Upload"
                  stroke="#00e5c0" 
                  fillOpacity={1} 
                  fill="url(#colorTx)" 
                  isAnimationActive={false}
               />
             </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
