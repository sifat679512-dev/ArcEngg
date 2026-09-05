import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../../../Model/Notification.js';

const router = express.Router();

// List my notifications (latest first) with optional limit
router.get('/', requireAuth, async (req,res)=>{
  try{
    const limit = Math.min(parseInt(req.query.limit||'20',10)||20, 100)
    const items = await Notification.find({ toUsername: req.user.username }).sort({ createdAt: -1 }).limit(limit)
    const unread = await Notification.countDocuments({ toUsername: req.user.username, read: false })
    res.json({ items, unread })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Mark one notification as read
router.post('/:id/read', requireAuth, async (req,res)=>{
  try{
    const { id } = req.params
    const n = await Notification.findOneAndUpdate({ _id: id, toUsername: req.user.username }, { read: true }, { new: true })
    if (!n) return res.status(404).json({ message: 'Not found' })
    res.json({ ok: true })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Mark all as read
router.post('/read-all', requireAuth, async (req,res)=>{
  try{
    await Notification.updateMany({ toUsername: req.user.username, read: false }, { read: true })
    res.json({ ok: true })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

export default router;
