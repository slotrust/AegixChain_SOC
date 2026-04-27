import { Router } from "express";
import { logService } from "../services/log_service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const logData = req.body;
    const result = await logService.processAndSaveLog(logData);
    res.json(result);
  } catch (error) {
    console.error("Error processing log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const anomalyOnly = req.query.anomaly_only === 'true';
    const sourceIp = req.query.source_ip as string;
    const username = req.query.username as string;
    
    const logs = logService.getLogs(limit, offset, anomalyOnly, sourceIp, username);
    res.json(logs);
  } catch (error) {
    console.error("Error in GET /api/logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", authMiddleware, (req, res) => {
  try {
    const stats = logService.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error in GET /api/logs/stats:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
