import { Router } from 'express';
import { memoryService } from '../services/memory_service.js';

const router = Router();

router.post('/add', (req, res) => {
  try {
    const threat = req.body;
    const result = memoryService.addThreat(threat);
    res.json(result);
  } catch (error) {
    console.error('Error adding threat to memory:', error);
    res.status(500).json({ error: 'Failed to add threat to memory' });
  }
});

router.post('/match', (req, res) => {
  try {
    const threat = req.body;
    const match = memoryService.matchThreat(threat);
    res.json({ match });
  } catch (error) {
    console.error('Error matching threat:', error);
    res.status(500).json({ error: 'Failed to match threat' });
  }
});

router.get('/history', (req, res) => {
  try {
    const history = memoryService.getHistory(req.query);
    res.json(history);
  } catch (error) {
    console.error('Error getting memory history:', error);
    res.status(500).json({ error: 'Failed to get memory history' });
  }
});

router.post('/:id/feedback', (req, res) => {
  try {
    const { id } = req.params;
    const { verdict } = req.body; // 'safe' | 'malicious'
    const result = memoryService.updateFeedback(parseInt(id), verdict);
    res.json(result);
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

export default router;
