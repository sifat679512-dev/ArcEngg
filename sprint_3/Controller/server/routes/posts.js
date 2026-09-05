import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Post } from '../../../Model/Post.js';
import { Project } from '../../../Model/Project.js';
import { VerificationRequest } from '../../../Model/VerificationRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { eccEncrypt, eccDecrypt, getECCKeyPair, saveECCKeys, loadECCKeys } from '../utils/ecc.js';

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

// Helper function to decrypt post content
function decryptPostContent(post, username) {
  try {
    if (!post.content) return post;
    
    const eccKeys = loadECCKeys(username);
    if (!eccKeys) {
      console.log('[decryptPostContent] No ECC keys found for user:', username, '- returning encrypted content');
      return post;
    }
    
    const postData = post.toObject();
    try {
      // New ECC format: JSON array of encrypted points
      const decrypted = eccDecrypt(post.content, eccKeys.privateKey, eccKeys.publicKeyX, eccKeys.publicKeyY);
      postData.content = decrypted;
      console.log('[decryptPostContent] Successfully decrypted content for user:', username);
    } catch (e) {
      console.log('[decryptPostContent] Decryption failed:', e.message);
      // Return as-is if not encrypted
    }
    
    return postData;
  } catch (e) {
    console.error('[decryptPostContent] Error decrypting post:', e);
    return post;
  }
}

// Provider: create post (text+image), status = approved (no approval needed)
router.post(
  '/provider',
  requireAuth,
  ensureRole('provider'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { content } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      
      // Get or generate ECC keys for the user
      let eccKeys = loadECCKeys(req.user.username);
      if (!eccKeys) {
        eccKeys = getECCKeyPair(req.user.username);
        saveECCKeys(req.user.username, eccKeys);
      }
      
      // Encrypt content using ECC (new format returns JSON string directly)
      let encryptedContent = null;
      if (content) {
        encryptedContent = eccEncrypt(content, eccKeys.publicKeyX, eccKeys.publicKeyY);
      }
      
      const post = await Post.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username,
        content: encryptedContent || '',
        imageUrl,
        status: 'approved',
      });
      return res.status(201).json(post);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// Both client and provider: create post (text+image), status = approved (no approval needed)
router.post(
  '/',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    try {
      const { content } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log('[POST /api/posts/] Creating post for user:', req.user.username, 'role:', req.user.role);
      console.log('[POST /api/posts/] Content:', content, 'Image:', imageUrl);
      
      // Get or generate ECC keys for the user
      let eccKeys = loadECCKeys(req.user.username);
      if (!eccKeys) {
        eccKeys = getECCKeyPair(req.user.username);
        saveECCKeys(req.user.username, eccKeys);
      }
      
      // Encrypt content using ECC (new format returns JSON string directly)
      let encryptedContent = null;
      if (content) {
        encryptedContent = eccEncrypt(content, eccKeys.publicKeyX, eccKeys.publicKeyY);
      }
      
      const post = await Post.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username,
        content: encryptedContent || '',
        imageUrl,
        status: 'approved',
      });
      console.log('[POST /api/posts/] Post created with ID:', post._id);
      return res.status(201).json(post);
    } catch (e) {
      console.error('[POST /api/posts/] Error creating post:', e);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// Provider: list my posts (any status)
router.get('/provider/mine', requireAuth, ensureRole('provider'), async (req, res) => {
  const query = req.user.id && req.user.id !== 'admin' ? { authorId: req.user.id } : { authorUsername: req.user.username };
  const posts = await Post.find(query).sort({ createdAt: -1 });
  const decryptedPosts = posts.map(post => decryptPostContent(post, req.user.username));
  res.json(decryptedPosts);
});

// Both client and provider: list my posts (any status)
router.get('/mine', requireAuth, async (req, res) => {
  const query = req.user.id && req.user.id !== 'admin' ? { authorId: req.user.id } : { authorUsername: req.user.username };
  const posts = await Post.find(query).sort({ createdAt: -1 });
  const decryptedPosts = posts.map(post => decryptPostContent(post, req.user.username));
  res.json(decryptedPosts);
});

// Get posts by username (public endpoint for viewing other users' profiles)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const posts = await Post.find({ authorUsername: username, status: 'approved' }).sort({ createdAt: -1 });
    const decryptedPosts = posts.map(post => decryptPostContent(post, username));
    res.json(decryptedPosts);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
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
    const decryptedPosts = posts.map(post => decryptPostContent(post, post.authorUsername));
    res.json(decryptedPosts);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Client: personalized provider posts feed by latest project category (architecture|engineering)
router.get('/feed/personalized', requireAuth, async (req, res) => {
  try{
    if (req.user.role !== 'client'){
      // for non-clients, return public feed
      const posts = await Post.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(100)
      const decryptedPosts = posts.map(post => decryptPostContent(post, post.authorUsername));
      return res.json(decryptedPosts)
    }
    // Find client's latest project to infer preferred category
    const lastProj = await Project.findOne({ authorUsername: req.user.username }).sort({ createdAt: -1 }).select('category')
    const preferred = lastProj?.category && ['architecture','engineering'].includes(String(lastProj.category)) ? String(lastProj.category) : null
    const all = await Post.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(100)
    if (!preferred) {
      const decryptedPosts = all.map(post => decryptPostContent(post, post.authorUsername));
      return res.json(decryptedPosts)
    }
    // Map provider usernames to domain from latest approved verification
    const authors = Array.from(new Set(all.map(p=>p.authorUsername).filter(Boolean)))
    if (authors.length===0) {
      const decryptedPosts = all.map(post => decryptPostContent(post, post.authorUsername));
      return res.json(decryptedPosts)
    }
    const vrs = await VerificationRequest.aggregate([
      { $match: { username: { $in: authors }, status: 'approved' } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$username', category: { $first: '$subtype' }, main: { $first: '$category' } } }
    ])
    const toDomain = (row)=>{
      // provider_individual: subtype architect => architecture, engineer => engineering
      // provider_company => both; treat as match
      if (!row) return null
      if ((row.main||'').toLowerCase() === 'provider_company') return 'both'
      const sub = (row.category||'').toLowerCase()
      if (sub === 'architect') return 'architecture'
      if (sub === 'engineer') return 'engineering'
      return null
    }
    const map = new Map(vrs.map(v=>[v._id, toDomain(v)]))
    const score = (u)=>{
      const d = map.get(u) || null
      if (d === 'both') return 2
      if (d === preferred) return 1
      return 0
    }
    const sorted = [...all].sort((a,b)=> (score(b.authorUsername) - score(a.authorUsername)))
    const decryptedPosts = sorted.map(post => decryptPostContent(post, post.authorUsername));
    res.json(decryptedPosts)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router;
