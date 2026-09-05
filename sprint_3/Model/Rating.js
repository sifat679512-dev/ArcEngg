import mongoose from '../Controller/server/config/mongoose.js';

const ratingSchema = new mongoose.Schema({
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUsername: { type: String, required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromUsername: { type: String, required: true },
  fromRole: { type: String, enum: ['client','provider','admin'], required: true },
  toRole: { type: String, enum: ['client','provider','admin'], required: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: '' },
}, { timestamps: true });

export const Rating = mongoose.model('Rating', ratingSchema);
