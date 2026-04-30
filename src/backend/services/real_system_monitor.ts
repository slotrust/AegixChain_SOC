import fs from 'fs';
import os from 'os';
import { systemService } from './system_service.js';
import si from 'systeminformation';
import { execSync } from 'child_process';
import { dlAnomalyEngine } from './dl_engine.js';

let isPollingProcesses = false;
let isPollingNetwork = false;
let isPollingStats = false;

// caches for quick API response
export let processCache: any[] = [];
export let networkCache: any[] = [];
export let cpuStatsCache: any[] = [];
export let networkStatsCache: any[] = [];

class ProcessAnomalyEngine {
  private baselines: Map<string, { cpuEma: number, memEma: number, cpuVar: number, memVar: number, count: number }> = new Map();
  private alpha = 0.2; // EWMA decay factor

  public async analyze(name: string, cpu: number, mem: number, pid: number): Promise<{ isAnomaly: boolean, zScoreCpu: number, zScoreMem: number, details: string, dlScore: number }> {
    if (!this.baselines.has(name)) {
      this.baselines.set(name, { cpuEma: cpu, memEma: mem, cpuVar: 1, memVar: 1, count: 1 });
    }

    const stats = this.baselines.get(name)!;
    stats.count++;

    const cpuStdDev = Math.sqrt(stats.cpuVar || 1);
    const memStdDev = Math.sqrt(stats.memVar || 1);
    
    const zScoreCpu = (cpu - stats.cpuEma) / cpuStdDev;
    const zScoreMem = (mem - stats.memEma) / memStdDev;

    // Deep Learning inference
    const dlFeatures = [
        cpu / 100.0,
        mem / 100.0,
        Math.min(Math.abs(zScoreCpu) / 5.0, 1.0),
        Math.min(Math.abs(zScoreMem) / 5.0, 1.0),
        pid > 1000 ? 0.5 : 0.1,
        stats.count > 50 ? 0.2 : 0.8,
        0, 0, 0, 0
    ];
    
    // Train DL model online asynchronously
    if (Math.random() < 0.05) dlAnomalyEngine.trainIForest([dlFeatures]);
    
    const dlScore = await dlAnomalyEngine.score(dlFeatures);
    
    let explanation = "";
    if (dlScore > 0.7) {
        const featureNames = [
            "High CPU Usage", 
            "High Memory Usage", 
            "CPU Deviation (Z-Score)", 
            "Memory Deviation (Z-Score)", 
            "Process ID Range Anomaly", 
            "Baseline Count Anomaly",
            "Hidden 1", "Hidden 2", "Hidden 3", "Hidden 4"
        ];
        explanation = await dlAnomalyEngine.explain(dlFeatures, featureNames);
    }

    // Update EWMA Variance and Mean
    stats.cpuVar = (1 - this.alpha) * (stats.cpuVar + this.alpha * Math.pow(cpu - stats.cpuEma, 2)) || 1;
    stats.memVar = (1 - this.alpha) * (stats.memVar + this.alpha * Math.pow(mem - stats.memEma, 2)) || 1;
    
    stats.cpuEma = (this.alpha * cpu) + ((1 - this.alpha) * stats.cpuEma);
    stats.memEma = (this.alpha * mem) + ((1 - this.alpha) * stats.memEma);

    const isAnomaly = (stats.count > 10 && (Math.abs(zScoreCpu) > 3.0 || Math.abs(zScoreMem) > 3.0)) || dlScore > 0.7;
    
    let details = '';
    if (isAnomaly) {
        if (dlScore > 0.7) details = `Deep Learning Anomaly (Score: ${dlScore.toFixed(2)}) | ${explanation}`;
        else details = `Statistical Anomaly (EWMA): `;
        
        if (Math.abs(zScoreCpu) > 3.0) details += `CPU Z-Score ${zScoreCpu.toFixed(1)} `;
        if (Math.abs(zScoreMem) > 3.0) details += `MEM Z-Score ${zScoreMem.toFixed(1)}`;
    }

    return { isAnomaly, zScoreCpu, zScoreMem, details, dlScore };
  }
}

const anomalyEngine = new ProcessAnomalyEngine();

export const realSystemMonitor = {
  start: () => {
    
    // Poll processes and filesystem every 5 seconds
    setInterval(async () => {
      if (isPollingProcesses) return;
      isPollingProcesses = true;
      try {
        const platform = os.platform();
        const newCache = [];
        
        let sortedProcesses = [];
        if (platform === 'win32') {
          const processData = await si.processes();
          sortedProcesses = processData.list.sort((a, b) => (b.cpu === Infinity ? 0 : b.cpu) - (a.cpu === Infinity ? 0 : a.cpu)).slice(0, 100);
          for (const proc of sortedProcesses) {
            const pid = proc.pid;
            const cpu = proc.cpu === Infinity ? 0 : proc.cpu || 0;
            const mem = proc.mem || 0;
            const user = proc.user || 'Unknown';
            const name = proc.name || 'Unknown';
            const cmdline = (proc.path ? proc.path + ' ' : '') + (proc.command || '') + ' ' + (proc.params || '');
            const status = proc.state || 'RUNNING';

            const suspiciousRegex = /\b(nc|nmap|miner|exploit|reverse|meterpreter|beacon|cobalt|malware|keylogger|ncat|reverse_shell|base64)\b/i;
            const isSuspicious = suspiciousRegex.test(name) || suspiciousRegex.test(cmdline);
            const isDevCommand = /\b(vite|node|tsx|npm|python|python3|concurrently|sh|ps|bash|grep|cat|ls|npx|systeminformation)\b/i.test(cmdline) || /\b(vite|node|tsx|npm|python|python3|concurrently|sh|ps|bash)\b/i.test(name);
            const { isAnomaly, details: anomalyDetails, dlScore } = await anomalyEngine.analyze(name, cpu, mem, pid);
            const flagged = (isSuspicious && !isDevCommand) || isAnomaly;

            const details = { pid, name, cpu_percent: cpu, memory_usage: mem, exe_path: name, cmdline: cmdline + (isAnomaly ? ` | ${anomalyDetails}` : ''), user, status, timestamp: new Date().toISOString(), is_suspicious: flagged ? 1 : 0 };
            newCache.push(details);
            let shouldSendToAi = flagged;
            if (!flagged && Math.random() < 0.05) { // 5% chance to send normal process for baseline analysis
               shouldSendToAi = true;
            }

            if (shouldSendToAi) {
              await systemService.processData({ type: 'process', details, risk_score: flagged ? (dlScore > 0.7 ? dlScore : 0.9) : dlScore, flagged });
            }
          }
        } else {
            const psOutput = execSync('ps -axo pid,pcpu,pmem,user,comm,args --sort=-pcpu | head -n 101').toString();
            const lines = psOutput.split('\n').filter(Boolean).slice(1);
            
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length < 6) continue;
              
              const pid = parseInt(parts[0], 10);
              const cpu = parseFloat(parts[1]) || 0;
              const mem = parseFloat(parts[2]) || 0;
              const user = parts[3];
              const name = parts[4];
              const cmdline = parts.slice(5).join(' ');
              const status = 'RUNNING';
              
              const suspiciousRegex = /\b(nc|nmap|miner|exploit|reverse|meterpreter|beacon|cobalt|malware|keylogger|ncat|reverse_shell|base64)\b/i;
              const isSuspicious = suspiciousRegex.test(name) || suspiciousRegex.test(cmdline);
              const isDevCommand = /\b(vite|node|tsx|npm|python|python3|concurrently|sh|ps|bash|grep|cat|ls|npx|systeminformation)\b/i.test(cmdline) || /\b(vite|node|tsx|npm|python|python3|concurrently|sh|ps|bash)\b/i.test(name);
              const { isAnomaly, details: anomalyDetails, dlScore } = await anomalyEngine.analyze(name, cpu, mem, pid);
              const flagged = (isSuspicious && !isDevCommand) || isAnomaly;
              
              const details = {
                  pid,
                  name,
                  cpu_percent: cpu,
                  memory_usage: mem,
                  exe_path: name,
                  cmdline: cmdline + (isAnomaly ? ` | ${anomalyDetails}` : ''),
                  user,
                  status: status,
                  timestamp: new Date().toISOString(),
                  is_suspicious: flagged ? 1 : 0
              };
              newCache.push(details);
              
              let shouldSendToAi = flagged;
              if (!flagged && Math.random() < 0.05) { // 5% chance to send normal process for baseline analysis
                 shouldSendToAi = true;
              }
              
              if (shouldSendToAi) {
                await systemService.processData({
                  type: 'process',
                  details,
                  risk_score: flagged ? (dlScore > 0.7 ? dlScore : 0.9) : dlScore,
                  flagged
                });
              }
            }
        }
        processCache.length = 0;
        processCache.push(...newCache);

        // 2. Critical File System Access Polling (Integrity Check)

        const criticalFiles = [
          { path: '/etc/shadow', isSystem: true },
          { path: '/etc/passwd', isSystem: true },
          { path: '/root/.ssh/authorized_keys', isSystem: true },
          { path: '.env', isSystem: false },
          { path: 'package.json', isSystem: false }
        ];
        
        for (const fileDef of criticalFiles) {
           if (fs.existsSync(fileDef.path)) {
              try {
                const stats = fs.statSync(fileDef.path);
                const lastModified = stats.mtime.toISOString();
                
                // If modified in the last 10 seconds, flag it
                const mtimeMs = stats.mtime.getTime();
                const nowMs = Date.now();
                if (nowMs - mtimeMs < 10000) {
                   const flagged = fileDef.isSystem; // Only flag system files as critical
                   await systemService.processData({
                      type: 'process', // Using process as a catch-all for system state updates
                      details: {
                         pid: 0,
                         name: 'fs_integrity_monitor',
                         exe_path: fileDef.path,
                         status: 'FILE_MODIFIED',
                         cmdline: `Integrity breach: ${fileDef.path} modified at ${lastModified}`
                      },
                      risk_score: flagged ? 0.95 : 0.2, // Low risk for normal project files
                      flagged: flagged
                   });
                }
              } catch (e) {}
           }
        }

      } catch (error) {
        console.error("Error in realSystemMonitor (processes):", error);
      } finally {
        isPollingProcesses = false;
      }
    }, 5000);

    // Poll network connections every 5 seconds with payload-like heuristic (via port/service detection)
    setInterval(async () => {
      if (isPollingNetwork) return;
      isPollingNetwork = true;
      try {
        const connections = await si.networkConnections();
        const newCache = [];
        
        for (const c of connections) {
          const localAddress = c.localAddress ? `${c.localAddress}:${c.localPort}` : 'Unknown';
          const remoteAddress = c.peerAddress ? `${c.peerAddress}:${c.peerPort}` : 'Unknown';
          const status = c.state || c.protocol || 'ESTABLISHED';
          const pid = c.pid || 0;
            
          const suspiciousPorts = [4444, 3389, 2222, 1337, 8888, 9999];
          const remotePort = typeof c.peerPort === 'number' ? c.peerPort : parseInt(c.peerPort || '0', 10);
          const isSuspicious = suspiciousPorts.includes(remotePort) || remoteAddress.includes('192.168.1.50');
            
          const details = {
              local_address: localAddress,
              remote_address: remoteAddress,
              status: status,
              pid,
              timestamp: new Date().toISOString(),
              is_suspicious: isSuspicious ? 1 : 0
          };
          newCache.push(details);

          let shouldSendToAi = isSuspicious;
          if (!isSuspicious && Math.random() < 0.2) {
             shouldSendToAi = true;
          }

          if (shouldSendToAi) {
            await systemService.processData({
              type: 'network',
              details,
              risk_score: isSuspicious ? 0.85 : 0.1,
              flagged: isSuspicious
            });
          }
        }
        networkCache.length = 0;
        networkCache.push(...newCache);
      } catch (error) {
      } finally {
        isPollingNetwork = false;
      }
    }, 5000);

    // Poll detailed CPU and Network Stats every 2 seconds
    setInterval(async () => {
      if (isPollingStats) return;
      isPollingStats = true;
      try {
        const [cpuData, netData, memData] = await Promise.all([
          si.currentLoad(),
          si.networkStats(),
          si.mem()
        ]);
        
        // CPU Stats (overall and per core)
        let fallbackCpu = 0;
        if (isNaN(cpuData.currentLoad) || cpuData.currentLoad === 0) {
            const loadavg = os.loadavg();
            fallbackCpu = (loadavg[0] / os.cpus().length) * 100;
        }

        const newCpuCache = {
            timestamp: new Date().toISOString(),
            currentLoad: isNaN(cpuData.currentLoad) || cpuData.currentLoad === 0 ? fallbackCpu : cpuData.currentLoad,
            currentLoadUser: isNaN(cpuData.currentLoadUser) ? fallbackCpu/2 : cpuData.currentLoadUser,
            currentLoadSystem: isNaN(cpuData.currentLoadSystem) ? fallbackCpu/2 : cpuData.currentLoadSystem,
            cores: cpuData.cpus.map((c, i) => ({
                core: i,
                load: isNaN(c.load) || c.load === 0 ? fallbackCpu : c.load
            }))
        };
        
        cpuStatsCache.push(newCpuCache);
        if (cpuStatsCache.length > 30) cpuStatsCache.shift(); // Keep last 30 entries (60 seconds)

        // Network Stats (sum of all interfaces)
        let rx_sec = 0;
        let tx_sec = 0;
        let rx_bytes = 0;
        let tx_bytes = 0;

        for (const iface of netData) {
            rx_sec += typeof iface.rx_sec === 'number' ? iface.rx_sec : 0;
            tx_sec += typeof iface.tx_sec === 'number' ? iface.tx_sec : 0;
            rx_bytes += typeof iface.rx_bytes === 'number' ? iface.rx_bytes : 0;
            tx_bytes += typeof iface.tx_bytes === 'number' ? iface.tx_bytes : 0;
        }

        const newNetCache = {
            timestamp: new Date().toISOString(),
            rx_sec: Math.max(0, rx_sec),
            tx_sec: Math.max(0, tx_sec),
            rx_bytes: Math.max(0, rx_bytes),
            tx_bytes: Math.max(0, tx_bytes)
        };

        networkStatsCache.push(newNetCache);
        if (networkStatsCache.length > 30) networkStatsCache.shift(); // Keep last 30 entries (60 seconds)

        // Alert on network spikes (e.g., > 10MB/s)
        if (rx_sec > 10 * 1024 * 1024 || tx_sec > 10 * 1024 * 1024) {
            await systemService.processData({
                type: 'network_spike',
                details: newNetCache,
                risk_score: 0.8,
                flagged: true
            });
        }
      } catch (error) {
      } finally {
        isPollingStats = false;
      }
    }, 2000);
  }
};
