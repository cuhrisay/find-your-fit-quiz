/**
 * retry.js
 * --------
 * Small generic retry-with-backoff helper. Used by api/quiz-capture-email.js
 * for the Mailchimp push - since that endpoint is now the only place an
 * email ever gets connected to a recommendation, a transient failure is
 * worth a couple of extra attempts before giving up.
 */
async function withRetries(fn, attempts = 3, baseDelayMs = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetries };
