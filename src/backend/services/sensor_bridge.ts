import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { systemService } from './system_service.js';
import { logService } from './log_service.js';

// handled

export const sensorBridge = {
  start: () => {
    
    // Attempt to install dependencies asynchronously to not block server startup
    const installCmd = 'python3 -m pip install psutil watchdog scapy --break-system-packages || (wget -qO- https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages && python3 -m pip install psutil watchdog scapy --break-system-packages)';
    
    let spawnPython: (command: string) => void;

    import('child_process').then(({ exec }) => {
      exec(installCmd, (error) => {
        // Start python process after dependencies are checked/installed
        spawnPython('python3');
      });
    }).catch(() => {
      // Fallback if import fails
      spawnPython('python3');
    });

    const scriptPath = path.join(process.cwd(), 'src/backend/sensors/sensor_daemon.py');
    
    // Attempt to spawn with python3, fallback to python
    spawnPython = (command: string) => {
      const pythonProcess = spawn(command, [scriptPath]);

      pythonProcess.on('error', (err: any) => {
        console.error("sensorBridge Python Error:", err.message);
        if (err.code === 'ENOENT' && command === 'python3') {
          spawnPython('python');
        }
      });

      let buffer = '';
      pythonProcess.stdout?.on('error', err => console.error("sensorBridge stdout error", err));
      pythonProcess.stderr?.on('error', err => console.error("sensorBridge stderr error", err));
      pythonProcess.stdin?.on('error', err => console.error("sensorBridge stdin error", err));

      pythonProcess.stdout?.on('data', async (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (!line) continue;
          
          try {
            const event = JSON.parse(line);
            
            // Map Python sensor events to our systemService format
            if (event.event_type === 'New Process') {
              const pid = parseInt(event.raw_data.match(/PID: (\d+)/)?.[1] || '0');
              const name = event.raw_data.match(/Name: ([^,]+)/)?.[1] || 'Unknown';
              const cmdline = event.raw_data.match(/Cmd: (.*)/)?.[1] || '';
              
              await systemService.processData({
                type: 'process',
                details: {
                  pid,
                  name,
                  cpu_percent: 0,
                  memory_usage: 0,
                  exe_path: cmdline,
                  status: 'Running'
                },
                risk_score: event.severity / 10,
                flagged: event.severity >= 7
              });
              
              // Log to Live Feed
              logService.processAndSaveLog({
                timestamp: new Date().toISOString(),
                source_ip: "localhost",
                username: "system",
                event_type: "process_start",
                status_code: 200,
                payload: { pid, name, cmdline }
              }).catch(console.error);
              
            } else if (event.event_type === 'Network Flow') {
              // Very basic mapping
              const match = event.raw_data.match(/([A-Z]+) ([\d\.]+) -> ([\d\.]+)/);
              if (match) {
                 await systemService.processData({
                  type: 'network',
                  details: {
                    local_address: match[2],
                    remote_address: match[3],
                    status: match[1],
                    pid: 0
                  },
                  risk_score: event.severity / 10,
                  flagged: event.severity >= 7
                });
                
                // Log to Live Feed
                logService.processAndSaveLog({
                  timestamp: new Date().toISOString(),
                  source_ip: match[2],
                  username: "network",
                  event_type: "network_flow",
                  status_code: 200,
                  payload: { protocol: match[1], destination: match[3] }
                }).catch(console.error);
              }
            } else if (event.event_type === 'File Created' || event.event_type === 'File Modified') {
               // We can log this as a special process or alert
               if (event.severity >= 6) {
                 await systemService.processData({
                    type: 'file',
                    details: {
                      file_path: event.raw_data,
                      event_type: event.event_type
                    },
                    risk_score: event.severity / 10,
                    flagged: true
                 });
               }
               
               // Log to Live Feed
               logService.processAndSaveLog({
                  timestamp: new Date().toISOString(),
                  source_ip: "localhost",
                  username: "fs_watcher",
                  event_type: event.event_type === 'File Created' ? "file_create" : "file_modify",
                  status_code: 200,
                  payload: { file: event.raw_data }
               }).catch(console.error);
            }
            
            // Also log to console for debugging
            if (event.severity >= 5) {
            }
          } catch (e) {
            // Not JSON or parse error
          }
        }
      });

      pythonProcess.stderr?.on('data', (data) => {
      });

      pythonProcess.on('close', (code) => {
        if (code !== null) {
          // Restart after 5 seconds
          setTimeout(sensorBridge.start, 5000);
        }
      });
    };
  }
};
