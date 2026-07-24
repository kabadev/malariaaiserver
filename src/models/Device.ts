import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  status: 'active' | 'inactive' | 'suspended';
  healthWorker: {
    name: string;
    phone?: string;
    email?: string;
    role?: string;
  };
  location: {
    district?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  lastSync?: Date;
  appVersion?: string;
  totalDiagnoses: number;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  healthWorker: {
    name:  { type: String, default: 'Unknown' },
    phone: String,
    email: String,
    role:  { type: String, default: 'Field Worker' },
  },
  location: {
    district:  String,
    region:    String,
    country:   { type: String, default: 'Rwanda' },
    latitude:  Number,
    longitude: Number,
  },
  lastSync:       Date,
  appVersion:     String,
  totalDiagnoses: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<IDevice>('Device', DeviceSchema);
