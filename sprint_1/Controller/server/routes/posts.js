import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Post } from '../../../Model/Post.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Uploads directory (reuse server/uploads)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `post-${req.user?.id || 'anon'}-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

function ensureRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

// Provider: create post (text+image), status = pending
router.post(
  '/provider',
  requireAuth,
  ensureRole('provider'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { content } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      const post = await Post.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username,
        content: content || '',
        imageUrl,
        status: 'pending',
      });
      return res.status(201).json(post);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// Provider: list my posts (any status)
router.get('/provider/mine', requireAuth, ensureRole('provider'), async (req, res) => {
  const query = req.user.id && req.user.id !== 'admin' ? { authorId: req.user.id } : { authorUsername: req.user.username };
  const posts = await Post.find(query).sort({ createdAt: -1 });
  res.json(posts);
});

// Admin: list pending posts
router.get('/admin/pending', requireAuth, ensureRole('admin'), async (_req, res) => {
  const posts = await Post.find({ status: 'pending' }).sort({ createdAt: 1 });
  res.json(posts);
});

// Admin: approve a post
router.post('/admin/approve/:id', requireAuth, ensureRole('admin'), async (req, res) => {
  const { id } = req.params;
  const post = await Post.findByIdAndUpdate(id, { status: 'approved' }, { new: true });
  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json(post);
});

// Public: approved feed
router.get('/feed', async (_req, res) => {
  try {
    const posts = await Post.find({ status: 'approved' }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
