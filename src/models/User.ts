import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  organizationName?: string;
  country?: string;
  organizationType?: string;
  isOnboarded: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    organizationName: { type: String, default: '' },
    country: { type: String, default: '' },
    organizationType: { type: String, default: 'Clinic' },
    isOnboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
