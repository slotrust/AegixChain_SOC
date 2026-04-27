import { Router } from "express";
import { behavioralAiService } from "../services/behavioral_ai_service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Middleware inside this router restricts access to analysts or admins
router.use(authMiddleware);

router.get("/anomalies", (req, res) => {
  try {
    const anomalies = behavioralAiService.getAnomalies();
    res.json(anomalies);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch anomalies" });
  }
});

router.get("/baselines", (req, res) => {
  try {
    const baselines = behavioralAiService.getBaselines();
    res.json(baselines);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch baselines" });
  }
});

router.post("/review", (req, res) => {
  try {
    const { id, action } = req.body;
    behavioralAiService.reviewAnomaly(id, action);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to review anomaly" });
  }
});

router.get("/status", (req, res) => {
  try {
    res.json({ isLearningMode: behavioralAiService.getLearningMode() });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

router.post("/mode", (req, res) => {
  try {
    const { learning } = req.body;
    behavioralAiService.setLearningMode(learning);
    res.json({ success: true, isLearningMode: behavioralAiService.getLearningMode() });
  } catch (error) {
    res.status(500).json({ error: "Failed to set mode" });
  }
});

export default router;
