import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Project } from '../../../Model/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { ProjectMessage } from '../../../Model/ProjectMessage.js';
import { google } from 'googleapis';
import { CalendarToken } from '../../../Model/CalendarToken.js';

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

// Detect contact info/social links in chat message
function containsBannedContact(text){
  if (!text) return false;
  const t = String(text).toLowerCase();
  const keywords = ['whatsapp','wa.me','messenger','facebook','fb.com','instagram','ig','telegram','t.me','viber','imo','snapchat','wechat','phone','mobile','call','email','gmail','outlook','yahoo'];
  if (keywords.some(k => t.includes(k))) return true;
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRe = /(https?:\/\/|www\.)\S+/i;
  const phoneRe = /\b\+?\d[\d\s\-().]{7,}\b/;
  return emailRe.test(t) || urlRe.test(t) || phoneRe.test(t);
}

// Client: create project request
router.post(
  '/',
  requireAuth,
  ensureRole('client'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { category, subcategory, tier, projectType, description, biddingDeadline, calendarEventId, location } = req.body;
      if (!category || !['architecture', 'engineering'].includes(category)) {
        return res.status(400).json({ message: 'Invalid category' });
      }
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      // Optional Google Maps pin
      let loc
      if (location) {
        try {
          const L = typeof location === 'string' ? JSON.parse(location) : location
          if ((L.lat!=null && L.lng!=null) && !Number.isNaN(Number(L.lat)) && !Number.isNaN(Number(L.lng))){
            loc = { lat: Number(L.lat), lng: Number(L.lng), address: L.address || undefined, placeId: L.placeId || undefined }
          }
        } catch {}
      }
      let bd
      if (biddingDeadline) {
        const d = new Date(biddingDeadline)
        if (isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid biddingDeadline' })
        if (d.getTime() <= Date.now()) return res.status(400).json({ message: 'biddingDeadline must be in the future' })
        bd = d
      }
      let eventId = calendarEventId || undefined
      if (!eventId && bd) {
        try {
          const tokenDoc = await CalendarToken.findOne({ username: req.user.username })
          if (tokenDoc) {
            const oauth2 = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5002/api/calendar/oauth2callback'
            )
            oauth2.setCredentials({
              access_token: tokenDoc.accessToken,
              refresh_token: tokenDoc.refreshToken,
              expiry_date: tokenDoc.expiryDate,
              token_type: tokenDoc.tokenType,
              scope: tokenDoc.scope,
            })
            const calendar = google.calendar({ version: 'v3', auth: oauth2 })
            const startISO = bd.toISOString()
            const endISO = new Date(bd.getTime() + 60*60*1000).toISOString()
            const resp = await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: 'Project Bidding Deadline',
                description: description || '',
                start: { dateTime: startISO, timeZone: 'UTC' },
                end: { dateTime: endISO, timeZone: 'UTC' },
              }
            })
            eventId = resp.data.id
          }
        } catch (e) {
          console.error('Calendar create event failed', e?.message || e)
        }
      }
      const project = await Project.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username,
        category,
        subcategory: subcategory || undefined,
        tier: tier || undefined,
        projectType: projectType || undefined,
        description: description || '',
        imageUrl,
        location: loc,
        biddingDeadline: bd,
        calendarEventId: eventId,
      });
      return res.status(201).json(project);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// Public: list projects with optional filters (latest first)
// Query params supported:
// - category: architecture|engineering
// - subcategory: csv list (e.g., interior,exterior)
// - tier: csv list (regular,luxuries,normal)
// - projectType: csv list (e.g., complete,partial,one storied,duplex/triplex,multi storied)
router.get('/feed', async (req, res) => {
  try {
    const { category, subcategory, tier, projectType } = req.query;
    const limit = Math.min(parseInt(req.query.limit||'20',10)||20, 50)
    const skip = Math.max(parseInt(req.query.skip||'0',10)||0, 0)
    const q = {};
    if (category && ['architecture', 'engineering'].includes(String(category).toLowerCase())) {
      q.category = String(category).toLowerCase();
    }
    if (subcategory) {
      const arr = String(subcategory).split(',').map(s=>s.trim()).filter(Boolean);
      if (arr.length) q.subcategory = { $in: arr };
    }
    if (tier) {
      const arr = String(tier).split(',').map(s=>s.trim()).filter(Boolean);
      if (arr.length) q.tier = { $in: arr };
    }
    if (projectType) {
      const arr = String(projectType).split(',').map(s=>s.trim()).filter(Boolean);
      if (arr.length) q.projectType = { $in: arr };
    }
    const projects = await Project.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit);
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
  if (project.biddingDeadline && Date.now() > new Date(project.biddingDeadline).getTime()){
    return res.status(403).json({ message: 'Bidding deadline expired', expired: true })
  }
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
    if (b._id.toString() === bidId){
      found = true;
      b.accepted = true;
      // Do NOT initialize Kanban yet. This first acceptance allows chat only.
      // Final acceptance will occur from chat and move to TODO.
      b.clientAcceptedAt = b.clientAcceptedAt || new Date();
    } else {
      b.accepted = false;
      // Clear kanban fields for non-accepted bids
      b.kanbanStatus = undefined;
      b.clientAcceptedAt = undefined;
      b.providerAcceptedAt = undefined;
      b.expectedDeadline = undefined;
      b.doneAt = undefined;
      b.uploads = [];
    }
    return b
  })
  if (!found) return res.status(404).json({ message: 'Bid not found' })
  await project.save()
  res.json({ ok: true })
})

// Chat: list messages for accepted bid (client author, accepted provider, or admin)
router.get('/:id/chat', requireAuth, ensureAnyRole(['client','provider','admin']), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  // Find accepted bid
  const accepted = (project.bids || []).find(b => b.accepted)
  if (!accepted) return res.status(403).json({ message: 'No accepted bid' })
  const isClient = req.user.role==='client' && project.authorUsername===req.user.username
  const isProvider = req.user.role==='provider' && accepted.username===req.user.username
  const isAdmin = req.user.role==='admin'
  if (!isClient && !isProvider && !isAdmin) return res.status(403).json({ message: 'Forbidden' })
  const limit = Math.min(parseInt(req.query.limit||'100',10)||100, 200)
  const skip = Math.max(parseInt(req.query.skip||'0',10)||0, 0)
  const msgs = await ProjectMessage.find({ projectId: project._id, bidId: accepted._id }).sort({ createdAt: 1 }).skip(skip).limit(limit)
  res.json(msgs)
})

// Chat: send message in accepted bid context
router.post('/:id/chat', requireAuth, ensureAnyRole(['client','provider']), async (req,res)=>{
  const { id } = req.params
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ message: 'Message text required' })
  if (text.length > 1000) return res.status(413).json({ message: 'Message too long' })
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const acceptedIndex = (project.bids || []).findIndex(b => b.accepted)
  const accepted = acceptedIndex >= 0 ? project.bids[acceptedIndex] : null
  if (!accepted) return res.status(403).json({ message: 'No accepted bid' })
  const isClient = req.user.role==='client' && project.authorUsername===req.user.username
  const isProvider = req.user.role==='provider' && accepted.username===req.user.username
  if (!isClient && !isProvider) return res.status(403).json({ message: 'Forbidden' })
  // Enforce suspension
  if (accepted.chatSuspended){
    return res.status(403).json({ message: 'Messaging suspended', suspended: true, reason: accepted.chatSuspendedReason || 'Policy violation', helpRequested: !!accepted.chatHelpRequested })
  }
  // Auto-suspend on policy violation
  if (containsBannedContact(text)){
    accepted.chatSuspended = true
    accepted.chatSuspendedAt = new Date()
    accepted.chatSuspendedBy = 'system'
    accepted.chatSuspendedReason = 'Sharing contact info or social media is not allowed'
    project.bids[acceptedIndex] = accepted
    project.markModified && project.markModified('bids')
    await project.save()
    return res.status(403).json({ message: 'Messaging suspended due to policy violation', suspended: true, reason: accepted.chatSuspendedReason })
  }
  const saved = await ProjectMessage.create({ projectId: project._id, bidId: accepted._id, senderUsername: req.user.username, text: text.trim() })
  res.status(201).json(saved)
})

// Chat: status (suspended info)
router.get('/:id/chat/status', requireAuth, ensureAnyRole(['client','provider']), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const accepted = (project.bids || []).find(b => b.accepted)
  if (!accepted) return res.status(403).json({ message: 'No accepted bid' })
  const isClient = req.user.role==='client' && project.authorUsername===req.user.username
  const isProvider = req.user.role==='provider' && accepted.username===req.user.username
  if (!isClient && !isProvider) return res.status(403).json({ message: 'Forbidden' })
  res.json({
    suspended: !!accepted.chatSuspended,
    reason: accepted.chatSuspendedReason || null,
    helpRequested: !!accepted.chatHelpRequested,
    kanbanStatus: accepted.kanbanStatus || null
  })
})

// Chat: client final acceptance to move to provider TODO
router.post('/:id/chat/accept-provider', requireAuth, ensureRole('client'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  if (project.authorUsername !== req.user.username) return res.status(403).json({ message: 'Forbidden' })
  const idx = (project.bids || []).findIndex(b => b.accepted)
  if (idx < 0) return res.status(400).json({ message: 'No accepted bid' })
  const b = project.bids[idx]
  if (b.kanbanStatus) return res.status(200).json({ ok: true, alreadyFinalized: true })
  // Finalize to TODO
  b.kanbanStatus = 'TODO'
  b.providerAcceptedAt = undefined
  b.expectedDeadline = undefined
  b.doneAt = undefined
  b.uploads = []
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  // System message
  await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: 'Client accepted provider. Project moved to TODO.' })
  res.json({ ok: true })
})

// Chat: help request when suspended
router.post('/:id/chat/help', requireAuth, ensureAnyRole(['client','provider']), async (req,res)=>{
  const { id } = req.params
  const { reason } = req.body || {}
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const acceptedIndex = (project.bids || []).findIndex(b => b.accepted)
  const accepted = acceptedIndex >= 0 ? project.bids[acceptedIndex] : null
  if (!accepted) return res.status(403).json({ message: 'No accepted bid' })
  const isClient = req.user.role==='client' && project.authorUsername===req.user.username
  const isProvider = req.user.role==='provider' && accepted.username===req.user.username
  if (!isClient && !isProvider) return res.status(403).json({ message: 'Forbidden' })
  accepted.chatHelpRequested = true
  accepted.chatHelpReason = (reason && String(reason).slice(0, 500)) || 'Help requested'
  project.bids[acceptedIndex] = accepted
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true })
})

// Chat: get last message timestamp per authorized project for current user (optional filter by ids CSV)
router.get('/chat/last', requireAuth, ensureAnyRole(['client','provider']), async (req,res)=>{
  const username = req.user.username
  const idsCsv = req.query.ids
  // Find authorized projects for this user
  let projects
  if (req.user.role === 'client'){
    projects = await Project.find({ authorUsername: username, 'bids.accepted': true }).lean()
  } else {
    projects = await Project.find({ 'bids.username': username, 'bids.accepted': true }).lean()
  }
  let allowed = projects
  if (idsCsv){
    const allow = new Set(String(idsCsv).split(',').map(s=>s.trim()).filter(Boolean))
    allowed = projects.filter(p => allow.has(String(p._id)))
  }
  if (allowed.length===0) return res.json({})
  const lookups = allowed.map(p => ({ projectId: p._id, bidId: (p.bids||[]).find(b=>b.accepted)?. _id })).filter(x=>x.bidId)
  if (lookups.length===0) return res.json({})
  // Aggregate last message per project
  const pipeline = [
    { $match: { $or: lookups.map(l => ({ projectId: l.projectId, bidId: l.bidId })) } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$projectId', last: { $last: '$createdAt' } } },
  ]
  const rows = await ProjectMessage.aggregate(pipeline)
  const out = {}
  rows.forEach(r => { out[String(r._id)] = r.last })
  res.json(out)
})

// Admin: list active chat suspensions and help requests
router.get('/admin/suspensions', requireAuth, ensureRole('admin'), async (_req,res)=>{
  const projects = await Project.find({ 'bids.chatSuspended': true }).sort({ updatedAt: -1 }).lean()
  const out = []
  for (const p of projects){
    const accepted = (p.bids || []).find(b => b.accepted)
    if (!accepted || !accepted.chatSuspended) continue
    out.push({
      projectId: String(p._id),
      clientUsername: p.authorUsername,
      providerUsername: accepted.username,
      reason: accepted.chatSuspendedReason || 'Policy violation',
      suspendedAt: accepted.chatSuspendedAt || p.updatedAt,
      helpRequested: !!accepted.chatHelpRequested,
      helpReason: accepted.chatHelpReason || null,
    })
  }
  res.json(out)
})

// Admin: remove suspension and post a system notification
router.post('/admin/suspensions/:projectId/remove', requireAuth, ensureRole('admin'), async (req,res)=>{
  const { projectId } = req.params
  const project = await Project.findById(projectId)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted)
  if (idx < 0) return res.status(400).json({ message: 'No accepted bid' })
  const b = project.bids[idx]
  b.chatSuspended = false
  b.chatSuspendedAt = undefined
  b.chatSuspendedBy = 'admin'
  b.chatSuspendedReason = undefined
  b.chatHelpRequested = false
  b.chatHelpReason = undefined
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  // System message to notify both parties
  await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: 'Admin removed your suspension' })
  res.json({ ok: true })
})

// Admin utility: reset kanban state for currently accepted bid (for data created before two-step flow)
router.post('/admin/reset-kanban/:projectId', requireAuth, ensureRole('admin'), async (req,res)=>{
  const { projectId } = req.params
  const project = await Project.findById(projectId)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted)
  if (idx < 0) return res.status(400).json({ message: 'No accepted bid' })
  const b = project.bids[idx]
  b.kanbanStatus = undefined
  b.providerAcceptedAt = undefined
  b.expectedDeadline = undefined
  b.doneAt = undefined
  b.uploads = []
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true })
})

// Provider: return only projectIds where this provider's bid is accepted
router.get('/my/accepted-ids', requireAuth, ensureRole('provider'), async (req,res)=>{
  const username = req.user.username
  const projects = await Project.find({ 'bids.username': username, 'bids.accepted': true }).select('_id').lean()
  res.json(projects.map(p=>String(p._id)))
})

// Client: return projectIds authored by client that have an accepted bid
router.get('/my/with-accepted-ids', requireAuth, ensureRole('client'), async (req,res)=>{
  const username = req.user.username
  const projects = await Project.find({ authorUsername: username, 'bids.accepted': true }).select('_id').lean()
  res.json(projects.map(p=>String(p._id)))
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
    location: p.location || null,
    bid: (p.bids || []).find(b => b.username === username && b.accepted) || null,
  }))
  res.json(items)
})

// Provider: accept the project (move from TODO to IN_PROCESS)
router.post('/:id/kanban/accept', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted && b.username === req.user.username)
  if (idx < 0) return res.status(403).json({ message: 'Forbidden' })
  const b = project.bids[idx]
  b.kanbanStatus = 'IN_PROCESS'
  b.providerAcceptedAt = new Date()
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true })
})

// Provider: set expected deadline while IN_PROCESS
router.post('/:id/kanban/expected-deadline', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const { expectedDeadline } = req.body || {}
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted && b.username === req.user.username)
  if (idx < 0) return res.status(403).json({ message: 'Forbidden' })
  const d = expectedDeadline ? new Date(expectedDeadline) : null
  if (!d || isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid expectedDeadline' })
  project.bids[idx].expectedDeadline = d
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true })
})

// Provider: mark project as DONE
router.post('/:id/kanban/done', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted && b.username === req.user.username)
  if (idx < 0) return res.status(403).json({ message: 'Forbidden' })
  project.bids[idx].kanbanStatus = 'DONE'
  project.bids[idx].doneAt = new Date()
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true })
})

// Provider: upload multiple images for DONE project
router.post('/:id/kanban/done/uploads', requireAuth, ensureRole('provider'), upload.array('images', 10), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => b.accepted && b.username === req.user.username)
  if (idx < 0) return res.status(403).json({ message: 'Forbidden' })
  const files = (req.files || []).map(f => `/uploads/${f.filename}`)
  project.bids[idx].uploads = [ ...(project.bids[idx].uploads || []), ...files ]
  project.markModified && project.markModified('bids')
  await project.save()
  res.json({ ok: true, files })
})

// Provider dashboard: grouped by Kanban
router.get('/kanban/provider', requireAuth, ensureRole('provider'), async (req,res)=>{
  const username = req.user.username
  const projects = await Project.find({ 'bids.username': username, 'bids.accepted': true }).lean()
  const todo = []
  const inProcess = []
  const done = []
  for (const p of projects){
    const b = (p.bids || []).find(x => x.username === username && x.accepted)
    if (!b) continue
    // Only show on board after finalization (kanbanStatus is set)
    if (!b.kanbanStatus) continue
    const base = { projectId: String(p._id), name: p.projectType || p.subcategory || p.category, clientUsername: p.authorUsername, bidId: String(b._id), clientAcceptedAt: b.clientAcceptedAt, providerAcceptedAt: b.providerAcceptedAt, expectedDeadline: b.expectedDeadline, doneAt: b.doneAt, uploads: b.uploads || [], location: p.location || null }
    if (b.kanbanStatus === 'DONE') done.push(base)
    else if (b.kanbanStatus === 'IN_PROCESS') inProcess.push(base)
    else if (b.kanbanStatus === 'TODO') todo.push(base)
  }
  res.json({ todo, inProcess, done })
})

// Client dashboard: grouped by Kanban for accepted project
router.get('/kanban/client', requireAuth, ensureRole('client'), async (req,res)=>{
  const username = req.user.username
  const projects = await Project.find({ authorUsername: username, 'bids.accepted': true }).lean()
  const todo = []
  const inProcess = []
  const done = []
  for (const p of projects){
    const b = (p.bids || []).find(x => x.accepted)
    if (!b) continue
    // Only show on board after finalization (kanbanStatus is set)
    if (!b.kanbanStatus) continue
    const base = { projectId: String(p._id), name: p.projectType || p.subcategory || p.category, providerUsername: b.username, bidId: String(b._id), clientAcceptedAt: b.clientAcceptedAt, providerAcceptedAt: b.providerAcceptedAt, expectedDeadline: b.expectedDeadline, doneAt: b.doneAt, uploads: b.uploads || [], location: p.location || null }
    if (b.kanbanStatus === 'DONE') done.push(base)
    else if (b.kanbanStatus === 'IN_PROCESS') inProcess.push(base)
    else if (b.kanbanStatus === 'TODO') todo.push(base)
  }
  res.json({ todo, inProcess, done })
})

export default router;
