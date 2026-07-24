import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import {
  syncDiagnoses,
  getDiagnoses,
  getStats,
  getHeatmap,
} from '../controllers/DiagnosisController';

const router = Router();

// Mobile app endpoints (API key auth)
router.post('/sync',    requireApiKey, syncDiagnoses);
router.get('/',         requireApiKey, getDiagnoses);
router.get('/stats',    requireApiKey, getStats);
router.get('/heatmap',  requireApiKey, getHeatmap);

export default router;
