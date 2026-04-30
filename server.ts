import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { db, initDb } from "./src/backend/database.js";
import logRoutes from "./src/backend/routes/logs.js";
import alertRoutes from "./src/backend/routes/alerts.js";
import chatRoutes from "./src/backend/routes/chat.js";
import authRoutes from "./src/backend/routes/auth.js";
import systemRoutes from "./src/backend/routes/system.js";
import usersRoutes from "./src/backend/routes/users.js";
import ipsRoutes from "./src/backend/routes/ips.js";
import phase1Routes from "./src/backend/routes/phase1.js";
import edrRoutes from "./src/backend/routes/edr.js";
import aegixRoutes from "./src/backend/routes/aegix.js";
import behavioralRoutes from "./src/backend/routes/behavioral.js";
import multiAgentRoutes from "./src/backend/routes/multi_agent.js";
import memoryRoutes from "./src/backend/routes/memory.js";
import mitreRoutes from "./src/backend/routes/mitre.js";
import assistantRoutes from "./src/backend/routes/assistant.js";
import correlationRoutes from "./src/backend/routes/correlation.js";
import { apiLimiter } from "./src/backend/middleware/rateLimit.js";

import { ipsMiddleware } from "./src/backend/middleware/ips.js";
import { ipsService } from "./src/backend/services/ips_service.js";
import { logService } from "./src/backend/services/log_service.js";
import { alertService } from "./src/backend/services/alert_service.js";
import { realSystemMonitor } from "./src/backend/services/real_system_monitor.js";
import { sensorBridge } from "./src/backend/services/sensor_bridge.js";
import { aegixBridge } from "./src/backend/services/aegix_bridge.js";
import { sseService } from "./src/backend/services/sse_service.js";

// Directories handled via process.cwd()

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for rate limiting in Cloud Run/Proxied environments
  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());

  // Log all incoming API requests as real work data
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const originalSend = res.send;
      let responseBody: any;
      res.send = function (content) {
        responseBody = content;
        return originalSend.apply(this, arguments as any);
      };

      res.on('finish', () => {
        // Avoid recursive logging loops for high-frequency polling endpoints
        if (req.path === '/api/logs' || req.path === '/api/system/processes' || req.path === '/api/system/network' || req.path === '/api/alerts' || req.path === '/api/health' || req.path === '/api/stream') {
          return;
        }

        const username = (req as any).user?.username || 'anonymous';
        const isSuspicious = req.path.includes('admin') || req.path.includes('delete') || req.path.includes('block') || res.statusCode >= 400;

        let payloadStr = '';
        try {
           payloadStr = Object.keys(req.body).length ? req.body : req.query;
        } catch(e) {}

        logService.processAndSaveLog({
          timestamp: new Date().toISOString(),
          source_ip: req.ip || req.socket.remoteAddress || '127.0.0.1',
          username: username,
          event_type: 'api_request',
          status_code: res.statusCode,
          payload: {
            method: req.method,
            path: req.path,
            body: payloadStr
          }
        }).catch(err => {
          // silent catch to avoid crashing
        });
      });
    }
    next();
  });

  // Apply IPS Middleware globally BEFORE any other routes
  app.use(ipsMiddleware);

  app.use("/api/", apiLimiter);

  // Initialize Database
  await initDb();
  
  // Initialize IPS Cache
  ipsService.init();

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/logs", logRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/ips", ipsRoutes);
  app.use("/api/phase1", phase1Routes);
  app.use("/api/edr", edrRoutes);
  app.use("/api/aegix", aegixRoutes);
  app.use("/api/behavioral", behavioralRoutes);
  app.use("/api/multi-agent", multiAgentRoutes);
  app.use("/api/memory", memoryRoutes);
  app.use("/api/mitre", mitreRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/correlation", correlationRoutes);

  app.get("/api/sentinel/history", (req, res) => {
    res.json(aegixBridge.getHistory());
  });

  app.post("/api/sentinel/command", (req, res) => {
    const { action } = req.body;
    if (!action) {
      return res.status(400).json({ error: "Missing action in request" });
    }
    
    // Check if Python process is ready
    if (!aegixBridge.isReady) {
      return res.status(500).json({ error: "Aegix Brain is not ready" });
    }
    
    // Inject the command as a special event
    aegixBridge.processEvent({
      event_type: "SYSTEM_COMMAND",
      command: action,
      source_ip: "127.0.0.1",
      timestamp: new Date().toISOString()
    });
    
    res.json({ status: "ok", message: `Command '${action}' sent to Aegix Brain` });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", model_ready: true });
  });

  // SSE setup for real-time notifications
  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    
    sseService.addClient(res);
    req.on("close", () => {
      sseService.removeClient(res);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start real system monitor
    realSystemMonitor.start();
    
    // Start Python Sensor Daemon bridge
    sensorBridge.start();
    
    // Start Aegix AI Brain bridge
    aegixBridge.start();

    // Start background jobs interval (every minute)
    setInterval(() => {
      try {
        alertService.autoAcknowledgeAlerts();
      } catch (err) {
        console.error("Error running auto-acknowledge:", err);
      }
      
      try {
        ipsService.cleanupExpiredBlocks();
      } catch (err) {
        console.error("Error running IPS cleanup:", err);
      }
    }, 60000);
  });
}

startServer();
