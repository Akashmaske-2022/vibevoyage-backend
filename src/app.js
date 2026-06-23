require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { globalLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const aiRoutes = require('./routes/ai');
const itineraryRoutes = require('./routes/itineraries');
const stripeRoutes = require('./routes/stripe');
const feedbackRoutes = require('./routes/feedback');

const app = express();

// Trust proxy (required for express-rate-limit to read client IP behind Render/Cloudflare)
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Handled by frontend
}));

// ─── CORS ─────────────────────────────────────────────────────────────────
// Get FRONTEND_URL from environment and remove any trailing slash for accurate matching
const frontendUrl = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.replace(/\/$/, '') 
  : 'http://localhost:5173';

const allowedOrigins = [
  frontendUrl,
  'http://localhost:5173',
  'http://localhost:3000',
];

// Console.log showing which origins are enabled (as requested)
console.log(`[CORS] Allowed Origins: ${allowedOrigins.join(', ')}`);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Check if the request origin matches our allowed list
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    // If not allowed, reject
    callback(new Error(`CORS policy violation: origin ${origin} not allowed`));
  },
  credentials: true, // Required for cookies/auth
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Included PATCH as requested
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────
// IMPORTANT: Stripe webhook MUST receive raw body (handled in stripe route)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// All other routes use JSON
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ─── Logging ──────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Rate Limiting ────────────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/itineraries', itineraryRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/feedback', feedbackRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
    statusCode: 404,
  });
});

// ─── Centralized Error Handler ────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
