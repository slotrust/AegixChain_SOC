import { Router } from "express";
import { multiAgentSystem } from "../services/multi_agent_system.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);

router.get("/history", (req, res) => {
  try {
    const history = multiAgentSystem.getHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Multi-Agent history" });
  }
});

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const handleMessage = (msg: any) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  multiAgentSystem.on('message', handleMessage);

  req.on('close', () => {
    multiAgentSystem.off('message', handleMessage);
  });
});

export default router;
