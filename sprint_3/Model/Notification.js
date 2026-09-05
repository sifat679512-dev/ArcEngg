import mongoose from '../Controller/server/config/mongoose.js';

const notificationSchema = new mongoose.Schema({
  toUsername: { type: String, required: true },
  type: { type: String, enum: ['bid','bid_accepted'], required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  fromUsername: { type: String, required: true },
  message: { type: String, required: true, trim: true },
  read: { type: Boolean, default: false },
}, { timestamps: true })

export const Notification = mongoose.model('Notification', notificationSchema)
