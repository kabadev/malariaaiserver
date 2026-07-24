import { Request, Response } from 'express';
import Device from '../models/Device';
import Diagnosis from '../models/Diagnosis';
import logger from '../utils/logger';

// ── POST /api/devices/register ────────────────────────────────────────────────
export async function registerDevice(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId, healthWorker, location, appVersion } = req.body;

    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          status: 'active',
          healthWorker: healthWorker ?? { name: 'Unknown' },
          location: location ?? {},
          appVersion,
          lastSync: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info(`Device registered/updated: ${deviceId}`);
    res.json({ success: true, device });
  } catch (err) {
    logger.error('registerDevice error', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
}

// ── GET /api/devices ──────────────────────────────────────────────────────────
export async function getDevices(req: Request, res: Response): Promise<void> {
  try {
    const { status, district } = req.query as Record<string, string>;
    const query: any = {};
    if (status)   query.status = status;
    if (district) query['location.district'] = district;

    const devices = await Device.find(query).sort({ lastSync: -1 }).lean();
    res.json({ data: devices, total: devices.length });
  } catch (err) {
    logger.error('getDevices error', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
}

// ── GET /api/devices/:deviceId ────────────────────────────────────────────────
export async function getDevice(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId }).lean();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

    // Recent activity
    const [recentTotal, recentPositive] = await Promise.all([
      Diagnosis.countDocuments({ deviceId, timestamp: { $gte: Date.now() - 30 * 86400000 } }),
      Diagnosis.countDocuments({ deviceId, isPositive: true, timestamp: { $gte: Date.now() - 30 * 86400000 } }),
    ]);

    res.json({ ...device, recentActivity: { total: recentTotal, positive: recentPositive } });
  } catch (err) {
    logger.error('getDevice error', err);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
}

// ── PATCH /api/devices/:deviceId ─────────────────────────────────────────────
export async function updateDevice(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.params;
    const allowed = ['healthWorker', 'location', 'appVersion', 'status'];
    const updates: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const device = await Device.findOneAndUpdate({ deviceId }, { $set: updates }, { new: true });
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

    res.json({ success: true, device });
  } catch (err) {
    logger.error('updateDevice error', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
}

// ── POST /api/devices/:deviceId/ping ─────────────────────────────────────────
export async function pingDevice(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.params;
    await Device.findOneAndUpdate(
      { deviceId },
      { $set: { lastSync: new Date(), status: 'active' } },
      { upsert: true }
    );
    res.json({ success: true, timestamp: new Date() });
  } catch (err) {
    logger.error('pingDevice error', err);
    res.status(500).json({ error: 'Ping failed' });
  }
}
