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
 * Usage: GET /api/quiz-result?id=<tally submission id>
 */

const { findSubmissionById } = require('../lib/airtable');
const { getOrderLink, getProductDisplayName } = require('../lib/productLinks');

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

  let record;
  try {
    record = await findSubmissionById(submissionId);
  } catch (err) {
    console.error('Result lookup failed:', err);
    res.status(500).json({ error: 'Could not look up this result.' });
    return;
  }

  if (!record) {
    // Not logged yet - still processing, or the webhook hasn't fired yet.
    res.status(200).json({ status: 'pending' });
    return;
  }

  const orderLink = getOrderLink(record['Routed Product']);

  res.status(200).json({
    status: 'ready',
    result: {
      product: getProductDisplayName(record['Routed Product']),
      firmness: record['Routed Firmness'],
      size: record['Routed Size'],
      thickness: record['Routed Thickness'],
      secondCushion: record['Second Cushion']
        ? JSON.parse(record['Second Cushion'])
        : null,
      orderUrl: orderLink.url,
      orderLabel: orderLink.label,
    },
    message: record['AI Message'],
  });
};
