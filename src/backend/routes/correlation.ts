import { Router } from 'express';
import { correlationService } from '../services/correlation_service.js';

const router = Router();

router.get('/threats', (req, res) => {
  try {
    const threats = correlationService.getCorrelatedThreats();
    res.json(threats);
  } catch (error) {
    console.error('Error fetching correlated threats:', error);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.get('/threats/:id/chain', (req, res) => {
  try {
    const chain = correlationService.getAttackChain(parseInt(req.params.id));
    res.json(chain);
  } catch (error) {
    console.error('Error fetching attack chain:', error);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

export default router;
