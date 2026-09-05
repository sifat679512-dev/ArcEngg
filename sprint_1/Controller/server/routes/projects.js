import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Project } from '../../../Model/Project.js';
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
    const name = `project-${req.user?.id || 'anon'}-${Date.now()}${ext}`;
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

function ensureAnyRole(roles){
  return (req,res,next)=>{
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

// Client: create project request
router.post(
  '/',
  requireAuth,
  ensureRole('client'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { category, subcategory, tier, projectType, description } = req.body;
      if (!category || !['architecture', 'engineering'].includes(category)) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      const project = await Project.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username,
        category,
        subcategory: subcategory || undefined,
        tier: tier || undefined,
        projectType: projectType || undefined,
        description: description || '',
        imageUrl,
      });
      return res.status(201).json(project);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// Public: list all projects (latest first)
router.get('/feed', async (_req, res) => {
  try {
    const projects = await Project.find({}).sort({ createdAt: -1 });
    res.json(projects);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Provider: add a bid to a project
router.post('/:id/bids', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ message: 'Bid text required' })
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  project.bids.push({ userId: req.user.id !== 'admin' ? req.user.id : undefined, username: req.user.username, text: text.trim() })
  await project.save()
  res.status(201).json(project.bids[project.bids.length-1])
})

// Client (author): list bids for a project
router.get('/:id/bids', requireAuth, ensureRole('client'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  if (project.authorUsername !== req.user.username) return res.status(403).json({ message: 'Forbidden' })
  res.json(project.bids || [])
})

// Client (author): accept a bid
router.post('/:id/bids/:bidId/accept', requireAuth, ensureRole('client'), async (req,res)=>{
  const { id, bidId } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  if (project.authorUsername !== req.user.username) return res.status(403).json({ message: 'Forbidden' })
  let found = false
  project.bids = (project.bids || []).map(b => {
    if (b._id.toString() === bidId){ found = true; b.accepted = true } else { b.accepted = false }
    return b
  })
  if (!found) return res.status(404).json({ message: 'Bid not found' })
  await project.save()
  res.json({ ok: true })
})

// Provider: list accepted bids for current provider
router.get('/my/accepted-bids', requireAuth, ensureRole('provider'), async (req,res)=>{
  const username = req.user.username
  const projects = await Project.find({ 'bids.username': username, 'bids.accepted': true }).sort({ updatedAt: -1 })
  // Map to include only the accepted bid for this user
  const items = projects.map(p => ({
    projectId: p._id,
    authorUsername: p.authorUsername,
    category: p.category,
    subcategory: p.subcategory,
    tier: p.tier,
    projectType: p.projectType,
    description: p.description,
    imageUrl: p.imageUrl,
    bid: (p.bids || []).find(b => b.username === username && b.accepted) || null,
  }))
  res.json(items)
})

export default router;
