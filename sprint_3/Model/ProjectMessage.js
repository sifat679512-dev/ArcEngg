import mongoose from '../Controller/server/config/mongoose.js';

const projectMessageSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    bidId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderUsername: { type: String, required: true },
    text: { type: String, required: true, trim: true },
    mac: { type: String, required: true }, // CBC-MAC for message integrity
  },
  { timestamps: true }
);

export const ProjectMessage = mongoose.model('ProjectMessage', projectMessageSchema);
