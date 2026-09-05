import crypto from 'crypto';
import { Session } from '../../../Model/Session.js';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours idle timeout
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours absolute lifespan

/**
 * Normalize client IP to avoid false positives between IPv4 and IPv6 loopbacks or reverse proxies
 */
export function getClientIp(req) {
  let ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           req.socket?.remoteAddress ||
           req.ip ||
           '';

  // Normalize IPv6 localhost / mapped IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.')) {
    return '127.0.0.1';
  }
  // Strip IPv6 prefix if present on IPv4
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip || '127.0.0.1';
}

/**
 * Extract User-Agent from request header
 */
export function getClientUserAgent(req) {
  return req.headers['user-agent'] || 'unknown-client';
}

/**
 * Generate a cryptographic HMAC fingerprint binding IP and User-Agent to the session
 */
export function generateFingerprint(req) {
  const ip = getClientIp(req);
  const ua = getClientUserAgent(req);
  const secret = process.env.JWT_SECRET || 'arcengg-secure-session-key';
  return crypto.createHmac('sha256', secret).update(`${ip}::${ua}`).digest('hex');
}

/**
 * Compute SHA-256 hash of a JWT string for database storage
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token || '').digest('hex');
}

/**
 * Create a new managed session record in MongoDB
 */
export async function createSession({ userId, username, role, req, token, sessionId }) {
  const sid = sessionId || crypto.randomUUID();
  const ip = getClientIp(req);
  const ua = getClientUserAgent(req);
  const fingerprint = generateFingerprint(req);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);

  try {
    const session = await Session.create({
      sessionId: sid,
      userId: String(userId),
      username,
      role,
      tokenHash,
      ipAddress: ip,
      userAgent: ua,
      fingerprint,
      isValid: true,
      isRevoked: false,
      lastActiveAt: new Date(),
      expiresAt,
    });
    return session;
  } catch (err) {
    console.error('[SessionManager] Error creating session in DB:', err.message);
    // Return minimal object if DB error to avoid crashing login
    return {
      sessionId: sid,
      userId: String(userId),
      username,
      role,
      tokenHash,
      ipAddress: ip,
      userAgent: ua,
      fingerprint,
      expiresAt,
    };
  }
}

/**
 * Verify session validity and detect session hijacking
 */
export async function verifySession({ tokenPayload, token, req }) {
  if (!tokenPayload) {
    return { ok: false, reason: 'Missing token payload', status: 401 };
  }

  const sid = tokenPayload.sid;

  // If token was issued without a session ID (legacy or backward compatibility), allow if signature valid
  if (!sid) {
    return { ok: true, session: null, legacy: true };
  }

  let session;
  try {
    session = await Session.findOne({ sessionId: sid });
  } catch (err) {
    console.error('[SessionManager] DB error looking up session:', err.message);
    return { ok: true, session: null, error: err.message };
  }

  if (!session) {
    return { ok: false, reason: 'Session not found or expired', status: 401 };
  }

  if (session.isRevoked) {
    return {
      ok: false,
      reason: `Session has been revoked (${session.revokedReason || 'logged out'}). Please sign in again.`,
      status: 401,
      revoked: true,
    };
  }

  const now = Date.now();

  // Check absolute expiration
  if (now > new Date(session.expiresAt).getTime()) {
    session.isRevoked = true;
    session.revokedReason = 'expired';
    session.revokedAt = new Date();
    await session.save().catch(() => {});
    return { ok: false, reason: 'Session expired. Please sign in again.', status: 401 };
  }

  // Check idle timeout
  if (now - new Date(session.lastActiveAt).getTime() > IDLE_TIMEOUT_MS) {
    session.isRevoked = true;
    session.revokedReason = 'idle_timeout';
    session.revokedAt = new Date();
    await session.save().catch(() => {});
    return { ok: false, reason: 'Session timed out due to inactivity. Please sign in again.', status: 401 };
  }

  // Session Hijacking Detection: Validate Client Fingerprint
  const currentFingerprint = generateFingerprint(req);
  const currentIp = getClientIp(req);
  const currentUa = getClientUserAgent(req);

  if (currentFingerprint !== session.fingerprint) {
    // Session hijacking detected! Client IP or User-Agent does not match session origin.
    session.isRevoked = true;
    session.isValid = false;
    session.revokedReason = 'session_hijacking_detected';
    session.revokedAt = new Date();
    await session.save().catch(() => {});

    console.warn(`[SECURITY ALERT] Session hijacking detected for user "${session.username}"!`);
    console.warn(`Expected: IP=${session.ipAddress}, UA=${session.userAgent}`);
    console.warn(`Received: IP=${currentIp}, UA=${currentUa}`);
    console.warn(`Action: Session ${session.sessionId} terminated immediately.`);

    return {
      ok: false,
      reason: 'Session hijacking detected: client context mismatch. Session terminated immediately for security reasons.',
      status: 401,
      hijacked: true,
    };
  }

  // Token hash verification
  if (token) {
    const currentTokenHash = hashToken(token);
    if (session.tokenHash && session.tokenHash !== currentTokenHash) {
      session.isRevoked = true;
      session.revokedReason = 'token_tampered';
      session.revokedAt = new Date();
      await session.save().catch(() => {});
      return { ok: false, reason: 'Authentication token mismatch. Session terminated.', status: 401 };
    }
  }

  // Throttle lastActiveAt update to once every minute
  if (now - new Date(session.lastActiveAt).getTime() > 60000) {
    session.lastActiveAt = new Date();
    session.save().catch(() => {});
  }

  return { ok: true, session };
}

/**
 * Revoke an active session by session ID
 */
export async function revokeSession(sessionId, reason = 'manual_logout') {
  if (!sessionId) return;
  try {
    await Session.findOneAndUpdate(
      { sessionId },
      { isRevoked: true, isValid: false, revokedReason: reason, revokedAt: new Date() }
    );
  } catch (err) {
    console.error('[SessionManager] Error revoking session:', err.message);
  }
}

/**
 * Attach HttpOnly, SameSite, Secure cookie to response to protect token from script access
 */
export function setSessionCookie(res, token) {
  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ABSOLUTE_TIMEOUT_MS,
    path: '/',
  });
}

/**
 * Clear session cookies from response
 */
export function clearSessionCookie(res) {
  res.clearCookie('session_token', { path: '/' });
  res.clearCookie('token', { path: '/' });
}
