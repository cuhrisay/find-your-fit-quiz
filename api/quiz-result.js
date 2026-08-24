/**
 * api/quiz-result.js
 * -------------------
 * GET endpoint, polled by public/results.html.
 *
 * WHY THIS EXISTS: Tally's webhook (which triggers quiz-submit.js) is
 * fire-and-forget from Tally's side — it does not wait for a response before
 * redirecting the person to the next page. Since Groq generation takes a couple
 * of seconds, there's a real gap between "person clicks submit" and "the
 * recommendation is ready." This endpoint lets the results page ask "is it
 * ready yet?" every second or two until it is, instead of Tally trying to
 * render AI-generated content it doesn't have yet.
 *
 * Reads from resultCache.js (Vercel KV), NOT Airtable - api/quiz-submit.js
 * writes the finished result there specifically so this polling loop doesn't
 * burn Airtable's metered API calls. Airtable still gets the permanent
 * record; it's just never read by this endpoint. See resultCache.js.
 *
 * Usage: GET /api/quiz-result?id=<tally submission id>
 */

const { getResult } = require('../lib/resultCache');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const submissionId = req.query.id;
  if (!submissionId) {
    res.status(400).json({ error: 'Missing ?id= query parameter.' });
    return;
  }

  let cached;
  try {
    cached = await getResult(submissionId);
  } catch (err) {
    console.error('Result lookup failed:', err);
    res.status(500).json({ error: 'Could not look up this result.' });
    return;
  }

  if (!cached) {
    // Not written yet - still processing, or the webhook hasn't fired yet
    // (also hit if the cache entry has aged out - see resultCache.js TTL).
    res.status(200).json({ status: 'pending' });
    return;
  }

  const { message, ...result } = cached;

  res.status(200).json({
    status: 'ready',
    result,
    message,
  });
};
