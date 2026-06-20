const { z } = require('zod');
const authService = require('../services/authService');
const logger = require('../utils/logger');

// ─── Validation Schemas ────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  preferences: z.object({
    preferredSeasons: z.array(z.string()).optional(),
    budgetRange: z.string().optional(),
    travelStyle: z.string().optional(),
    adventureLevel: z.number().min(1).max(5).optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

// ─── Cookie Helpers ────────────────────────────────────────────────────────

/**
 * Set refresh token as httpOnly cookie.
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  });
}

// ─── Controllers ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/signup
 */
async function signup(req, res, next) {
  try {
    const data = signupSchema.parse(req.body);
    const result = await authService.signup(data);

    setRefreshCookie(res, result.refreshToken);

    return res.status(201).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);

    setRefreshCookie(res, result.refreshToken);

    return res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res, next) {
  try {
    // Read from httpOnly cookie or request body (for non-browser clients)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN',
        statusCode: 401,
      });
    }

    const result = await authService.refreshAccessToken(refreshToken);
    return res.status(200).json({ accessToken: result.accessToken });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    await authService.logout(refreshToken);

    res.clearCookie('refreshToken', { path: '/api/auth' });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(email);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    const data = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(data);
    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me — Return current user profile
 */
async function getMe(req, res, next) {
  try {
    const prisma = require('../models/prismaClient');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, tier: true, preferences: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND', statusCode: 404 });
    }

    return res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}

module.exports = { signup, login, refresh, logout, forgotPassword, resetPassword, getMe };
