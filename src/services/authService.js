const bcrypt = require('bcryptjs');
const prisma = require('../models/prismaClient');
const {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  getRefreshTokenExpiry,
  getResetTokenExpiry,
  verifyAccessToken,
} = require('../utils/tokenUtils');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

/**
 * Register a new user.
 * @param {{ email: string, password: string, preferences?: object }} data
 * @returns {{ accessToken, refreshToken, user }}
 */
async function signup({ email, password, preferences }) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw createError('An account with this email already exists', 409, 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      preferences: preferences || null,
    },
    select: { id: true, email: true, tier: true, createdAt: true },
  });

  const { accessToken, refreshToken } = await _generateTokenPair(user);
  logger.info({ userId: user.id }, 'User signed up');

  return { accessToken, refreshToken, user };
}

/**
 * Log in an existing user.
 * @param {{ email: string, password: string }} credentials
 * @returns {{ accessToken, refreshToken, user }}
 */
async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, tier: true, passwordHash: true },
  });

  if (!user) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const safeUser = { id: user.id, email: user.email, tier: user.tier };
  const { accessToken, refreshToken } = await _generateTokenPair(safeUser);
  logger.info({ userId: user.id }, 'User logged in');

  return { accessToken, refreshToken, user: safeUser };
}

/**
 * Refresh an access token using a valid refresh token.
 * @param {string} refreshToken
 * @returns {{ accessToken }}
 */
async function refreshAccessToken(refreshToken) {
  const record = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, email: true, tier: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    throw createError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const accessToken = generateAccessToken(record.user);
  return { accessToken };
}

/**
 * Log out by deleting the refresh token from the database.
 * @param {string} refreshToken
 */
async function logout(refreshToken) {
  if (!refreshToken) return;
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

/**
 * Initiate password reset — generates a token and returns it.
 * In production, the token would be emailed via nodemailer.
 * @param {string} email
 * @returns {{ token: string, expiresAt: Date }} (token returned for dev; email in prod)
 */
async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return success to prevent user enumeration
  if (!user) return { message: 'If that email exists, a reset link was sent' };

  // Invalidate any existing tokens
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });

  const token = generateResetToken();
  const expiresAt = getResetTokenExpiry();

  await prisma.passwordReset.create({
    data: { userId: user.id, token, expiresAt },
  });

  logger.info({ userId: user.id }, 'Password reset requested');

  // In production: send email with reset link
  // await emailService.sendPasswordReset(user.email, token);

  return { message: 'If that email exists, a reset link was sent', devToken: token };
}

/**
 * Complete password reset using a valid token.
 * @param {{ token: string, newPassword: string }} data
 */
async function resetPassword({ token, newPassword }) {
  const record = await prisma.passwordReset.findUnique({ where: { token } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw createError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { used: true } }),
    // Invalidate all refresh tokens for security
    prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  logger.info({ userId: record.userId }, 'Password reset completed');
}

// ─── Private Helpers ───────────────────────────────────────────────────────

async function _generateTokenPair(user) {
  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  await prisma.refreshToken.create({
    data: { userId: user.id, token: rawRefreshToken, expiresAt },
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

module.exports = { signup, login, refreshAccessToken, logout, forgotPassword, resetPassword };
