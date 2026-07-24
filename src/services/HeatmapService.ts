import Diagnosis from '../models/Diagnosis';
import axios from 'axios'; // BUG FIX: axios was used in reverseGeocode() but was never imported
import logger from '../utils/logger';

export class HeatmapService {
  static async generateHeatmapData(
    startDate: number,
    endDate: number,
    resolution: 'coarse' | 'fine' = 'fine'
  ) {
    try {
      const bucketSize = resolution === 'fine' ? 0.01 : 0.05;

      const heatmapData = await Diagnosis.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            isPositive: true,
          },
        },
        {
          $group: {
            _id: {
              lat: {
                $multiply: [
                  bucketSize,
                  { $floor: { $divide: ['$location.latitude', bucketSize] } },
                ],
              },
              lon: {
                $multiply: [
                  bucketSize,
                  { $floor: { $divide: ['$location.longitude', bucketSize] } },
                ],
              },
            },
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            avgDensity: { $avg: '$parasiteDensity' },
            recentCases: {
              $sum: {
                $cond: [
                  { $gte: ['$timestamp', Date.now() - 7 * 24 * 60 * 60 * 1000] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            latitude: '$_id.lat',
            longitude: '$_id.lon',
            intensity: {
              $multiply: [
                { $divide: ['$count', { $max: ['$count', 1] }] },
                { $divide: [{ $min: ['$avgDensity', 100000] }, 100000] },
              ],
            },
            count: 1,
            avgConfidence: 1,
            avgDensity: 1,
            recentCases: 1,
          },
        },
        { $sort: { intensity: -1 } },
      ]);

      return heatmapData;
    } catch (error) {
      logger.error('Failed to generate heatmap:', error);
      throw error;
    }
  }

  static async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<{ district: string; region: string; country: string }> {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        { headers: { 'User-Agent': 'MalariaAI/1.0' } }
      );

      const address = response.data.address;
      let district = address.suburb || address.village || address.city || address.town;
      let region = address.state || address.province || address.region;
      let country = address.country || 'Rwanda';

      if (country === 'Rwanda') {
        const rwandaDistricts = this.getRwandaDistricts();
        for (const [districtName, bounds] of Object.entries(rwandaDistricts)) {
          if (
            latitude >= bounds.south &&
            latitude <= bounds.north &&
            longitude >= bounds.west &&
            longitude <= bounds.east
          ) {
            district = districtName;
            region = bounds.region;
            break;
          }
        }
      }

      return { district: district || 'Unknown', region: region || 'Unknown', country };
    } catch (error) {
      logger.error('Reverse geocoding failed:', error);
      return { district: 'Unknown', region: 'Unknown', country: 'Rwanda' };
    }
  }

  private static getRwandaDistricts(): Record<
    string,
    { north: number; south: number; west: number; east: number; region: string }
  > {
    return {
      Kigali: { north: -1.85, south: -2.0, west: 30.05, east: 30.15, region: 'Kigali City' },
      Musanze: { north: -1.4, south: -1.55, west: 29.6, east: 29.75, region: 'Northern' },
      Rubavu: { north: -1.6, south: -1.75, west: 29.2, east: 29.4, region: 'Western' },
      Huye: { north: -2.5, south: -2.65, west: 29.7, east: 29.85, region: 'Southern' },
      Rwamagana: { north: -1.9, south: -2.1, west: 30.35, east: 30.55, region: 'Eastern' },
    };
  }

  static async getRiskScore(
    latitude: number,
    longitude: number
  ): Promise<{
    riskLevel: 'low' | 'medium' | 'high' | 'epidemic';
    score: number;
    recentCases: number;
    recommendation: string;
  }> {
    try {
      const radius = 0.05;
      const recentCases = await Diagnosis.countDocuments({
        'location.latitude': { $gte: latitude - radius, $lte: latitude + radius },
        'location.longitude': { $gte: longitude - radius, $lte: longitude + radius },
        timestamp: { $gte: Date.now() - 30 * 24 * 60 * 60 * 1000 },
        isPositive: true,
      });

      let riskLevel: 'low' | 'medium' | 'high' | 'epidemic';
      let score: number;
      let recommendation: string;

      if (recentCases >= 50) {
        riskLevel = 'epidemic';
        score = 1.0;
        recommendation = 'Active outbreak. Immediate intervention required.';
      } else if (recentCases >= 20) {
        riskLevel = 'high';
        score = 0.8;
        recommendation = 'High malaria activity. Intensify prevention measures.';
      } else if (recentCases >= 5) {
        riskLevel = 'medium';
        score = 0.5;
        recommendation = 'Moderate risk. Maintain surveillance and vector control.';
      } else {
        riskLevel = 'low';
        score = 0.2;
        recommendation = 'Low risk. Continue routine prevention.';
      }

      return { riskLevel, score, recentCases, recommendation };
    } catch (error) {
      logger.error('Risk score calculation failed:', error);
      return {
        riskLevel: 'low',
        score: 0,
        recentCases: 0,
        recommendation: 'Unable to calculate risk',
      };
    }
  }
}
