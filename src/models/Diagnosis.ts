import mongoose, { Schema, Document } from 'mongoose';

export interface IDiagnosis extends Document {
  deviceId: string;
  userId?: string;
  patientInfo?: {
    name: string;
    age: string | number;
    gender?: string;
    patientId?: string;
  };
  timestamp: number;
  isPositive: boolean;
  confidence: number;
  parasiteDensity?: number;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    district?: string;
    region?: string;
    country?: string;
  };
  synced: boolean;
  syncedAt: Date;
  createdAt: Date;
}

const DiagnosisSchema = new Schema({
  deviceId:        { type: String, required: true, index: true },
  userId:          { type: String, index: true },
  patientInfo: {
    name: String,
    age: Schema.Types.Mixed,
    gender: String,
    patientId: String,
  },
  timestamp:       { type: Number, required: true, index: true },
  isPositive:      { type: Boolean, required: true, index: true },
  confidence:      { type: Number, required: true, min: 0, max: 1 },
  parasiteDensity: { type: Number, min: 0 },
  location: {
    latitude:  { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy:  Number,
    district:  String,
    region:    String,
    country:   { type: String, default: 'Rwanda' },
  },
  synced:   { type: Boolean, default: false },
  syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

DiagnosisSchema.index({ timestamp: -1, isPositive: 1 });
DiagnosisSchema.index({ 'location.district': 1, timestamp: -1 });

export default mongoose.model<IDiagnosis>('Diagnosis', DiagnosisSchema);
