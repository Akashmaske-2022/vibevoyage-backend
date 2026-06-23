const { supabaseAdmin } = require('./supabaseClient');
const logger = require('../utils/logger');

/**
 * Persist an error to the Supabase `error_logs` table.
 * Uses the service-role client (bypasses RLS) because errors can occur
 * before a user is authenticated.
 *
 * This function is intentionally fire-and-forget — it never throws,
 * so a DB failure never masks the original error.
 *
 * @param {{ userId?: string, endpoint: string, errorMessage: string, stackTrace?: string, statusCode: number }} payload
 */
async function logError({ userId, endpoint, errorMessage, stackTrace, statusCode }) {
  try {
    const { error } = await supabaseAdmin.from('error_logs').insert({
      user_id: userId || null,
      endpoint,
      error_message: errorMessage,
      stack_trace: stackTrace || null,
      status_code: statusCode,
    });

    if (error) {
      // Log locally but don't rethrow — the caller must not be affected
      logger.warn({ error }, 'errorLogService: failed to persist error log to Supabase');
    }
  } catch (e) {
    logger.warn({ err: e?.message }, 'errorLogService: unexpected error during log persistence');
  }
}

module.exports = { logError };
