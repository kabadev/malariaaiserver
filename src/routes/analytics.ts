import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import { AnalyticsController } from '../controllers/AnalyticsController';

const router = Router();

router.get('/dashboard',         requireApiKey, AnalyticsController.getDashboardStats);
router.get('/trends',            requireApiKey, AnalyticsController.getTrends);
router.get('/heatmap',           requireApiKey, AnalyticsController.getHeatmap);
router.get('/districts/ranking', requireApiKey, AnalyticsController.getDistrictRanking);
router.get('/export',            requireApiKey, AnalyticsController.exportData);

export default router;
