import mongoose from '../Controller/server/config/mongoose.js';

const reportSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    bidId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reporterUsername: { type: String, required: true },
    reportedUsername: { type: String, required: true },
    reason: { type: String, required: true, trim: true },
    evidenceUrl: { type: String, trim: true },
    status: { type: String, enum: ['open', 'warned', 'closed'], default: 'open' },
  },
  { timestamps: true }
);

export const Report = mongoose.model('Report', reportSchema);
