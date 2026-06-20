/**
 * Exponential backoff utility for retrying async operations.
 * Implements the pattern: wait 2s, then 4s, then 8s before failing.
 */

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async operation with exponential backoff.
 * @template T
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.baseDelayMs=2000] - Base delay in ms (doubles each attempt)
 * @param {(error: Error, attempt: number) => boolean} [options.shouldRetry] - Return false to stop retrying early
 * @returns {Promise<T>}
 */
async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelayMs = 2000, shouldRetry = () => true } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Exponential backoff: 2s, 4s, 8s...
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = { withRetry, sleep };
