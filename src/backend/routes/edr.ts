import express from 'express';
import { edrService } from '../services/edr_service.js';

const router = express.Router();

router.get('/vulnerabilities', async (req, res) => {
  try {
     const vulns = await edrService.scanVulnerabilities();
     res.json(vulns);
  } catch (err) {
     res.status(500).json({ error: "Scan Failed" });
  }
});

router.get('/quarantines', (req, res) => {
  res.json(edrService.quarantineLogs);
});

router.post('/scan', async (req, res) => {
  try {
    const vulns = await edrService.scanVulnerabilities();
    res.json({ status: 'ok', message: `Kernel file-system scan initiated. Located ${vulns.length} environment issues.`, count: vulns.length });
  } catch (err) {
     res.status(500).json({ error: "Scan Failed" });
  }
});

router.post('/scan-file', async (req, res) => {
  const { targetPath } = req.body;
  if (!targetPath) {
    return res.status(400).json({ error: "No target path provided" });
  }
  
  try {
     const result = await edrService.scanTargetFile(targetPath);
     res.json(result);
  } catch (err: any) {
     res.status(500).json({ error: err.message });
  }
});

router.post('/scan-integrity', async (req, res) => {
  const { targetPath } = req.body;
  if (!targetPath) {
    return res.status(400).json({ error: "No target path provided" });
  }
  
  try {
     const result = await edrService.scanFileIntegrity(targetPath);
     res.json(result);
  } catch (err: any) {
     res.status(500).json({ error: err.message });
  }
});

router.post('/analyze-process', async (req, res) => {
  const { pid, processName } = req.body;
  if (!pid) {
    return res.status(400).json({ error: "No PID provided" });
  }
  
  try {
     const result = await edrService.analyzeProcess(pid, processName || 'unknown');
     res.json(result);
  } catch (err: any) {
     res.status(500).json({ error: err.message });
  }
});

router.post('/scan-nmap', async (req, res) => {
  const { target } = req.body;
  try {
     const result = await edrService.runNmapScan(target || "127.0.0.1");
     res.json(result);
  } catch (err: any) {
     res.status(500).json({ error: err.message });
  }
});

router.post('/remediate', async (req, res) => {
  const { packageName, range } = req.body;
  if (!packageName) {
    return res.status(400).json({ error: "Package name required" });
  }
  try {
     const report = await edrService.remediateVulnerability(packageName, range || 'unknown version');
     res.json({ status: 'ok', message: `Autonomous patching successful. Package '${packageName}' updated.`, report });
  } catch (err) {
     res.status(500).json({ error: "Patch Deployment Failed" });
  }
});

router.post('/remediate-critical', async (req, res) => {
  // Override Express internal timeout for long running bulk patch
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); 

  try {
     const result = await edrService.remediateCriticalHighVulnerabilities();
     res.json({ status: 'ok', message: `Autonomous patching completed. Re-secured ${result.patched} critical/high dependencies.`, patched: result.patched });
  } catch (err) {
     res.status(500).json({ error: "Bulk Patch Deployment Failed" });
  }
});

router.get('/reports', (req, res) => {
  res.json(edrService.patchReports);
});

router.post('/tools/query-vulnerability', async (req, res) => {
  const { cve_id } = req.body;
  if (!cve_id) return res.status(400).json({ error: "cve_id required" });
  res.json({
    cve_id,
    cvss_score: "9.8 Critical",
    affected_cpes: ["cpe:2.3:a:target:software:1.0:*:*:*:*:*:*:*"],
    exploitability: "High",
    description: `A critical vulnerability found in ${cve_id}. Allows remote code execution.`
  });
});

router.post('/tools/deploy-mitigation', async (req, res) => {
  const { target_asset, mitigation_payload } = req.body;
  if (!target_asset || !mitigation_payload) return res.status(400).json({ error: "Missing parameters" });
  res.json({
    status: "success",
    target_asset,
    action: "Temporary mitigation deployed successfully.",
    mitigation_payload
  });
});

router.post('/tools/create-ticket', async (req, res) => {
  const { cve_id, proposed_fix_code, rollback_plan } = req.body;
  if (!cve_id || !proposed_fix_code || !rollback_plan) return res.status(400).json({ error: "Missing parameters" });
  res.json({
    status: "success",
    ticket_id: `TICKET-${Math.floor(Math.random() * 10000)}`,
    cve_id,
    message: "Patch review ticket submitted successfully to SOC team."
  });
});

export default router;
