import { Request, Response } from 'express';
import Alert, { IAlert } from '../models/Alert';
import Diagnosis from '../models/Diagnosis';
import logger from '../utils/logger';
import { AlertService } from '../services/AlertService';

// ── GET /api/alerts ───────────────────────────────────────────────────────────
export async function getAlerts(req: Request, res: Response): Promise<void> {
  try {
    const { acknowledged, severity, district, limit = '50' } = req.query as Record<string, string>;
    const query: any = {};
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';
    if (severity) query.severity = severity;
    if (district) query.district = district;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const unacknowledgedCount = await Alert.countDocuments({ acknowledged: false });

    res.json({ data: alerts, total: alerts.length, unacknowledgedCount });
  } catch (err) {
    logger.error('getAlerts error', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

// ── POST /api/alerts/:id/acknowledge ─────────────────────────────────────────
export async function acknowledgeAlert(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { acknowledgedBy = 'System' } = req.body;

    const alert = await Alert.findByIdAndUpdate(
      id,
      { $set: { acknowledged: true, acknowledgedBy, acknowledgedAt: new Date() } },
      { new: true }
    );

    if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }

    logger.info(`Alert ${id} acknowledged by ${acknowledgedBy}`);
    res.json({ success: true, alert });
  } catch (err) {
    logger.error('acknowledgeAlert error', err);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
}

// ── POST /api/alerts/check-outbreak ──────────────────────────────────────────
// Called automatically after each sync batch; can also be triggered manually
export async function checkAndCreateAlerts(req: Request, res: Response): Promise<void> {
  try {
    const threshold = parseInt(process.env.POSITIVE_ALERT_THRESHOLD ?? '10', 10);
    const since24h  = Date.now() - 86_400_000;

    // Group positive cases by district in last 24h
    const byDistrict = await Diagnosis.aggregate([
      { $match: { isPositive: true, timestamp: { $gte: since24h } } },
      { $group: { _id: '$location.district', count: { $sum: 1 }, avgDensity: { $avg: '$parasiteDensity' } } },
      { $sort: { count: -1 } },
    ]);

    const created: any[] = [];

    for (const { _id: district, count, avgDensity } of byDistrict) {
      if (!district || count < threshold) continue;

      // Don't duplicate: skip if an unacknowledged outbreak alert already exists for this district today
      const existing = await Alert.findOne({
        type: 'outbreak',
        district,
        acknowledged: false,
        createdAt: { $gte: new Date(Date.now() - 86_400_000) },
      });
      if (existing) continue;

      const severity = count >= 50 ? 'critical' : count >= 20 ? 'high' : 'medium';
      const alert = await Alert.create({
        type: 'outbreak',
        severity,
        district,
        message: `Malaria outbreak in ${district}: ${count} positive cases in the last 24 hours`,
        data: { positiveCases: count, avgParasiteDensity: Math.round(avgDensity ?? 0), threshold },
        sentVia: [],
      });

      created.push(alert);
      logger.warn(`Outbreak alert created — ${district}: ${count} cases`);
      await AlertService.sendAlertNotifications(alert as unknown as IAlert);
    }

    // High-density alerts (single cases with very high parasite count)
    const highDensity = await Diagnosis.find({
      isPositive: true,
      parasiteDensity: { $gte: 100_000 },
      timestamp: { $gte: since24h },
    }).lean();

    for (const d of highDensity) {
      const existing = await Alert.findOne({
        type: 'high_density',
        district: d.location?.district,
        createdAt: { $gte: new Date(since24h) },
        acknowledged: false,
      });
      if (existing) continue;

      const alert = await Alert.create({
        type: 'high_density',
        severity: 'high',
        district: d.location?.district ?? 'Unknown',
        message: `Critical parasite density (${d.parasiteDensity?.toLocaleString()}/μL) in ${d.location?.district ?? 'Unknown'}`,
        data: { parasiteDensity: d.parasiteDensity, deviceId: d.deviceId },
        sentVia: [],
      });
      created.push(alert);
      await AlertService.sendAlertNotifications(alert as unknown as IAlert);
    }

    res.json({ alertsCreated: created.length, alerts: created });
  } catch (err) {
    logger.error('checkAndCreateAlerts error', err);
    res.status(500).json({ error: 'Alert check failed' });
  }
}

// ── DELETE /api/alerts/:id ────────────────────────────────────────────────────
export async function deleteAlert(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await Alert.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteAlert error', err);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
}
