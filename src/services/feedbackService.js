const { supabaseAdmin } = require('./supabaseClient');
const logger = require('../utils/logger');

/**
 * Insert a feedback record into the Supabase `feedback` table.
 * Uses the service-role client so RLS is bypassed (backend trust).
 *
 * @param {{ userId: string, message: string, rating: number, category: string }} payload
 * @returns {Promise<object>} The inserted row
 */
async function submitFeedback({ userId, message, rating, category }) {
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .insert({
      user_id: userId,
      message,
      rating,
      category,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId }, 'feedbackService: failed to insert feedback');
    throw new Error(`Failed to save feedback: ${error.message}`);
  }

  logger.info({ feedbackId: data.id, userId }, 'feedbackService: feedback submitted');
  return data;
}

module.exports = { submitFeedback };
