import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import postsRoutes from './routes/posts.js';
import projectsRoutes from './routes/projects.js';
import calendarRoutes from './routes/calendar.js';
import verificationRoutes from './routes/verification.js';
import { requireAuth } from './middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5002;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Allow any origin in dev to avoid port mismatches during local testing
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
// static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// protected user routes
app.use('/api/user', requireAuth, userRoutes);
// posts routes (route-level auth inside)
app.use('/api/posts', postsRoutes);
// projects routes
app.use('/api/projects', projectsRoutes);
// calendar routes
app.use('/api/calendar', calendarRoutes);
// verification routes
app.use('/api/verification', verificationRoutes);

async function start() {
  await connectDB(process.env.MONGO_URI);
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start();
