import fs from 'fs';
import { systemService } from './system_service.js';
import si from 'systeminformation';
import { execSync } from 'child_process';

let isPollingProcesses = false;
let isPollingNetwork = false;

// caches for quick API response
export let processCache: any[] = [];
export let networkCache: any[] = [];

export const realSystemMonitor = {
  start: () => {
    
    // Poll processes and filesystem every 5 seconds
    setInterval(async () => {
      if (isPollingProcesses) return;
      isPollingProcesses = true;
      try {
        const psOutput = execSync('ps -axo pid,pcpu,pmem,user,comm,args --sort=-pcpu | head -n 101').toString();
        const lines = psOutput.split('\n').filter(Boolean).slice(1);
        
        const newCache = [];
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
          const flagged = isSuspicious && !isDevCommand;
          
          const details = {
              pid,
              name,
              cpu_percent: cpu,
              memory_usage: mem,
              exe_path: name,
              cmdline,
              user,
              status: status,
              timestamp: new Date().toISOString(),
              is_suspicious: flagged ? 1 : 0
          };
          newCache.push(details);
          
          if (flagged) {
            await systemService.processData({
              type: 'process',
              details,
              risk_score: 0.9,
              flagged: true
            });
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

          if (isSuspicious) {
            await systemService.processData({
              type: 'network',
              details,
              risk_score: 0.85,
              flagged: true
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
  }
};
