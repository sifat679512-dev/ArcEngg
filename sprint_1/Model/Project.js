import mongoose from '../Controller/server/config/mongoose.js';

const projectSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    authorUsername: { type: String, required: true },
    category: { type: String, enum: ['architecture', 'engineering'], required: true },
    subcategory: { type: String, trim: true },
    tier: { type: String, enum: ['luxuries', 'regular', 'normal'], required: false },
    projectType: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    bids: [
      new mongoose.Schema(
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
          username: { type: String, required: true },
          text: { type: String, required: true, trim: true },
          accepted: { type: Boolean, default: false },
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: false } }
      ),
    ],
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
