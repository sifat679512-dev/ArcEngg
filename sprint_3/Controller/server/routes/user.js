import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import validator from 'email-validator';
import { User } from '../../../Model/User.js';
import { VerificationRequest } from '../../../Model/VerificationRequest.js';
import { Rating } from '../../../Model/Rating.js';
import { encrypt, decrypt, loadUserKeys } from '../utils/rsa.js';

const router = express.Router();

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

// File upload setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.user.id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
  },
});

// Get my profile
router.get('/me', async (req, res) => {
  console.log('[GET /me] Fetching profile for user ID:', req.user.id);
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    console.log('[GET /me] User found:', user.username);
    
    // Decrypt sensitive fields for display
    const userData = user.toObject();
    try {
      const keys = loadUserKeys(user.username);
      console.log('[GET /me] Loaded keys for user:', user.username, 'keys found:', !!keys, 'type:', Array.isArray(keys) ? 'array' : typeof keys);
      if (!keys) {
        console.log('[GET /me] No keys found for user:', user.username, '- treating data as plaintext (legacy user)');
        // Return data as-is for legacy users without encryption keys
        return res.json(userData);
      }
      
      // Normalize keys to array
      const keysArray = Array.isArray(keys) ? keys : [keys];
      console.log('[GET /me] Number of key sets to try:', keysArray.length);
      
      // Helper function to try decryption with multiple keys
      const tryDecrypt = (ciphertext, fieldName) => {
        for (let i = 0; i < keysArray.length; i++) {
          try {
            const result = decrypt(ciphertext, keysArray[i]);
            // Check if result looks like valid text (printable ASCII)
            if (/^[\x20-\x7E]+$/.test(result) && result.length > 0 && result.length < 200) {
              console.log(`[GET /me] Successfully decrypted ${fieldName} with key set ${i + 1}:`, result);
              return result;
            }
          } catch (e) {
            console.log(`[GET /me] Key set ${i + 1} failed for ${fieldName}:`, e.message);
          }
        }
        console.log(`[GET /me] All keys failed for ${fieldName}, returning ciphertext`);
        return ciphertext;
      };
      
      console.log('[GET /me] Attempting to decrypt firstName:', userData.firstName);
      if (userData.firstName) {
        userData.firstName = tryDecrypt(userData.firstName, 'firstName');
      }
      
      console.log('[GET /me] Attempting to decrypt lastName:', userData.lastName);
      if (userData.lastName) {
        userData.lastName = tryDecrypt(userData.lastName, 'lastName');
      }
      
      console.log('[GET /me] Attempting to decrypt email:', userData.email);
      if (userData.email) {
        userData.email = tryDecrypt(userData.email, 'email');
      }
      
      console.log('[GET /me] Attempting to decrypt phoneNumber:', userData.phoneNumber);
      if (userData.phoneNumber) {
        userData.phoneNumber = tryDecrypt(userData.phoneNumber, 'phoneNumber');
      }
    } catch (e) {
      console.error('[GET /me] Error decrypting user data:', e);
    }
    
    console.log('[GET /me] Sending response');
    res.json(userData);
  } catch (e) {
    console.error('[GET /me] Server error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile (displayName, firstName, lastName, email, phoneNumber and/or password)
router.patch('/me', async (req, res) => {
  const { displayName, firstName, lastName, email, phoneNumber, password } = req.body;
  const update = {};
  const keyPair = loadUserKeys(req.user.username);
  if (!keyPair) {
    console.log('[PATCH /me] No keys found for user:', req.user.username, '- storing plaintext (legacy user)');
    // Store as plaintext for legacy users
    if (typeof displayName === 'string') update.displayName = displayName;
    if (typeof firstName === 'string') update.firstName = firstName;
    if (typeof lastName === 'string') update.lastName = lastName;
    if (typeof email === 'string') {
      if (!validator.validate(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      update.email = email.toLowerCase();
    }
    if (typeof phoneNumber === 'string') {
      const phoneRegex = /^[\d\s\-\(\)+]+$/;
      if (!phoneRegex.test(phoneNumber) || phoneNumber.replace(/[\s\-\(\)]/g, '').length < 10) {
        return res.status(400).json({ message: 'Invalid phone number format' });
      }
      update.phoneNumber = phoneNumber;
    }
  } else {
    if (typeof displayName === 'string') update.displayName = displayName;
    if (typeof firstName === 'string') {
      const encryptedFirstName = encrypt(firstName, keyPair);
      update.firstName = encryptedFirstName;
    }
    if (typeof lastName === 'string') {
      const encryptedLastName = encrypt(lastName, keyPair);
      update.lastName = encryptedLastName;
    }
    if (typeof email === 'string') {
      if (!validator.validate(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      const encryptedEmail = encrypt(email.toLowerCase(), keyPair);
      update.email = encryptedEmail;
    }
    if (typeof phoneNumber === 'string') {
      const phoneRegex = /^[\d\s\-\(\)+]+$/;
      if (!phoneRegex.test(phoneNumber) || phoneNumber.replace(/[\s\-\(\)]/g, '').length < 10) {
        return res.status(400).json({ message: 'Invalid phone number format' });
      }
      const encryptedPhoneNumber = encrypt(phoneNumber, keyPair);
      update.phoneNumber = encryptedPhoneNumber;
    }
  }
  if (typeof password === 'string' && password.length > 0) {
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ message: 'Password does not meet requirements', errors: passwordErrors });
    }
    update.passwordHash = await bcrypt.hash(password, 10);
  }
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-passwordHash');
  res.json(user);
});

// Upload avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const publicUrl = `/uploads/${req.file.filename}`;
  const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: publicUrl }, { new: true }).select('-passwordHash');
  res.json(user);
});

// Search users by role with optional domain filter (architecture/engineering)
// GET /api/user/search?q=alice&domains=architecture,engineering&role=client,provider
// - All users can search for both clients and providers
router.get('/search', async (req, res) => {
  try{
    const meRole = req.user.role
    const q = (req.query.q || '').toString().trim()
    const rawDomains = (req.query.domains || '').toString()
    const domains = rawDomains.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
    const rawRole = (req.query.role || '').toString()

    // Allow searching for both client and provider roles
    let targetRoles = ['client', 'provider']
    if (rawRole) {
      const requested = rawRole.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
      if (requested.length > 0) {
        targetRoles = requested.filter(r => ['client', 'provider'].includes(r))
      }
    }

    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })
    const match = { role: { $in: targetRoles } }
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      match.$or = [ { username: re }, { displayName: re } ]
    }
    const users = await User.find(match).select('username displayName firstName lastName role avatarUrl verified verifiedType ratingAvg ratingCount')

    // Map provider to latest approved verification request (if any)
    const ids = users.map(u=>u._id)
    const vrs = await VerificationRequest.aggregate([
      { $match: { userId: { $in: ids }, status: 'approved' } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', category: { $first: '$category' }, subtype: { $first: '$subtype' } } }
    ])
    const vrMap = new Map(vrs.map(v=>[v._id.toString(), { category: v.category, subtype: (v.subtype||'').toLowerCase() }]))

    function userDomains(info){
      // provider_individual subtype architect => architecture, engineer => engineering
      // provider_company => both
      if (!info) return []
      if (info.category === 'provider_company') return ['architecture','engineering']
      if (info.subtype === 'architect') return ['architecture']
      if (info.subtype === 'engineer') return ['engineering']
      return []
    }

    function responseShape(u){
      const info = vrMap.get(u._id.toString())
      const ds = userDomains(info)
      return {
        username: u.username,
        displayName: u.displayName || `${u.firstName} ${u.lastName}`,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        avatarUrl: u.avatarUrl,
        verified: !!u.verified,
        verifiedType: u.verifiedType || info?.category || null,
        verifiedCategory: info?.category || null,
        verifiedSubtype: info?.subtype || null,
        domains: ds,
        ratingAvg: u.ratingAvg || 0,
        ratingCount: u.ratingCount || 0,
      }
    }

    // Only apply domain filter if searching providers
    if (domains.length === 0 || !targetRoles.includes('provider')){
      return res.json(users.map(responseShape))
    }

    const wanted = new Set(domains)
    const filtered = users.filter(u => {
      if (u.role !== 'provider') return true // clients don't have domains
      const d = userDomains(vrMap.get(u._id.toString()))
      if (d.length === 0) return false // unknown domain, exclude when filter provided
      return d.some(x => wanted.has(x))
    }).map(responseShape)
    res.json(filtered)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Client: list my favorite providers
router.get('/favorites', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me?.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Client: add a provider to favorites
router.post('/favorites/:username', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const { username } = req.params
    const target = await User.findOne({ username, role: 'provider' }).select('username')
    if (!target) return res.status(404).json({ message: 'Provider not found' })
    await User.updateOne({ _id: req.user.id }, { $addToSet: { favoriteProviders: username } })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Client: remove a provider from favorites
router.delete('/favorites/:username', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const { username } = req.params
    await User.updateOne({ _id: req.user.id }, { $pull: { favoriteProviders: username } })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Get public user profile (only basic info visible to others)
router.get('/:username', async (req, res) => {
  try{
    const { username } = req.params
    const user = await User.findOne({ username }).select('username displayName firstName lastName role avatarUrl verified verifiedType ratingAvg ratingCount')
    if (!user) return res.status(404).json({ message: 'User not found' })
    
    const keyPair = loadUserKeys(username);
    
    // If requesting own profile, return full info with decryption
    if (req.user && req.user.username === username) {
      const fullUser = await User.findOne({ username }).select('-passwordHash')
      const userData = fullUser.toObject();
      try {
        if (keyPair) {
          if (userData.firstName) {
            userData.firstName = decrypt(userData.firstName, keyPair);
          }
          if (userData.lastName) {
            userData.lastName = decrypt(userData.lastName, keyPair);
          }
          if (userData.email) {
            userData.email = decrypt(userData.email, keyPair);
          }
          if (userData.phoneNumber) {
            userData.phoneNumber = decrypt(userData.phoneNumber, keyPair);
          }
        } else {
          console.log('[GET /:username] No keys found for user:', username, '- treating as plaintext (legacy user)');
        }
      } catch (e) {
        console.error('Error decrypting user data:', e);
      }
      return res.json(userData);
    }
    
    // Otherwise return only public info with name decryption for display
    const userData = user.toObject();
    try {
      if (keyPair) {
        if (userData.firstName) {
          userData.firstName = decrypt(userData.firstName, keyPair);
        }
        if (userData.lastName) {
          userData.lastName = decrypt(userData.lastName, keyPair);
        }
      } else {
        console.log('[GET /:username] No keys found for user:', username, '- treating as plaintext (legacy user)');
      }
    } catch (e) {
      console.error('Error decrypting user data:', e);
    }
    
    res.json({
      username: userData.username,
      displayName: userData.displayName || `${userData.firstName} ${userData.lastName}`,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      avatarUrl: userData.avatarUrl,
      verified: userData.verified,
      verifiedType: userData.verifiedType,
      ratingAvg: userData.ratingAvg,
      ratingCount: userData.ratingCount
    })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// List ratings/comments for a user (role-based visibility)
router.get('/:username/ratings', async (req, res) => {
  try{
    const meRole = req.user.role
    const { username } = req.params
    const limit = Math.min(50, Math.max(1, Number(req.query.limit)||20))

    const toUser = await User.findOne({ username }).select('role username')
    if (!toUser) return res.status(404).json({ message: 'User not found' })

    // Visibility rules: client views provider comments; provider views client comments; admin views all
    if (meRole === 'client' && toUser.role !== 'provider') return res.status(403).json({ message: 'Forbidden' })
    if (meRole === 'provider' && toUser.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })

    const [items, total] = await Promise.all([
      Rating.find({ toUserId: toUser._id }).sort({ createdAt: -1 }).limit(limit).select('fromUsername fromRole stars comment createdAt'),
      Rating.countDocuments({ toUserId: toUser._id })
    ])
    res.json({ items, total })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Submit or update a rating for a user by username
router.post('/:username/rate', async (req, res) => {
  try{
    const meId = req.user.id
    const meRole = req.user.role
    const { username } = req.params
    const { stars, comment } = req.body || {}
    const s = Number(stars)
    if (!(s >= 1 && s <= 5)) return res.status(400).json({ message: 'Stars must be 1-5' })

    const toUser = await User.findOne({ username })
    if (!toUser) return res.status(404).json({ message: 'User not found' })

    if (meRole === 'client' && toUser.role !== 'provider') return res.status(403).json({ message: 'Clients can rate providers only' })
    if (meRole === 'provider' && toUser.role !== 'client') return res.status(403).json({ message: 'Providers can rate clients only' })
    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })

    const meUser = await User.findById(meId).select('username role')

    await Rating.findOneAndUpdate(
      { fromUserId: meId, toUserId: toUser._id },
      { fromUserId: meId, fromUsername: meUser.username, fromRole: meUser.role, toUserId: toUser._id, toUsername: toUser.username, toRole: toUser.role, stars: s, comment: (comment||'') },
      { upsert: true, new: true }
    )

    const agg = await Rating.aggregate([
      { $match: { toUserId: toUser._id } },
      { $group: { _id: '$toUserId', avg: { $avg: '$stars' }, cnt: { $count: {} } } }
    ])
    const avg = agg[0]?.avg || 0
    const cnt = agg[0]?.cnt || 0
    await User.findByIdAndUpdate(toUser._id, { ratingAvg: avg, ratingCount: cnt })

    res.json({ message: 'Rated', ratingAvg: avg, ratingCount: cnt })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
