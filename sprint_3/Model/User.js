import mongoose from '../Controller/server/config/mongoose.js';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['client', 'provider'], required: true },
    // Personal information
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    verified: { type: Boolean, default: false },
    verifiedType: { type: String, trim: true },
    // Aggregate ratings
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    // Client: list of favorited provider usernames
    favoriteProviders: { type: [String], default: [] },
    // Account ban/suspension fields
    banned: { type: Boolean, default: false },
    bannedAt: { type: Date },
    bannedReason: { type: String, trim: true }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
