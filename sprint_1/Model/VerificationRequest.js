import mongoose from '../Controller/server/config/mongoose.js';

const verificationRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    role: { type: String, enum: ['client', 'provider'], required: true },
    category: { type: String, enum: ['client', 'provider_individual', 'provider_company'], required: true },
    subtype: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending', index: true },
    // file URLs
    nidUrl: { type: String, trim: true },
    certificateUrls: [{ type: String, trim: true }],
    licenseUrl: { type: String, trim: true },
    companyLicenseUrl: { type: String, trim: true },
    companyRegistrationUrls: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

export const VerificationRequest = mongoose.model('VerificationRequest', verificationRequestSchema);
