const logger = require('../utils/logger');

/**
 * Centralized error handling middleware.
 * Must be the LAST middleware registered in Express (after all routes).
 *
 * Standardizes all error responses to:
 * { error: string, code: string, statusCode: number }
 */
function errorHandler(err, req, res, next) {
  // Log the error for audit trail (sanitized)
  logger.error({
    err: {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
    req: {
      method: req.method,
      url: req.url,
      userId: req.user?.id,
    },
  });

  // Zod validation errors
  if (err.name === 'ZodError') {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return res.status(400).json({
      error: `Validation failed: ${messages}`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }

  // Prisma / database errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'A record with this value already exists',
      code: 'DUPLICATE_ENTRY',
      statusCode: 409,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found',
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  }

  // Custom application errors (thrown with .statusCode)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'APP_ERROR',
      statusCode: err.statusCode,
    });
  }

  // Unknown server errors
  return res.status(500).json({
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  });
}

/**
 * Factory to create standardized application errors.
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Machine-readable error code
 * @returns {Error}
 */
function createError(message, statusCode = 500, code = 'APP_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = { errorHandler, createError };
