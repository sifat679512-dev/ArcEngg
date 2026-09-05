import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import validator from 'email-validator';
import nodemailer from 'nodemailer';
import { User } from '../../../Model/User.js';
import { Session } from '../../../Model/Session.js';
import { encrypt, getKeyPair, saveUserKeys, loadUserKeys, decrypt } from '../utils/rsa.js';
import { getECCKeyPair, saveECCKeys } from '../utils/ecc.js';
import { createSession, revokeSession, setSessionCookie, clearSessionCookie } from '../utils/sessionManager.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function signToken(payload, sessionId) {
  const sid = sessionId || crypto.randomUUID();
  const token = jwt.sign({ ...payload, sid }, process.env.JWT_SECRET, { expiresIn: '1d' });
  return { token, sid };
}

// Admin login (hardcoded)
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '12345') {
    const { token, sid } = signToken({ id: 'admin', role: 'admin', username: 'admin' });
    await createSession({ userId: 'admin', username: 'admin', role: 'admin', req, token, sessionId: sid });
    setSessionCookie(res, token);
    return res.json({ token, role: 'admin', username: 'admin' });
  }
  return res.status(401).json({ message: 'Invalid admin credentials' });
});

// Password validation function
function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return errors;
}

// Signup for client or provider
router.post('/signup', async (req, res) => {
  try {
    const { username, password, confirmPassword, role, firstName, lastName, email, phoneNumber } = req.body;
    
    // Validate required fields
    if (!username || !password || !confirmPassword || !role || !firstName || !lastName || !email || !phoneNumber) {
      return res.status(400).json({ message: 'All fields are required: username, password, confirm password, role, first name, last name, email, phone number' });
    }
    
    // Validate role
    if (!['client', 'provider'].includes(role)) {
      return res.status(400).json({ message: 'role must be client or provider' });
    }
    
    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) return res.status(409).json({ message: 'Username already exists' });
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) return res.status(409).json({ message: 'Email already exists' });
    
    // Validate password strength
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordErrors });
    }
    
    // Validate password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    
    // Validate email format using email-validator
    if (!validator.validate(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Validate phone number format (basic validation - allows digits, spaces, dashes, parentheses)
    const phoneRegex = /^[\d\s\-\(\)+]+$/;
    if (!phoneRegex.test(phoneNumber) || phoneNumber.replace(/[\s\-\(\)]/g, '').length < 10) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    // Encrypt sensitive fields using simple RSA with user-specific keys
    try {
      console.log('[Signup] Generating RSA keys for user:', username);
      const keyPair = getKeyPair(username);
      console.log('[Signup] RSA keys generated, saving to file...');
      saveUserKeys(username, keyPair);
      console.log('[Signup] RSA keys saved successfully');
      
      // Generate and save ECC keys for the user
      console.log('[Signup] Generating ECC keys for user:', username);
      const eccKeys = getECCKeyPair(username);
      console.log('[Signup] ECC keys generated, saving to file...');
      saveECCKeys(username, eccKeys);
      console.log('[Signup] ECC keys saved successfully');
      
      const encryptedFirstName = encrypt(firstName, keyPair);
      const encryptedLastName = encrypt(lastName, keyPair);
      const encryptedEmail = encrypt(email, keyPair);
      const encryptedPhoneNumber = encrypt(phoneNumber, keyPair);

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({ 
        username, 
        passwordHash, 
        role, 
        firstName: encryptedFirstName, 
        lastName: encryptedLastName, 
        email: encryptedEmail, 
        phoneNumber: encryptedPhoneNumber,
        displayName: `${firstName} ${lastName}`
      });
      
      const { token, sid } = signToken({ id: user._id, role: user.role, username: user.username });
      await createSession({ userId: user._id, username: user.username, role: user.role, req, token, sessionId: sid });
      setSessionCookie(res, token);
      return res.status(201).json({ token, role: user.role, username: user.username });
    } catch (e) {
      console.error('[Signup] Encryption error:', e);
      return res.status(500).json({ message: 'Encryption failed', error: e.message });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map();

// Generate 8-digit OTP
function generateOTP() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Create nodemailer transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

// Send OTP to email
async function sendOTPEmail(email, otp, purpose = 'Password Reset') {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: `${purpose} OTP`,
      text: `Your OTP for ${purpose.toLowerCase()} is: ${otp}. This code will expire in 10 minutes.`,
      html: `<p>Your OTP for ${purpose.toLowerCase()} is: <strong>${otp}</strong></p><p>This code will expire in 10 minutes.</p>`,
    };
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Login for client or provider - Step 1: Send OTP
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.banned) {
      return res.status(403).json({ message: user.bannedReason || 'Your account is suspended', banned: true });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    
    // Decrypt user's email
    let userEmail;
    try {
      console.log('[Login] User email from DB:', user.email);
      const userKeys = loadUserKeys(username);
      if (!userKeys) {
        console.error('[Login] No RSA keys found for user:', username);
        // If no RSA keys, try using email as-is (might be plaintext for older users)
        userEmail = user.email;
        console.log('[Login] Using email as plaintext for user:', username, 'email:', userEmail);
      } else {
        userEmail = decrypt(user.email, userKeys);
        console.log('[Login] Successfully decrypted email for user:', username, 'email:', userEmail);
      }
    } catch (e) {
      console.error('[Login] Error decrypting email:', e);
      // Fallback to plaintext if decryption fails
      userEmail = user.email;
      console.log('[Login] Fallback to plaintext email for user:', username, 'email:', userEmail);
    }
    
    // Validate email before sending
    if (!userEmail || userEmail.trim() === '') {
      console.error('[Login] No valid email found for user:', username);
      return res.status(500).json({ message: 'No email address found for this account. Please contact support.' });
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with username and expiration (10 minutes)
    otpStore.set(username, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      userId: user._id,
      role: user.role,
    });
    
    // Send OTP email
    const emailSent = await sendOTPEmail(userEmail, otp, 'Login Verification');
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }
    
    return res.json({ message: 'OTP sent to your email', requiresOTP: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Login for client or provider - Step 2: Verify OTP and complete login
router.post('/login/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;
    
    if (!username || !otp) {
      return res.status(400).json({ message: 'Username and OTP are required' });
    }
    
    const storedData = otpStore.get(username);
    
    if (!storedData) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(username);
      return res.status(400).json({ message: 'OTP has expired' });
    }
    
    if (storedData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    // OTP is valid, generate token and complete login
    const { token, sid } = signToken({ 
      id: storedData.userId, 
      role: storedData.role, 
      username: username 
    });
    
    await createSession({ userId: storedData.userId, username, role: storedData.role, req, token, sessionId: sid });
    setSessionCookie(res, token);

    // Clear OTP after successful verification
    otpStore.delete(username);
    
    return res.json({ 
      token, 
      role: storedData.role, 
      username: username 
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Forgot password - Request OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Validate email format
    if (!validator.validate(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, an OTP will be sent' });
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiration (10 minutes)
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      username: user.username,
    });
    
    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }
    
    return res.json({ message: 'OTP sent to email' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }
    
    const storedData = otpStore.get(email);
    
    if (!storedData) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'OTP has expired' });
    }
    
    if (storedData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    // OTP is valid, mark as verified
    otpStore.set(email, { ...storedData, verified: true });
    
    return res.json({ message: 'OTP verified successfully' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const storedData = otpStore.get(email);
    
    if (!storedData || !storedData.verified) {
      return res.status(400).json({ message: 'OTP not verified or expired' });
    }
    
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'OTP has expired' });
    }
    
    if (storedData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    
    // Validate password strength
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordErrors });
    }
    
    // Update user password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();
    
    // Clear OTP
    otpStore.delete(email);
    
    return res.json({ message: 'Password reset successfully' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Logout - invalidate active session and clear cookie
router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.user?.sid) {
      await revokeSession(req.user.sid, 'manual_logout');
    }
    clearSessionCookie(res);
    return res.json({ ok: true, message: 'Logged out successfully' });
  } catch (e) {
    clearSessionCookie(res);
    return res.status(500).json({ message: 'Server error' });
  }
});

// View active sessions for authenticated user
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: String(req.user.id),
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    }).select('-tokenHash -fingerprint').sort({ lastActiveAt: -1 });

    return res.json({
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        isCurrent: s.sessionId === req.user.sid,
      }))
    });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Revoke a specific session
router.post('/sessions/:sessionId/revoke', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId, userId: String(req.user.id) });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    
    await revokeSession(sessionId, 'user_revoked');
    if (sessionId === req.user.sid) {
      clearSessionCookie(res);
    }
    return res.json({ ok: true, message: 'Session revoked successfully' });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;

