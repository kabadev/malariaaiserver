import { Request, Response } from 'express'; // BUG FIX: Was missing - used throughout but never imported
import Diagnosis from '../models/Diagnosis';
import Device from '../models/Device';
import Alert from '../models/Alert';
import { HeatmapService } from '../services/HeatmapService';
import { ExportService } from '../services/ExportService';
import logger from '../utils/logger';

export class AnalyticsController {
  static async getDashboardStats(req: Request, res: Response) {
    try {
      const { days = 30 } = req.query;
      const startDate = Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000;

      const [
        totalCases,
        positiveCases,
        totalDevices,
        activeDevices,
        recentAlerts,
        districtStats,
      ] = await Promise.all([
        Diagnosis.countDocuments({ timestamp: { $gte: startDate } }),
        Diagnosis.countDocuments({ timestamp: { $gte: startDate }, isPositive: true }),
        Device.countDocuments(),
        Device.countDocuments({
          status: 'active',
          lastSync: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        Alert.countDocuments({
          createdAt: { $gte: new Date(startDate) },
          acknowledged: false,
        }),
        Diagnosis.aggregate([
          { $match: { timestamp: { $gte: startDate }, isPositive: true } },
          { $group: { _id: '$location.district', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

      const positivityRate = totalCases > 0 ? (positiveCases / totalCases) * 100 : 0;

      res.json({
        timeRange: `${days} days`,
        totalCases,
        positiveCases,
        positivityRate: positivityRate.toFixed(1),
        totalDevices,
        activeDevices,
        activeDevicesRate: totalDevices > 0 ? (activeDevices / totalDevices) * 100 : 0,
        pendingAlerts: recentAlerts,
        topDistricts: districtStats,
        lastUpdated: new Date(),
      });
    } catch (error) {
      logger.error('Dashboard stats failed:', error);
      res.status(500).json({ error: 'Failed to get dashboard statistics' });
    }
  }

  static async getTrends(req: Request, res: Response) {
    try {
      const { days = 90, granularity = 'day' } = req.query;
      const startDate = Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000;

      let groupBy: any;
      if (granularity === 'day') {
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestamp' } } };
      } else if (granularity === 'week') {
        groupBy = { $week: { $toDate: '$timestamp' } };
      } else {
        groupBy = { $month: { $toDate: '$timestamp' } };
      }

      const trends = await Diagnosis.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: groupBy,
            total: { $sum: 1 },
            positive: { $sum: { $cond: ['$isPositive', 1, 0] } },
            avgConfidence: { $avg: '$confidence' },
            avgDensity: { $avg: '$parasiteDensity' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        granularity,
        data: trends,
        forecast: await this.generateForecast(trends),
      });
    } catch (error) {
      logger.error('Trends fetch failed:', error);
      res.status(500).json({ error: 'Failed to get trends' });
    }
  }

  private static async generateForecast(trends: any[]) {
    if (trends.length < 7) return null;

    const lastWeek = trends.slice(-7);
    const avgPositive = lastWeek.reduce((sum: number, day: any) => sum + day.positive, 0) / 7;
    const trend = lastWeek[6].positive - lastWeek[0].positive;

    return {
      expectedDaily: Math.round(avgPositive),
      trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      nextWeekProjection: Math.round(avgPositive * 7 + trend * 3.5),
    };
  }

  static async getHeatmap(req: Request, res: Response) {
    try {
      const { days = 30, resolution = 'fine' } = req.query;
      const startDate = Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000;

      const heatmapData = await HeatmapService.generateHeatmapData(
        startDate,
        Date.now(),
        resolution as 'coarse' | 'fine'
      );

      res.json({
        timeRange: `${days} days`,
        resolution,
        data: heatmapData,
        generatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Heatmap generation failed:', error);
      res.status(500).json({ error: 'Failed to generate heatmap' });
    }
  }

  static async getDistrictRanking(req: Request, res: Response) {
    try {
      const { metric = 'cases', days = 30 } = req.query;
      const startDate = Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000;

      let ranking;
      if (metric === 'cases') {
        ranking = await Diagnosis.aggregate([
          { $match: { timestamp: { $gte: startDate }, isPositive: true } },
          { $group: { _id: '$location.district', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
        ]);
      } else if (metric === 'density') {
        ranking = await Diagnosis.aggregate([
          {
            $match: {
              timestamp: { $gte: startDate },
              isPositive: true,
              parasiteDensity: { $exists: true },
            },
          },
          { $group: { _id: '$location.district', value: { $avg: '$parasiteDensity' } } },
          { $sort: { value: -1 } },
        ]);
      } else {
        ranking = [];
      }

      res.json({
        metric,
        timeRange: `${days} days`,
        data: ranking,
      });
    } catch (error) {
      logger.error('District ranking failed:', error);
      res.status(500).json({ error: 'Failed to get district ranking' });
    }
  }

  static async exportData(req: Request, res: Response) {
    try {
      const { format = 'csv', startDate, endDate, district } = req.query;

      const query: any = {};
      if (startDate) query.timestamp = { $gte: parseInt(startDate as string) };
      if (endDate) query.timestamp = { ...query.timestamp, $lte: parseInt(endDate as string) };
      if (district) query['location.district'] = district;

      const diagnoses = await Diagnosis.find(query).sort({ timestamp: -1 });

      if (format === 'csv') {
        const csv = await ExportService.toCSV(diagnoses);
        res.header('Content-Type', 'text/csv');
        res.attachment(`malaria_export_${Date.now()}.csv`);
        res.send(csv);
      } else if (format === 'json') {
        res.json(diagnoses);
      } else if (format === 'geojson') {
        const geojson = await ExportService.toGeoJSON(diagnoses);
        res.json(geojson);
      }
    } catch (error) {
      logger.error('Export failed:', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  }
}
