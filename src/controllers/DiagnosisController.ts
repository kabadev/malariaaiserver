import { Request, Response } from 'express';
import Diagnosis from '../models/Diagnosis';
import logger from '../utils/logger';

// ── POST /api/diagnoses/sync ───────────────────────────────────────────────
export async function syncDiagnoses(req: any, res: Response): Promise<void> {
  try {
    const userId = req.userId || req.body.userId;
    const { diagnoses, deviceId } = req.body as {
      diagnoses: any[];
      deviceId: string;
      userId?: string;
    };

    if (!Array.isArray(diagnoses) || !deviceId) {
      res.status(400).json({ error: 'diagnoses array and deviceId are required' });
      return;
    }

    const saved: any[] = [];
    let positiveCount = 0;

    for (const d of diagnoses) {
      const doc = await Diagnosis.create({
        deviceId,
        userId:          userId || d.userId,
        patientInfo:     d.patientInfo,
        timestamp:       d.timestamp ?? Date.now(),
        isPositive:      d.isPositive,
        confidence:      d.confidence,
        parasiteDensity: d.parasiteDensity,
        location: {
          latitude:  d.location?.latitude  ?? 0,
          longitude: d.location?.longitude ?? 0,
          accuracy:  d.location?.accuracy,
          district:  d.district ?? d.location?.district,
          country:   'Rwanda',
        },
        synced:   true,
        syncedAt: new Date(),
      });
      saved.push(doc);
      if (d.isPositive) positiveCount++;
    }

    // Check for outbreak threshold
    const last24h = await Diagnosis.countDocuments({
      isPositive: true,
      timestamp: { $gte: Date.now() - 86_400_000 },
    });

    const threshold = parseInt(process.env.POSITIVE_ALERT_THRESHOLD ?? '10', 10);
    const outbreakDetected = last24h >= threshold;

    if (outbreakDetected) {
      logger.warn(`Outbreak threshold reached: ${last24h} positive cases in 24h`);
    }

    logger.info(`Synced ${saved.length} diagnoses from device ${deviceId}`);

    res.json({
      success: true,
      syncedCount: saved.length,
      positiveCount,
      outbreakDetected,
      last24hPositive: last24h,
    });
  } catch (err) {
    logger.error('syncDiagnoses error', err);
    res.status(500).json({ error: 'Failed to sync diagnoses' });
  }
}

// ── GET /api/diagnoses ─────────────────────────────────────────────────────
export async function getDiagnoses(req: Request, res: Response): Promise<void> {
  try {
    const { startDate, endDate, district, isPositive, page = '1', limit = '100' } = req.query as Record<string, string>;

    const query: any = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = parseInt(startDate);
      if (endDate)   query.timestamp.$lte = parseInt(endDate);
    }
    if (district)   query['location.district'] = district;
    if (isPositive !== undefined) query.isPositive = isPositive === 'true';

    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      Diagnosis.find(query).sort({ timestamp: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Diagnosis.countDocuments(query),
    ]);

    res.json({ data, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    logger.error('getDiagnoses error', err);
    res.status(500).json({ error: 'Failed to fetch diagnoses' });
  }
}

// ── GET /api/diagnoses/stats ───────────────────────────────────────────────
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const since = Date.now() - parseInt(days) * 86_400_000;

    const [totalCases, positiveCases, byDistrict, daily] = await Promise.all([
      Diagnosis.countDocuments({ timestamp: { $gte: since } }),
      Diagnosis.countDocuments({ timestamp: { $gte: since }, isPositive: true }),

      Diagnosis.aggregate([
        { $match: { timestamp: { $gte: since }, isPositive: true } },
        { $group: { _id: '$location.district', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Diagnosis.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestamp' } } },
            total:    { $sum: 1 },
            positive: { $sum: { $cond: ['$isPositive', 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const positivityRate = totalCases > 0 ? (positiveCases / totalCases) * 100 : 0;

    res.json({
      days: parseInt(days),
      totalCases,
      positiveCases,
      negativeCases: totalCases - positiveCases,
      positivityRate: parseFloat(positivityRate.toFixed(1)),
      byDistrict,
      daily,
      last24hPositive: await Diagnosis.countDocuments({
        isPositive: true,
        timestamp: { $gte: Date.now() - 86_400_000 },
      }),
    });
  } catch (err) {
    logger.error('getStats error', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

// ── GET /api/diagnoses/heatmap ─────────────────────────────────────────────
export async function getHeatmap(req: Request, res: Response): Promise<void> {
  try {
    const { days = '30' } = req.query as Record<string, string>;
    const since = Date.now() - parseInt(days) * 86_400_000;
    const bucket = 0.05; // ~5km grid

    const data = await Diagnosis.aggregate([
      { $match: { timestamp: { $gte: since }, isPositive: true } },
      {
        $group: {
          _id: {
            lat: { $multiply: [bucket, { $floor: { $divide: ['$location.latitude',  bucket] } }] },
            lon: { $multiply: [bucket, { $floor: { $divide: ['$location.longitude', bucket] } }] },
          },
          count:      { $sum: 1 },
          avgDensity: { $avg: '$parasiteDensity' },
        },
      },
      {
        $project: {
          latitude:   '$_id.lat',
          longitude:  '$_id.lon',
          count:      1,
          avgDensity: 1,
          intensity:  { $divide: ['$count', 10] },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ days: parseInt(days), data });
  } catch (err) {
    logger.error('getHeatmap error', err);
    res.status(500).json({ error: 'Failed to generate heatmap' });
  }
}
