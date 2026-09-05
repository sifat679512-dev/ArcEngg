import mongoose from '../Controller/server/config/mongoose.js';

const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true, trim: true },
    role: { type: String, enum: ['client', 'provider', 'admin'], required: true },
    tokenHash: { type: String, required: true, index: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    fingerprint: { type: String, required: true, index: true },
    isValid: { type: Boolean, default: true },
    isRevoked: { type: Boolean, default: false, index: true },
    revokedReason: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
