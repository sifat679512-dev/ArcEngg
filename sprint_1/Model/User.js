import mongoose from '../Controller/server/config/mongoose.js';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['client', 'provider'], required: true },
    displayName: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    verified: { type: Boolean, default: false },
    verifiedType: { type: String, trim: true }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
