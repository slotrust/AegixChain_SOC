import { Router } from "express";
import { alertService, settingsService } from "../services/alert_service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);

router.get("/settings", (req, res) => {
  try {
    const settings = settingsService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.post("/settings", (req, res) => {
  try {
    const settings = settingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/", (req, res) => {
  try {
    const severity = req.query.severity as string || undefined;
    const status = req.query.status as string || 'active';
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Auto-migrate old acknowledged parameter if passed by UI
    let finalStatus = status;
    if (req.query.acknowledged === 'true') {
        finalStatus = 'suppressed'; // just map it roughly or ignore
    }

    const alerts = alertService.getAlerts(severity, finalStatus, limit, offset);
    res.json(alerts);
  } catch (error) {
    console.error("Error in GET /api/alerts:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/:id", (req, res) => {
  const alert = alertService.getAlertById(parseInt(req.params.id));
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  res.json(alert);
});

router.patch("/:id/acknowledge", (req, res) => {
  const acknowledged = req.body.acknowledged === true;
  const alert = alertService.acknowledgeAlert(parseInt(req.params.id), acknowledged);
  res.json(alert);
});

export default router;
