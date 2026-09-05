import express from 'express';
import { google } from 'googleapis';
import { requireAuth } from '../middleware/auth.js';
import { CalendarToken } from '../../../Model/CalendarToken.js';

const router = express.Router();

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5002/api/calendar/oauth2callback';
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Step 1: Get auth URL
router.get('/auth-url', requireAuth, (req, res) => {
  try {
    const oauth2Client = getOAuthClient();
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
    ];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: encodeURIComponent(JSON.stringify({ username: req.user.username })),
    });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ message: 'Calendar auth error', error: e.message });
  }
});

// Step 2: OAuth2 callback to exchange code -> tokens
router.get('/oauth2callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ message: 'Missing code' });
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(String(code));
    // If state carries username, store tokens server-side
    let stored = false
    if (req.query.state) {
      try {
        const parsed = JSON.parse(decodeURIComponent(String(req.query.state)));
        if (parsed && parsed.username) {
          await CalendarToken.findOneAndUpdate(
            { username: parsed.username },
            {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              scope: tokens.scope,
              tokenType: tokens.token_type,
              expiryDate: tokens.expiry_date,
            },
            { upsert: true, new: true }
          );
          stored = true
        }
      } catch {}
    }
    const redirectBase = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
    if (stored) {
      return res.redirect(`${redirectBase}?calendar=connected`)
    }
    // Fallback to returning tokens as JSON
    res.json({ tokens });
  } catch (e) {
    res.status(500).json({ message: 'Token exchange failed', error: e.message });
  }
});

// Store tokens for the authenticated user
router.post('/store-tokens', requireAuth, async (req, res) => {
  try {
    const { access_token, refresh_token, scope, token_type, expiry_date } = req.body || {};
    if (!access_token && !refresh_token) return res.status(400).json({ message: 'Missing tokens' });
    const username = req.user.username;
    const update = {
      accessToken: access_token || undefined,
      refreshToken: refresh_token || undefined,
      scope: scope || undefined,
      tokenType: token_type || undefined,
      expiryDate: expiry_date || undefined,
    };
    const doc = await CalendarToken.findOneAndUpdate(
      { username },
      update,
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Failed to store tokens', error: e.message });
  }
});

// Get token presence for current user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const doc = await CalendarToken.findOne({ username: req.user.username }).lean();
    res.json({ hasTokens: !!doc, tokenInfo: doc ? { scope: doc.scope, expiryDate: doc.expiryDate } : null });
  } catch (e) {
    res.status(500).json({ message: 'Failed to load token info', error: e.message });
  }
});

// Proxy: Create an event using a client-provided access token
router.post('/create-event', async (req, res) => {
  try {
    const { accessToken, summary, description, start, end, timeZone } = req.body || {};
    if (!accessToken) return res.status(400).json({ message: 'Missing accessToken' });
    if (!start || !end) return res.status(400).json({ message: 'Missing start/end' });

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const resp = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: summary || 'Project Bidding Deadline',
        description: description || '',
        start: { dateTime: start, timeZone: timeZone || 'UTC' },
        end: { dateTime: end, timeZone: timeZone || 'UTC' },
      },
    });
    res.json({ eventId: resp.data.id, htmlLink: resp.data.htmlLink });
  } catch (e) {
    res.status(500).json({ message: 'Failed to create event', error: e.message });
  }
});

export default router;
