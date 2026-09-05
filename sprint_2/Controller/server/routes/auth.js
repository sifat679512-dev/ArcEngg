import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../../Model/User.js';

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
}

// Admin login (hardcoded)
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '12345') {
    const token = signToken({ id: 'admin', role: 'admin', username: 'admin' });
    return res.json({ token, role: 'admin', username: 'admin' });
  }
  return res.status(401).json({ message: 'Invalid admin credentials' });
});

// Signup for client or provider
router.post('/signup', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'username, password, role are required' });
    }
    if (!['client', 'provider'].includes(role)) {
      return res.status(400).json({ message: 'role must be client or provider' });
    }
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ message: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, role });
    const token = signToken({ id: user._id, role: user.role, username: user.username });
    return res.status(201).json({ token, role: user.role, username: user.username });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Login for client or provider
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken({ id: user._id, role: user.role, username: user.username });
    return res.json({ token, role: user.role, username: user.username });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
