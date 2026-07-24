import mongoose, { Schema, Document } from 'mongoose';

export interface IAlert extends Document {
  type: 'outbreak' | 'high_density' | 'surge' | 'device_offline';
  severity: 'low' | 'medium' | 'high' | 'critical';
  district: string;
  message: string;
  data?: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  sentVia: ('sms' | 'email' | 'push')[];
  createdAt: Date;
}

const AlertSchema = new Schema({
  type: {
    type: String,
    enum: ['outbreak', 'high_density', 'surge', 'device_offline'],
    required: true,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
  },
  district:        { type: String, required: true, index: true },
  message:         { type: String, required: true },
  data:            Schema.Types.Mixed,
  acknowledged:    { type: Boolean, default: false, index: true },
  acknowledgedBy:  String,
  acknowledgedAt:  Date,
  sentVia:         [{ type: String, enum: ['sms', 'email', 'push'] }],
}, { timestamps: true });

AlertSchema.index({ createdAt: -1, acknowledged: 1 });

export default mongoose.model<IAlert>('Alert', AlertSchema);
