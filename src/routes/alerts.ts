import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import {
  getAlerts,
  acknowledgeAlert,
  checkAndCreateAlerts,
  deleteAlert,
} from '../controllers/AlertsController';

const router = Router();

router.get('/',                        requireApiKey, getAlerts);
router.post('/check-outbreak',         requireApiKey, checkAndCreateAlerts);
router.post('/:id/acknowledge',        requireApiKey, acknowledgeAlert);
router.delete('/:id',                  requireApiKey, deleteAlert);

export default router;
