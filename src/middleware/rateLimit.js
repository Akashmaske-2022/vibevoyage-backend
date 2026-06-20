const rateLimit = require('express-rate-limit');

/**
 * General IP-based rate limiter: 100 requests per minute per IP.
 * Applied to all routes.
 */
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
    statusCode: 429,
  },
});

/**
 * Strict limiter for auth endpoints to prevent brute-force.
 * 10 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT',
    statusCode: 429,
  },
});

module.exports = { globalLimiter, authLimiter };
