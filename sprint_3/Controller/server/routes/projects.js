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
import { User } from '../../../Model/User.js';
import { Report } from '../../../Model/Report.js';
import { PaymentSubmission } from '../../../Model/PaymentSubmission.js';
import { Notification } from '../../../Model/Notification.js';
import { eccEncrypt, eccDecrypt, getECCKeyPair, saveECCKeys, loadECCKeys } from '../utils/ecc.js';
import { generateMAC, verifyMAC } from '../utils/cbc-mac.js';

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

// Bid-specific upload configuration
const bidUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // Allow documents and images
    const allowedDocTypes = /pdf|doc|docx|txt/;
    const allowedImgTypes = /jpeg|jpg|png|webp/;
    const extname = path.extname(file.originalname).toLowerCase();
    
    if (allowedDocTypes.test(extname.replace('.', '')) || allowedImgTypes.test(extname.replace('.', ''))) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, DOCX, TXT, JPEG, PNG, and WebP files are allowed'));
  },
});

const upload = multer({ storage });

// Helper function to decrypt project description (same as post decryption)
function decryptProjectFields(project, username) {
  try {
    if (!project.description) return project;
    
    const eccKeys = loadECCKeys(username);
    if (!eccKeys) {
      console.log('[decryptProjectFields] No ECC keys found for user:', username, '- returning encrypted data');
      return project;
    }
    
    const projectData = project.toObject();
    try {
      const decrypted = eccDecrypt(projectData.description, eccKeys.privateKey, eccKeys.publicKeyX, eccKeys.publicKeyY);
      projectData.description = decrypted;
      console.log('[decryptProjectFields] Successfully decrypted description for user:', username);
    } catch (e) {
      console.log('[decryptProjectFields] Description decryption failed:', e.message);
      // Return as-is if not encrypted
    }
    
    return projectData;
  } catch (e) {
    console.error('[decryptProjectFields] Error decrypting project:', e);
    return project;
  }
}

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

// TOP-LEVEL: Collaboration routes (ensure they are registered regardless of other route definitions)
// Provider collaboration: invite other providers to a project
router.post('/:id/collab/invite', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const { id } = req.params
    const { usernames } = req.body || {}
    if (!Array.isArray(usernames) || usernames.length===0) return res.status(400).json({ message: 'usernames array required' })
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    // authorization: accepted bid provider or existing collab member (invited/accepted)
    const accepted = (project.bids||[]).find(b=>b.accepted)
    const amAcceptedProvider = !!(accepted && accepted.username===req.user.username)
    const amCollabMember = (project.collabMembers||[]).some(m=>m.username===req.user.username && (m.status==='accepted' || m.status==='invited'))
    if (!amAcceptedProvider && !amCollabMember) return res.status(403).json({ message: 'Forbidden' })
    // filter only valid providers
    const providers = await User.find({ role: 'provider', username: { $in: usernames } }).select('username')
    const set = new Set((providers||[]).map(p=>p.username))
    const toInvite = usernames.filter(u=>set.has(u))
    project.collabInvites = project.collabInvites || []
    project.collabMembers = project.collabMembers || []
    for (const u of toInvite){
      if (!project.collabInvites.find(x=>x.toUsername===u && x.status==='pending')){
        project.collabInvites.push({ toUsername: u, status: 'pending' })
      }
      if (!project.collabMembers.find(x=>x.username===u)){
        project.collabMembers.push({ username: u, status: 'invited', kanbanStatus: 'TODO' })
      }
    }
    project.markModified && project.markModified('collabInvites')
    project.markModified && project.markModified('collabMembers')
    await project.save()
    res.json({ ok: true })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// TOP-LEVEL: Provider feed of projects posted by clients who favorited this provider
router.get('/provider/favorites/feed', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const me = req.user.username
    const clients = await User.find({ role: 'client', favoriteProviders: me }).select('username').lean()
    const names = clients.map(c=>c.username)
    if (names.length===0) return res.json([])
    const limit = Math.min(parseInt(req.query.limit||'20',10)||20, 50)
    const skip = Math.max(parseInt(req.query.skip||'0',10)||0, 0)
    const projects = await Project.find({ authorUsername: { $in: names } }).sort({ createdAt: -1 }).skip(skip).limit(limit)
    const decryptedProjects = projects.map(project => decryptProjectFields(project, project.authorUsername));
    res.json(decryptedProjects)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider: list my pending collaboration requests (TODO requests)
router.get('/collab/requests', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const items = await Project.find({
      collabInvites: { $elemMatch: { toUsername: req.user.username, status: 'pending' } }
    }).sort({ updatedAt: -1 })
    const decryptedItems = items.map(project => decryptProjectFields(project, project.authorUsername));
    res.json(decryptedItems)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider: accept collaboration request (top-level)
router.post('/:id/collab/accept', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const { id } = req.params
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    const inv = (project.collabInvites||[]).find(x=>x.toUsername===req.user.username && x.status==='pending')
    if (!inv) return res.status(403).json({ message: 'No pending invite' })
    inv.status = 'accepted'
    project.collabInvites = (project.collabInvites||[]).map(x=> x.toUsername===req.user.username ? inv : x)
    // ensure member accepted
    project.collabMembers = (project.collabMembers||[]).map(m=> m.username===req.user.username ? { ...m.toObject?.() || m, status: 'accepted', kanbanStatus: m.kanbanStatus || 'TODO' } : m)
    if (!project.collabMembers.find(m=>m.username===req.user.username)){
      project.collabMembers.push({ username: req.user.username, status: 'accepted', kanbanStatus: 'TODO' })
    }
    // Do NOT move kanban to IN_PROCESS automatically; remain in TODO until explicitly progressed
    project.markModified && project.markModified('bids')
    project.markModified && project.markModified('collabMembers')
    project.markModified && project.markModified('collabInvites')
    await project.save()
    res.json({ ok: true })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider: list my collaboration TODO projects (top-level)
router.get('/collab/todo', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const items = await Project.find({
      collabMembers: { $elemMatch: { username: req.user.username, status: 'accepted', kanbanStatus: 'TODO' } }
    }).sort({ updatedAt: -1 })
    const decryptedItems = items.map(project => decryptProjectFields(project, project.authorUsername));
    res.json(decryptedItems)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

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

// Helper: ban both parties after repeated violations in a conversation
async function banBothUsers(project){
  try{
    const accepted = (project.bids || []).find(b => b.accepted)
    if (!accepted) return
    const usernames = [project.authorUsername, accepted.username]
    await User.updateMany(
      { username: { $in: usernames } },
      { $set: { banned: true, bannedAt: new Date(), bannedReason: 'Repeated policy violations in chat' } }
    )
  } catch (e){
    console.error('banBothUsers failed', e?.message || e)
  }
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

// Provider: feed of projects posted by clients who favorited this provider
router.get('/provider/favorites/feed', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const me = req.user.username
    // Find clients who have this provider in their favorites
    const clients = await User.find({ role: 'client', favoriteProviders: me }).select('username').lean()
    const names = clients.map(c=>c.username)
    if (names.length===0) return res.json([])
    const limit = Math.min(parseInt(req.query.limit||'20',10)||20, 50)
    const skip = Math.max(parseInt(req.query.skip||'0',10)||0, 0)
    const projects = await Project.find({ authorUsername: { $in: names } }).sort({ createdAt: -1 }).skip(skip).limit(limit)
    res.json(projects)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider collaboration: invite other providers to a TODO project
router.post('/:id/collab/invite', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const { id } = req.params
    const { usernames } = req.body || {}
    if (!Array.isArray(usernames) || usernames.length===0) return res.status(400).json({ message: 'usernames array required' })
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    // authorization: current provider must be accepted provider on the project,
    // or an existing collab member (accepted or invited). We do not restrict to TODO only,
    // to allow sending invites while coordinating stages.
    const accepted = (project.bids||[]).find(b=>b.accepted)
    const amAcceptedProvider = !!(accepted && accepted.username===req.user.username)
    const amCollabMember = (project.collabMembers||[]).some(m=>m.username===req.user.username && (m.status==='accepted' || m.status==='invited'))
    if (!amAcceptedProvider && !amCollabMember) return res.status(403).json({ message: 'Forbidden' })
    // filter only valid providers
    const providers = await User.find({ role: 'provider', username: { $in: usernames } }).select('username')
    const set = new Set((providers||[]).map(p=>p.username))
    const toInvite = usernames.filter(u=>set.has(u))
    // add invites and collabMembers entries if not exist
    project.collabInvites = project.collabInvites || []
    project.collabMembers = project.collabMembers || []
    for (const u of toInvite){
      if (!project.collabInvites.find(x=>x.toUsername===u && x.status==='pending')){
        project.collabInvites.push({ toUsername: u, status: 'pending' })
      }
      if (!project.collabMembers.find(x=>x.username===u)){
        project.collabMembers.push({ username: u, status: 'invited', kanbanStatus: 'TODO' })
      }
    }
    project.markModified && project.markModified('collabInvites')
    project.markModified && project.markModified('collabMembers')
    await project.save()
    res.json({ ok: true })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider: list my pending collaboration requests (TODO requests)
router.get('/collab/requests', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const items = await Project.find({ 'collabInvites.toUsername': req.user.username, 'collabInvites.status': 'pending' }).sort({ updatedAt: -1 })
    res.json(items)
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Provider: accept collaboration request; moves project to IN_PROCESS for all providers
router.post('/:id/collab/accept', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const { id } = req.params
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    // must have pending invite for me
    const inv = (project.collabInvites||[]).find(x=>x.toUsername===req.user.username && x.status==='pending')
    if (!inv) return res.status(403).json({ message: 'No pending invite' })
    inv.status = 'accepted'
    project.collabInvites = (project.collabInvites||[]).map(x=> x.toUsername===req.user.username ? inv : x)
    // ensure member
    project.collabMembers = (project.collabMembers||[]).map(m=> m.username===req.user.username ? { ...m.toObject?.() || m, status: 'accepted' } : m)
    if (!project.collabMembers.find(m=>m.username===req.user.username)){
      project.collabMembers.push({ username: req.user.username, status: 'accepted', kanbanStatus: 'TODO' })
    }
    // move project to IN_PROCESS for all providers: accepted bid provider and all collabMembers
    const idx = (project.bids||[]).findIndex(b=>b.accepted)
    if (idx>=0){ project.bids[idx].kanbanStatus = 'IN_PROCESS' }
    project.collabMembers = (project.collabMembers||[]).map(m=> ({ ...((m.toObject && m.toObject()) || m), kanbanStatus: 'IN_PROCESS' }))
    project.markModified && project.markModified('bids')
    project.markModified && project.markModified('collabMembers')
    project.markModified && project.markModified('collabInvites')
    await project.save()
    res.json({ ok: true })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Provider: list my collaboration TODO projects
router.get('/collab/todo', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const items = await Project.find({ 'collabMembers.username': req.user.username, 'collabMembers.status': 'accepted', 'collabMembers.kanbanStatus': 'TODO' }).sort({ updatedAt: -1 })
    res.json(items)
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Provider: cancel a pending collaboration invite for a username on a project
router.post('/:id/collab/invites/:username/cancel', requireAuth, ensureRole('provider'), async (req,res)=>{
  try{
    const { id, username } = req.params
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    // authorization similar to invite
    const accepted = (project.bids||[]).find(b=>b.accepted)
    const amAcceptedProvider = accepted && accepted.username===req.user.username && accepted.kanbanStatus==='TODO'
    const amCollabTodo = (project.collabMembers||[]).some(m=>m.username===req.user.username && m.status==='accepted' && m.kanbanStatus==='TODO')
    if (!amAcceptedProvider && !amCollabTodo) return res.status(403).json({ message: 'Forbidden' })
    // find pending invite
    const inv = (project.collabInvites||[]).find(x=>x.toUsername===username && x.status==='pending')
    if (!inv) return res.status(404).json({ message: 'No pending invite for this user' })
    // mark rejected and optionally remove invited member record
    project.collabInvites = (project.collabInvites||[]).map(x=> x.toUsername===username && x.status==='pending' ? { ...((x.toObject&&x.toObject())||x), status: 'rejected' } : x)
    // if a collabMembers entry exists with invited status, remove it
    project.collabMembers = (project.collabMembers||[]).filter(m => !(m.username===username && m.status==='invited'))
    project.markModified && project.markModified('collabInvites')
    project.markModified && project.markModified('collabMembers')
    await project.save()
    res.json({ ok: true })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
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
      // Get or generate ECC keys for the user
      let eccKeys = loadECCKeys(req.user.username);
      if (!eccKeys) {
        eccKeys = getECCKeyPair(req.user.username);
        saveECCKeys(req.user.username, eccKeys);
      }
      
      // Encrypt only description using ECC (like posts)
      const encryptedDescription = description ? eccEncrypt(description, eccKeys.publicKeyX, eccKeys.publicKeyY) : null;
      
      const project = await Project.create({
        authorId: req.user.id !== 'admin' ? req.user.id : undefined,
        authorUsername: req.user.username, // Not encrypted
        category: category, // Not encrypted - has enum validation
        subcategory: subcategory || undefined, // Not encrypted
        tier: tier, // Not encrypted - has enum validation
        projectType: projectType || undefined,
        description: encryptedDescription || (description || ''),
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

// Public feed of projects (no auth required)
router.get('/feed', async (req,res)=>{
  try{
    const { category, subcategory, tier, projectType } = req.query
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
    // Decrypt using project author's username (same as post feed behavior)
    const decryptedProjects = projects.map(project => decryptProjectFields(project, project.authorUsername));
    res.json(decryptedProjects);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Provider: add a bid to a project
router.post('/:id/bids', requireAuth, ensureRole('provider'), bidUpload.fields([
  { name: 'documents', maxCount: 5 },
  { name: 'images', maxCount: 10 }
]), async (req,res)=>{
  const { id } = req.params
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ message: 'Bid text required' })
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  if (project.biddingDeadline && Date.now() > new Date(project.biddingDeadline).getTime()){
    return res.status(403).json({ message: 'Bidding deadline expired', expired: true })
  }
  
  // Process uploaded files
  const documentUrls = (req.files?.documents || []).map(f => `/uploads/${f.filename}`)
  const imageUrls = (req.files?.images || []).map(f => `/uploads/${f.filename}`)
  
  const bidData = {
    userId: req.user.id !== 'admin' ? req.user.id : undefined,
    username: req.user.username,
    text: text.trim(),
    documents: documentUrls,
    images: imageUrls
  }
  
  project.bids.push(bidData)
  await project.save()
  // Notify client that a provider bid on the project
  try{
    await Notification.create({
      toUsername: project.authorUsername,
      type: 'bid',
      projectId: project._id,
      fromUsername: req.user.username,
      message: `Your "${project.projectType || project.subcategory || project.category}" project bidded by "${req.user.username}" provider.`,
    })
  }catch(e){ console.error('notify bid failed', e?.message || e) }
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
  // Notify provider that their bid was accepted
  try{
    const accepted = (project.bids||[]).find(b=>b.accepted)
    if (accepted){
      await Notification.create({
        toUsername: accepted.username,
        type: 'bid_accepted',
        projectId: project._id,
        fromUsername: req.user.username,
        message: `Your "${project.projectType || project.subcategory || project.category}" project BID is accepted by client, you can now chat.`,
      })
    }
  }catch(e){ console.error('notify bid_accepted failed', e?.message || e) }
  res.json({ ok: true })
})

// Chat: submit a report (client or provider) with optional evidence image
router.post(
  '/:id/chat/report',
  requireAuth,
  ensureAnyRole(['client','provider']),
  upload.single('evidence'),
  async (req,res)=>{
    const { id } = req.params
    const { reason } = req.body || {}
    if (!reason || !String(reason).trim()) return res.status(400).json({ message: 'Reason is required' })
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    const accepted = (project.bids || []).find(b => b.accepted)
    if (!accepted) return res.status(400).json({ message: 'No accepted bid' })
    const isClient = req.user.role==='client' && project.authorUsername===req.user.username
    const isProvider = req.user.role==='provider' && accepted.username===req.user.username
    if (!isClient && !isProvider) return res.status(403).json({ message: 'Forbidden' })
    const evidenceUrl = req.file ? `/uploads/${req.file.filename}` : undefined
    const reporterUsername = req.user.username
    const reportedUsername = isClient ? accepted.username : project.authorUsername
    const r = await Report.create({ projectId: project._id, bidId: accepted._id, reporterUsername, reportedUsername, reason: String(reason).slice(0,1000), evidenceUrl })
    res.status(201).json(r)
  }
)

// Admin: list open reports
router.get('/admin/reports', requireAuth, ensureRole('admin'), async (_req,res)=>{
  const items = await Report.find({ status: 'open' }).sort({ createdAt: -1 })
  res.json(items)
})

// Admin: warn on a report and notify conversation
router.post('/admin/reports/:reportId/warn', requireAuth, ensureRole('admin'), async (req,res)=>{
  const { reportId } = req.params
  const rep = await Report.findById(reportId)
  if (!rep) return res.status(404).json({ message: 'Report not found' })
  rep.status = 'warned'
  await rep.save()
  const project = await Project.findById(rep.projectId)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const target = rep.reportedUsername === project.authorUsername ? 'client' : 'service provider'
  const messageText = `Admin warns ${target} to maintain the web policy`
  const mac = generateMAC(messageText)
  await ProjectMessage.create({ projectId: project._id, bidId: rep.bidId, senderUsername: 'system', text: messageText, mac: mac })
  res.json({ ok: true })
})

// Chat: list messages for accepted bid (client author, accepted provider, or admin)
router.get('/:id/chat', requireAuth, ensureAnyRole(['client','provider','admin']), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  // Decrypt project fields using author's keys (like posts)
  const decryptedProject = decryptProjectFields(project, project.authorUsername);
  // Find accepted bid
  const accepted = (decryptedProject.bids || []).find(b => b.accepted)
  if (!accepted) return res.status(403).json({ message: 'No accepted bid' })
  const isClient = req.user.role==='client' && decryptedProject.authorUsername===req.user.username
  const isProvider = req.user.role==='provider' && accepted.username===req.user.username
  const isAdmin = req.user.role==='admin'
  if (!isClient && !isProvider && !isAdmin) return res.status(403).json({ message: 'Forbidden' })
  const limit = Math.min(parseInt(req.query.limit||'100',10)||100, 200)
  const skip = Math.max(parseInt(req.query.skip||'0',10)||0, 0)
  const msgs = await ProjectMessage.find({ projectId: decryptedProject._id, bidId: accepted._id }).sort({ createdAt: 1 }).skip(skip).limit(limit)
  
  // Verify MAC for each message to ensure integrity
  const verifiedMsgs = msgs.map(msg => {
    const isValid = verifyMAC(msg.text, msg.mac);
    return {
      ...msg.toObject(),
      macVerified: isValid,
      integrityWarning: !isValid ? 'Message integrity check failed' : null
    };
  });
  
  res.json(verifiedMsgs)
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
    accepted.chatViolationCount = (accepted.chatViolationCount || 0) + 1
    project.bids[acceptedIndex] = accepted
    project.markModified && project.markModified('bids')
    await project.save()
    if ((accepted.chatViolationCount || 0) >= 3){
      await banBothUsers(project)
    }
    return res.status(403).json({ message: 'Messaging suspended due to policy violation', suspended: true, reason: accepted.chatSuspendedReason })
  }
  
  // Generate CBC-MAC for message integrity
  const messageText = text.trim();
  const mac = generateMAC(messageText);
  
  const saved = await ProjectMessage.create({ 
    projectId: project._id, 
    bidId: accepted._id, 
    senderUsername: req.user.username, 
    text: messageText,
    mac: mac
  })
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
    kanbanStatus: accepted.kanbanStatus || null,
    pendingPayment: !!accepted.pendingPayment,
    pendingPaymentSubmitted: !!accepted.pendingPaymentSubmitted
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
  // Gate by admin payment approval
  b.pendingPayment = true
  b.pendingPaymentSubmitted = false
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  // System message
  const messageText = 'Client accepted provider. Please submit payment proof for admin approval.'
  const mac = generateMAC(messageText)
  await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: messageText, mac: mac })
  res.json({ ok: true, pendingPayment: true })
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
  // First, list all chats currently suspended
  const projects = await Project.find({ 'bids.chatSuspended': true }).sort({ updatedAt: -1 }).lean()
  const out = []
  const seen = new Set()
  for (const p of projects){
    const accepted = (p.bids || []).find(b => b.accepted)
    if (!accepted || !accepted.chatSuspended) continue
    const rep = await Report.findOne({ projectId: p._id, bidId: accepted._id, status: 'open' }).sort({ createdAt: -1 }).lean()
    const pid = String(p._id)
    seen.add(pid)
    out.push({
      projectId: pid,
      clientUsername: p.authorUsername,
      providerUsername: accepted.username,
      reason: accepted.chatSuspendedReason || 'Policy violation',
      suspendedAt: accepted.chatSuspendedAt || p.updatedAt,
      helpRequested: !!accepted.chatHelpRequested,
      helpReason: accepted.chatHelpReason || null,
      reportReason: rep?.reason || null,
      reportEvidenceUrl: rep?.evidenceUrl || null,
    })
  }
  // Also include any open reports even if chat isn't currently suspended
  const reports = await Report.find({ status: 'open' }).sort({ createdAt: -1 }).lean()
  for (const rep of reports){
    const pid = String(rep.projectId)
    if (seen.has(pid)) continue
    const p = await Project.findById(rep.projectId).lean()
    if (!p) continue
    const accepted = (p.bids || []).find(b => String(b._id) === String(rep.bidId)) || (p.bids||[]).find(b=>b.accepted)
    if (!accepted) continue
    out.push({
      projectId: pid,
      clientUsername: p.authorUsername,
      providerUsername: accepted.username,
      reason: accepted.chatSuspendedReason || 'Reported',
      suspendedAt: p.updatedAt,
      helpRequested: !!accepted.chatHelpRequested,
      helpReason: accepted.chatHelpReason || null,
      reportReason: rep.reason || null,
      reportEvidenceUrl: rep.evidenceUrl || null,
    })
  }
  res.json(out)
})

// Client: submit payment proof image
router.post(
  '/:id/chat/payment',
  requireAuth,
  ensureRole('client'),
  upload.single('image'),
  async (req,res)=>{
    const { id } = req.params
    const project = await Project.findById(id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.authorUsername !== req.user.username) return res.status(403).json({ message: 'Forbidden' })
    const idx = (project.bids || []).findIndex(b => b.accepted)
    if (idx < 0) return res.status(400).json({ message: 'No accepted bid' })
    const b = project.bids[idx]
    if (!b.pendingPayment) return res.status(400).json({ message: 'Payment not required' })
    if (!req.file) return res.status(400).json({ message: 'Image is required' })
    const imageUrl = `/uploads/${req.file.filename}`
    const rec = await PaymentSubmission.create({ projectId: project._id, bidId: b._id, clientUsername: req.user.username, imageUrl })
    b.pendingPaymentSubmitted = true
    project.bids[idx] = b
    project.markModified && project.markModified('bids')
    await project.save()
    const messageText = 'Client submitted payment proof for admin review.'
    const mac = generateMAC(messageText)
    await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: messageText, mac: mac })
    res.status(201).json(rec)
  }
)

// Admin: list pending payment submissions
router.get('/admin/payments', requireAuth, ensureRole('admin'), async (_req,res)=>{
  const items = await PaymentSubmission.find({ status: 'pending' }).sort({ createdAt: -1 })
  res.json(items)
})

// Admin: accept a payment submission and move to TODO
router.post('/admin/payments/:paymentId/accept', requireAuth, ensureRole('admin'), async (req,res)=>{
  const { paymentId } = req.params
  const pay = await PaymentSubmission.findById(paymentId)
  if (!pay) return res.status(404).json({ message: 'Submission not found' })
  const project = await Project.findById(pay.projectId)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  const idx = (project.bids || []).findIndex(b => String(b._id) === String(pay.bidId))
  if (idx < 0) return res.status(400).json({ message: 'Bid not found' })
  const b = project.bids[idx]
  b.kanbanStatus = 'TODO'
  b.pendingPayment = false
  b.pendingPaymentSubmitted = false
  b.providerAcceptedAt = undefined
  b.expectedDeadline = undefined
  b.doneAt = undefined
  b.uploads = []
  project.bids[idx] = b
  project.markModified && project.markModified('bids')
  await project.save()
  pay.status = 'accepted'
  await pay.save()
  const messageText = 'Admin accepted payment proof. Project moved to TODO.'
  const mac = generateMAC(messageText)
  await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: messageText, mac: mac })
  res.json({ ok: true })
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
  const messageText = 'Admin removed your suspension'
  const mac = generateMAC(messageText)
  await ProjectMessage.create({ projectId: project._id, bidId: b._id, senderUsername: 'system', text: messageText, mac: mac })
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
  // Decrypt project fields and map to include only the accepted bid for this user
  const items = projects.map(p => {
    const decrypted = decryptProjectFields(p, p.authorUsername);
    return {
      projectId: decrypted._id,
      authorUsername: decrypted.authorUsername,
      category: decrypted.category,
      subcategory: decrypted.subcategory,
      tier: decrypted.tier,
      projectType: decrypted.projectType,
      description: decrypted.description,
      imageUrl: decrypted.imageUrl,
      location: decrypted.location || null,
      bid: (decrypted.bids || []).find(b => b.username === username && b.accepted) || null,
    };
  })
  res.json(items)
})

// Provider: accept the project (move from TODO to IN_PROCESS)
router.post('/:id/kanban/accept', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  // Authorized if requester is accepted bidder or an accepted collab member
  const bidIdx = (project.bids || []).findIndex(b => b.accepted && b.username === req.user.username)
  const isCollab = (project.collabMembers || []).some(m => m.username === req.user.username && m.status === 'accepted')
  if (bidIdx < 0 && !isCollab) return res.status(403).json({ message: 'Forbidden' })

  // Move accepted bid lane to IN_PROCESS if exists
  const accIdx = (project.bids || []).findIndex(b => b.accepted)
  if (accIdx >= 0){
    const b = (project.bids[accIdx].toObject && project.bids[accIdx].toObject()) || project.bids[accIdx]
    project.bids[accIdx] = { ...b, kanbanStatus: 'IN_PROCESS', providerAcceptedAt: b.providerAcceptedAt || new Date() }
    project.markModified && project.markModified('bids')
  }
  // Move all accepted collab members to IN_PROCESS
  project.collabMembers = (project.collabMembers || []).map(m => {
    const obj = (m.toObject && m.toObject()) || m
    if (obj.status === 'accepted') return { ...obj, kanbanStatus: 'IN_PROCESS' }
    return obj
  })
  project.markModified && project.markModified('collabMembers')
  await project.save()
  return res.json({ ok: true })
})

// Provider: set expected deadline while IN_PROCESS
router.post('/:id/kanban/expected-deadline', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const { expectedDeadline } = req.body || {}
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  // Allow accepted bidder or accepted collab member to set expected deadline
  const isBidder = (project.bids || []).some(b => b.accepted && b.username === req.user.username)
  const isCollab = (project.collabMembers || []).some(m => m.username === req.user.username && m.status === 'accepted')
  if (!isBidder && !isCollab) return res.status(403).json({ message: 'Forbidden' })
  const d = expectedDeadline ? new Date(expectedDeadline) : null
  if (!d || isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid expectedDeadline' })
  const accIdx = (project.bids || []).findIndex(b => b.accepted)
  if (accIdx >= 0){
    const b = (project.bids[accIdx].toObject && project.bids[accIdx].toObject()) || project.bids[accIdx]
    project.bids[accIdx] = { ...b, expectedDeadline: d, kanbanStatus: 'IN_PROCESS' }
    project.markModified && project.markModified('bids')
  }
  // Ensure all accepted collab members remain IN_PROCESS
  project.collabMembers = (project.collabMembers || []).map(m => {
    const obj = (m.toObject && m.toObject()) || m
    if (obj.status === 'accepted') return { ...obj, kanbanStatus: 'IN_PROCESS' }
    return obj
  })
  project.markModified && project.markModified('collabMembers')
  await project.save()
  res.json({ ok: true })
})

// Provider: mark project as DONE
router.post('/:id/kanban/done', requireAuth, ensureRole('provider'), async (req,res)=>{
  const { id } = req.params
  const project = await Project.findById(id)
  if (!project) return res.status(404).json({ message: 'Project not found' })
  // Authorized: accepted bidder or accepted collab member
  const isBidder = (project.bids || []).some(b => b.accepted && b.username === req.user.username)
  const isCollab = (project.collabMembers || []).some(m => m.username === req.user.username && m.status === 'accepted')
  if (!isBidder && !isCollab) return res.status(403).json({ message: 'Forbidden' })
  const accIdx = (project.bids || []).findIndex(b => b.accepted)
  if (accIdx >= 0){
    const b = (project.bids[accIdx].toObject && project.bids[accIdx].toObject()) || project.bids[accIdx]
    project.bids[accIdx] = { ...b, kanbanStatus: 'DONE', doneAt: new Date() }
    project.markModified && project.markModified('bids')
  }
  // Move all accepted collab members to DONE
  project.collabMembers = (project.collabMembers || []).map(m => {
    const obj = (m.toObject && m.toObject()) || m
    if (obj.status === 'accepted') return { ...obj, kanbanStatus: 'DONE' }
    return obj
  })
  project.markModified && project.markModified('collabMembers')
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
  // Fetch projects where this user is the accepted bidder OR an accepted collab member
  const projects = await Project.find({
    $or: [
      { 'bids.username': username, 'bids.accepted': true },
      { collabMembers: { $elemMatch: { username, status: 'accepted' } } }
    ]
  }).lean()

  const todo = []
  const inProcess = []
  const done = []
  const seen = new Set()

  for (const p of projects){
    // Decrypt project fields using author's keys (like posts)
    const decrypted = decryptProjectFields(p, p.authorUsername);
    
    // Prefer bid lane if user is the accepted bidder, otherwise use collab membership lane
    let lane = null
    let base = { projectId: String(decrypted._id), name: decrypted.projectType || decrypted.subcategory || decrypted.category, clientUsername: decrypted.authorUsername, location: decrypted.location || null }

    const b = (decrypted.bids || []).find(x => x.username === username && x.accepted)
    if (b && b.kanbanStatus){
      base = { ...base, bidId: String(b._id), clientAcceptedAt: b.clientAcceptedAt, providerAcceptedAt: b.providerAcceptedAt, expectedDeadline: b.expectedDeadline, doneAt: b.doneAt, uploads: b.uploads || [] }
      lane = b.kanbanStatus
    } else {
      const m = (decrypted.collabMembers || []).find(x => x.username === username && x.status === 'accepted')
      if (m && m.kanbanStatus){
        // Mirror minimal fields for collab member lane
        base = { ...base, collab: true }
        lane = m.kanbanStatus
      }
    }
    if (!lane) continue
    const key = `${base.projectId}:${lane}`
    if (seen.has(key)) continue
    seen.add(key)
    if (lane === 'DONE') done.push(base)
    else if (lane === 'IN_PROCESS') inProcess.push(base)
    else if (lane === 'TODO') todo.push(base)
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
    // Decrypt project fields using author's keys (like posts)
    const decrypted = decryptProjectFields(p, p.authorUsername);
    
    const b = (decrypted.bids || []).find(x => x.accepted)
    if (!b) continue
    // Only show on board after finalization (kanbanStatus is set)
    if (!b.kanbanStatus) continue
    const base = { projectId: String(decrypted._id), name: decrypted.projectType || decrypted.subcategory || decrypted.category, providerUsername: b.username, bidId: String(b._id), clientAcceptedAt: b.clientAcceptedAt, providerAcceptedAt: b.providerAcceptedAt, expectedDeadline: b.expectedDeadline, doneAt: b.doneAt, uploads: b.uploads || [], location: decrypted.location || null }
    if (b.kanbanStatus === 'DONE') done.push(base)
    else if (b.kanbanStatus === 'IN_PROCESS') inProcess.push(base)
    else if (b.kanbanStatus === 'TODO') todo.push(base)
  }
  res.json({ todo, inProcess, done })
})

export default router;
