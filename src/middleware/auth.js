const { verifyAccessToken } = require('../utils/tokenUtils');
const logger = require('../utils/logger');

/**
 * Express middleware to verify JWT access token from Authorization header.
 * Attaches decoded user payload to req.user on success.
 *
 * Expected header: Authorization: Bearer <accessToken>
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    const payload = verifyAccessToken(token);

    // Attach user info to request for downstream handlers
    req.user = {
      id: payload.sub,
      email: payload.email,
      tier: payload.tier,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access token expired',
        code: 'TOKEN_EXPIRED',
        statusCode: 401,
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid access token',
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
    }

    logger.error({ error: error.message }, 'Auth middleware unexpected error');
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      statusCode: 500,
    });
  }
}

/**
 * Middleware factory: restrict access to specific user tiers.
 * Must be used after authenticate().
 * @param {...string} tiers - Allowed tiers, e.g. requireTier('PREMIUM')
 */
function requireTier(...tiers) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED', statusCode: 401 });
    }
    if (!tiers.includes(req.user.tier)) {
      return res.status(403).json({
        error: `This feature requires ${tiers.join(' or ')} tier`,
        code: 'INSUFFICIENT_TIER',
        statusCode: 403,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireTier };
