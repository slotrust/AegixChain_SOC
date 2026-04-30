import express from "express";
import { db } from "../database.js";
import { spawn } from "child_process";
import path from "path";

const router = express.Router();

router.post("/analyze-alert", async (req, res) => {
  const { alertId } = req.body;
  if (!alertId) return res.status(400).json({ error: "Missing alertId" });

  try {
    // 1. Double check the alert exists
    const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(alertId);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    // 2. Invoke Python LangGraph Agent
    const pythonScript = path.join(process.cwd(), "agent/analyst_agent/agent.py");
    
    const pyProcess = spawn("python3", [pythonScript, String(alertId)]);
    
    let stdoutData = "";
    let stderrData = "";

    pyProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    pyProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Agent execution failed:", stderrData);
        if (stdoutData) console.log("Agent partial output:", stdoutData);
        return res.status(500).json({ error: "Agent execution failed", details: stderrData });
      }

      try {
        // Find JSON block in stdout (agent might print warnings)
        const match = stdoutData.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON found in agent output");
        const jsonOutput = JSON.parse(match[0]);

        // 3. Save to database
        db.prepare(`
          INSERT INTO agent_analysis (alert_id, analysis_json)
          VALUES (?, ?)
          ON CONFLICT(alert_id) DO UPDATE SET analysis_json = excluded.analysis_json, created_at = datetime('now')
        `).run(alertId, JSON.stringify(jsonOutput));

        res.json(jsonOutput);
      } catch (err) {
        console.error("Failed to parse agent output:", err, stdoutData);
        res.status(500).json({ error: "Failed to parse agent output", data: stdoutData });
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analysis/:alertId", (req, res) => {
  try {
    const { alertId } = req.params;
    const row = db.prepare("SELECT analysis_json FROM agent_analysis WHERE alert_id = ?").get(alertId);
    if (row) {
      res.json(JSON.parse(row.analysis_json));
    } else {
      res.status(404).json({ error: "Analysis not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
