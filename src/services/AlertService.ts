import { Request, Response } from 'express'; // BUG FIX: These were used but never imported
import Alert, { IAlert } from '../models/Alert'; // BUG FIX: IAlert was used but not imported
import Diagnosis, { IDiagnosis } from '../models/Diagnosis';
import Device from '../models/Device';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import logger from '../utils/logger';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT!),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export class AlertService {
  // Check for malaria outbreak patterns
  static async checkOutbreakPatterns(newDiagnoses: IDiagnosis[]): Promise<boolean> {
    try {
      const districtMap = new Map<string, IDiagnosis[]>();

      for (const diagnosis of newDiagnoses) {
        const district = diagnosis.location.district;
        if (!district) continue;

        if (!districtMap.has(district)) {
          districtMap.set(district, []);
        }
        districtMap.get(district)!.push(diagnosis);
      }

      for (const [district, diagnoses] of districtMap) {
        const positiveCases = diagnoses.filter((d) => d.isPositive).length;
        if (positiveCases === 0) continue;

        const last24Hours = await Diagnosis.countDocuments({
          'location.district': district,
          timestamp: { $gte: Date.now() - 24 * 60 * 60 * 1000 },
          isPositive: true,
        });

        const totalLast24h = last24Hours + positiveCases;
        const threshold = parseInt(process.env.POSITIVE_ALERT_THRESHOLD || '10');

        if (totalLast24h >= threshold) {
          await this.createOutbreakAlert(district, totalLast24h);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Outbreak check failed:', error);
      return false;
    }
  }

  private static async createOutbreakAlert(district: string, caseCount: number) {
    const alert = new Alert({
      type: 'outbreak',
      severity: caseCount >= 20 ? 'critical' : caseCount >= 10 ? 'high' : 'medium',
      district,
      message: `Malaria outbreak detected in ${district}: ${caseCount} cases in 24 hours`,
      data: {
        positiveCases: caseCount,
        timeWindow: 24,
      },
      sentVia: [],
    });

    await alert.save();
    await this.sendAlertNotifications(alert);
    logger.warn(`Outbreak alert created for ${district}: ${caseCount} cases`);
  }

  static async sendHighDensityAlert(diagnosis: IDiagnosis) {
    const alert = new Alert({
      type: 'high_density',
      severity: 'high',
      district: diagnosis.location.district || 'Unknown',
      message: `High parasite density (${diagnosis.parasiteDensity}/μL) detected in ${diagnosis.location.district}`,
      data: {
        parasiteDensity: diagnosis.parasiteDensity,
        deviceId: diagnosis.deviceId,
      },
      sentVia: [],
    });

    await alert.save();
    await this.sendAlertNotifications(alert);
  }

  static async sendAlertNotifications(alert: IAlert) {
    const sentVia: ('sms' | 'email' | 'push')[] = [];

    const devices = await Device.find({
      'location.district': alert.district,
      status: 'active',
    });

    if (process.env.TWILIO_ACCOUNT_SID) {
      try {
        for (const device of devices) {
          if (device.healthWorker.phone) {
            await twilioClient.messages.create({
              body: `🚨 MALARIA ALERT: ${alert.message}. Please take immediate action.`,
              to: device.healthWorker.phone,
              from: process.env.TWILIO_PHONE_NUMBER,
            });
          }
        }
        sentVia.push('sms');
        logger.info(`SMS alerts sent to ${devices.length} health workers`);
      } catch (error) {
        logger.error('SMS sending failed:', error);
      }
    }

    if (process.env.SMTP_USER) {
      try {
        const emails = devices
          .filter((d) => d.healthWorker.email)
          .map((d) => d.healthWorker.email);

        if (emails.length > 0) {
          await emailTransporter.sendMail({
            from: process.env.SMTP_USER,
            to: emails.join(','),
            subject: `🚨 Malaria Alert: ${alert.district}`,
            html: `
              <h2>Malaria Alert</h2>
              <p><strong>Type:</strong> ${alert.type}</p>
              <p><strong>Severity:</strong> ${alert.severity}</p>
              <p><strong>District:</strong> ${alert.district}</p>
              <p><strong>Message:</strong> ${alert.message}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <hr />
              <p>Please check the dashboard for more details.</p>
            `,
          });
          sentVia.push('email');
        }
      } catch (error) {
        logger.error('Email sending failed:', error);
      }
    }

    alert.sentVia = sentVia;
    await alert.save();
  }

  // BUG FIX: These methods used Request/Response from express but the class never
  // imported them. They are now properly typed.
  static async getActiveAlerts(req: Request, res: Response) {
    try {
      const alerts = await Alert.find({
        acknowledged: false,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }).sort({ createdAt: -1, severity: -1 });

      res.json(alerts);
    } catch (error) {
      logger.error('Failed to fetch alerts:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  }

  static async acknowledgeAlert(req: Request, res: Response) {
    try {
      const { alertId } = req.params;
      const { acknowledgedBy } = req.body;

      const alert = await Alert.findByIdAndUpdate(
        alertId,
        {
          acknowledged: true,
          acknowledgedBy,
          acknowledgedAt: new Date(),
        },
        { new: true }
      );

      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      res.json(alert);
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  }
}
