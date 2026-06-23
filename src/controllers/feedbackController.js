const { z } = require('zod');
const { submitFeedback } = require('../services/feedbackService');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ─── Validation Schema ────────────────────────────────────────────────────────
const feedbackSchema = z.object({
  message: z
    .string({ required_error: 'Message is required' })
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message cannot exceed 2000 characters'),
  rating: z
    .number({ required_error: 'Rating is required' })
    .int()
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  category: z.enum(['UI/UX', 'Bug', 'Feature Request', 'Other'], {
    required_error: 'Category is required',
    invalid_type_error: 'Invalid category',
  }),
});

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/feedback
 * Protected — req.user is set by authenticate() middleware.
 * Saves user feedback into the Supabase feedback table.
 */
async function createFeedback(req, res, next) {
  try {
    const parsed = feedbackSchema.safeParse(req.body);

    if (!parsed.success) {
      // Zod will be caught by the central error handler if we throw,
      // but safeParse lets us return a cleaner 400 here
      const messages = parsed.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return next(createError(`Validation failed: ${messages}`, 400, 'VALIDATION_ERROR'));
    }

    const { message, rating, category } = parsed.data;
    const userId = req.user.id;

    const feedback = await submitFeedback({ userId, message, rating, category });

    logger.info({ userId, feedbackId: feedback.id }, 'Feedback submitted');

    return res.status(201).json({
      message: 'Thank you for your feedback!',
      feedback: {
        id: feedback.id,
        rating: feedback.rating,
        category: feedback.category,
        createdAt: feedback.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createFeedback };
