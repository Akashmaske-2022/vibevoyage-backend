const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ACCESS_TOKEN_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_TOKEN_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

/**
 * Generate a JWT access token for the given user.
 * @param {{ id: string, email: string, tier: string }} user
 * @returns {string} Signed JWT access token
 */
function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, tier: user.tier },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

/**
 * Generate a secure opaque refresh token (random bytes, not JWT).
 * @returns {string} Hex-encoded refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate a secure one-time password reset token.
 * @returns {string} Hex-encoded reset token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify and decode a JWT access token.
 * @param {string} token
 * @returns {{ sub: string, email: string, tier: string }} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

/**
 * Get the expiration date for a refresh token (7 days from now).
 * @returns {Date}
 */
function getRefreshTokenExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

/**
 * Get the expiration date for a password reset token (1 hour from now).
 * @returns {Date}
 */
function getResetTokenExpiry() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  return date;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  verifyAccessToken,
  getRefreshTokenExpiry,
  getResetTokenExpiry,
};
