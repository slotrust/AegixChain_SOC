import { Router } from "express";
import { systemService } from "../services/system_service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Endpoint for the Python agent to send data
router.post("/system-data", async (req, res) => {
  try {
    const data = req.body;
    // Data validation could be added here
    await systemService.processData(data);
    res.json({ status: "ok" });
  } catch (error) {
    console.error("System data error:", error);
    res.status(500).json({ error: "Failed to process system data" });
  }
});

// Protected endpoints for the dashboard
router.use(authMiddleware);

router.get("/processes", async (req, res) => {
  try {
    const processes = await systemService.getProcesses();
    res.json(processes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch processes" });
  }
});

router.get("/network", async (req, res) => {
  try {
    const network = await systemService.getNetworkConnections();
    res.json(network);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch network connections" });
  }
});

router.get("/network-stats", async (req, res) => {
  try {
    const stats = await systemService.getNetworkStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch network stats" });
  }
});

router.get("/cpu-stats", async (req, res) => {
  try {
    const stats = await systemService.getCpuStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cpu stats" });
  }
});

export default router;
