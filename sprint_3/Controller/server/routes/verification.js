import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';
import { VerificationRequest } from '../../../Model/VerificationRequest.js';
import { User } from '../../../Model/User.js';

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
    const safe = (file.fieldname || 'file').replace(/[^a-zA-Z0-9_-]/g, '');
    const name = `verify-${req.user?.id || 'anon'}-${safe}-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

function ensureRoleAny(roles){
  return (req,res,next)=>{
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  }
}
function ensureAdmin(req,res,next){
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  next();
}

// Submit verification request (client or provider)
router.post(
  '/request',
  requireAuth,
  ensureRoleAny(['client','provider']),
  upload.fields([
    { name: 'nid', maxCount: 1 },
    { name: 'certificates', maxCount: 5 },
    { name: 'license', maxCount: 1 },
    { name: 'companyLicense', maxCount: 1 },
    { name: 'companyRegistrations', maxCount: 5 },
  ]),
  async (req,res) => {
    try{
      const { category, subtype, description } = req.body; // category: client | provider_individual | provider_company
      if (!category) return res.status(400).json({ message: 'category is required' });
      const nidUrl = req.files?.nid?.[0] ? `/uploads/${req.files.nid[0].filename}` : undefined;
      const certificateUrls = (req.files?.certificates || []).map(f=>`/uploads/${f.filename}`);
      const licenseUrl = req.files?.license?.[0] ? `/uploads/${req.files.license[0].filename}` : undefined;
      const companyLicenseUrl = req.files?.companyLicense?.[0] ? `/uploads/${req.files.companyLicense[0].filename}` : undefined;
      const companyRegistrationUrls = (req.files?.companyRegistrations || []).map(f=>`/uploads/${f.filename}`);

      const vr = await VerificationRequest.create({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        category,
        subtype: subtype || undefined,
        description: description || '',
        nidUrl,
        certificateUrls,
        licenseUrl,
        companyLicenseUrl,
        companyRegistrationUrls,
      });
      res.status(201).json(vr);
    }catch(e){
      console.error(e);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Admin: list pending
router.get('/admin/pending', requireAuth, ensureAdmin, async (_req,res)=>{
  const items = await VerificationRequest.find({ status: 'pending' }).sort({ createdAt: 1 });
  res.json(items);
});

// Admin: approve
router.post('/admin/approve/:id', requireAuth, ensureAdmin, async (req,res)=>{
  const { id } = req.params;
  const vr = await VerificationRequest.findById(id);
  if (!vr) return res.status(404).json({ message: 'Request not found' });
  vr.status = 'approved';
  await vr.save();
  await User.findByIdAndUpdate(vr.userId, { verified: true, verifiedType: vr.category }, { new: true });
  res.json(vr);
});

export default router;
// Public: get verified map for a list of usernames
// GET /api/verification/verified?usernames=a,b,c
router.get('/verified', async (req, res) => {
  const raw = (req.query.usernames || '').toString()
  const names = raw.split(',').map(s=>s.trim()).filter(Boolean)
  if (names.length === 0) return res.json({})
  const users = await User.find({ username: { $in: names } }).select('username verified')
  const map = {}
  users.forEach(u => { map[u.username] = !!u.verified })
  res.json(map)
})
