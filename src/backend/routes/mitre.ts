import { Router } from 'express';
import { mitreService } from '../services/mitre_service.js';

const router = Router();

router.get('/timeline', (req, res) => {
  try {
    const timeline = mitreService.getTimeline();
    res.json(timeline);
  } catch (error) {
    console.error('Error fetching MITRE timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

router.get('/details/:id', (req, res) => {
  try {
    const details = mitreService.getTechniqueDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Technique not found' });
    res.json(details);
  } catch (error) {
    console.error('Error fetching MITRE technique details:', error);
    res.status(500).json({ error: 'Failed to fetch details' });
  }
});

export default router;
