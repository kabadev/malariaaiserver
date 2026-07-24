import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import {
  registerDevice,
  getDevices,
  getDevice,
  updateDevice,
  pingDevice,
} from '../controllers/DeviceController';

const router = Router();

router.post('/register',        requireApiKey, registerDevice);
router.get('/',                 requireApiKey, getDevices);
router.get('/:deviceId',        requireApiKey, getDevice);
router.patch('/:deviceId',      requireApiKey, updateDevice);
router.post('/:deviceId/ping',  requireApiKey, pingDevice);

export default router;
