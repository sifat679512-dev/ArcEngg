import mongoose from '../Controller/server/config/mongoose.js';

const paymentSubmissionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    bidId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientUsername: { type: String, required: true },
    imageUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export const PaymentSubmission = mongoose.model('PaymentSubmission', paymentSubmissionSchema);
