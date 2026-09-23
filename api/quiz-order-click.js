/**
 * api/quiz-order-click.js
 * ------------------------
 * POST endpoint, fired by results.html (via navigator.sendBeacon) when someone
 * clicks the Order button. Stamps "Order Clicked At" and bumps "Order Clicks"
 * on that person's Airtable row, so the Submissions table shows the full
 * funnel: quiz taken -> order clicked -> email submitted. Actual purchases
 * still come from GA4 (the button's utm_campaign=find_your_fit params).
 *
 * The browser has already navigated away by the time this responds, so the
 * response body is never read - status codes are just for the logs.
 *
 * Usage: POST /api/quiz-order-click  body: {"submissionId": "<tally id>"}
 */

const { recordOrderClick } = require('../lib/airtable');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // sendBeacon posts a JSON Blob; Vercel parses it, but fall back to parsing a
  // raw string body just in case.
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = {};
    }
  }

  const { submissionId } = body;
  // Tally IDs are short alphanumerics; rejecting anything else also keeps
  // quotes out of the Airtable filterByFormula lookup.
  if (!submissionId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(submissionId))) {
    res.status(400).json({ error: 'Missing or invalid submissionId.' });
    return;
  }

  try {
    const found = await recordOrderClick(String(submissionId));
    if (!found) {
      res.status(404).json({ error: 'No submission found.' });
      return;
    }
  } catch (err) {
    console.error('Order-click tracking failed:', err);
    res.status(500).json({ error: 'Could not record click.' });
    return;
  }

  res.status(200).json({ status: 'ok' });
};
