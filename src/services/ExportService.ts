import { IDiagnosis } from '../models/Diagnosis';

export class ExportService {
  static async toCSV(diagnoses: IDiagnosis[]): Promise<string> {
    const headers = [
      'id',
      'deviceId',
      'timestamp',
      'date',
      'isPositive',
      'confidence',
      'parasiteDensity',
      'latitude',
      'longitude',
      'district',
      'region',
      'country',
      'synced',
    ];

    const rows = diagnoses.map((d) => {
      const values = [
        String(d._id),
        d.deviceId,
        String(d.timestamp),
        new Date(d.timestamp).toISOString(),
        String(d.isPositive),
        String(d.confidence),
        String(d.parasiteDensity ?? ''),
        String(d.location?.latitude ?? ''),
        String(d.location?.longitude ?? ''),
        d.location?.district ?? '',
        d.location?.region ?? '',
        d.location?.country ?? '',
        String(d.synced),
      ];

      return values
        .map((value) => {
          const escaped = value.replace(/"/g, '""');
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  static async toGeoJSON(diagnoses: IDiagnosis[]): Promise<Record<string, unknown>> {
    return {
      type: 'FeatureCollection',
      features: diagnoses.map((d) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [d.location?.longitude ?? 0, d.location?.latitude ?? 0],
        },
        properties: {
          id: String(d._id),
          deviceId: d.deviceId,
          timestamp: d.timestamp,
          isPositive: d.isPositive,
          confidence: d.confidence,
          parasiteDensity: d.parasiteDensity,
          district: d.location?.district,
          region: d.location?.region,
          country: d.location?.country,
          synced: d.synced,
        },
      })),
    };
  }
}
