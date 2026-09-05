import jwt from 'jsonwebtoken';
import { verifySession, clearSessionCookie } from '../utils/sessionManager.js';

export async function requireAuth(req, res, next) {
  // Extract token from HttpOnly cookie (protects from XSS) or Authorization Bearer header
  const authHeader = req.headers.authorization || '';
  let token = null;

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.session_token) {
    token = req.cookies.session_token;
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verify session integrity, lifecycle, and check for session hijacking
    const sessionCheck = await verifySession({ tokenPayload: payload, token, req });
    if (!sessionCheck.ok) {
      clearSessionCookie(res);
      return res.status(sessionCheck.status || 401).json({
        message: sessionCheck.reason,
        hijacked: !!sessionCheck.hijacked,
        revoked: !!sessionCheck.revoked,
      });
    }

    req.user = payload;
    req.session = sessionCheck.session;
    next();
  } catch (e) {
    clearSessionCookie(res);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

