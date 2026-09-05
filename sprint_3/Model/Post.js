import mongoose from '../Controller/server/config/mongoose.js';

const postSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    authorUsername: { type: String, required: true },
    content: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending', index: true },
  },
  { timestamps: true }
);

export const Post = mongoose.model('Post', postSchema);
