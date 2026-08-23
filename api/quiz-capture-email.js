/**
 * api/quiz-capture-email.js
 * --------------------------
 * POST endpoint, called from results.html's post-result "email me my
 * results + 10% off" form (August 2026). This is now the ONLY place an
 * email ever gets attached to a quiz submission - api/quiz-submit.js no
 * longer collects it at all, and the Tally form itself shouldn't ask for it
 * either (see docs/Tally_Form_Changes.md).
 *
 * Looks up the already-routed result by Tally Submission ID (same lookup
 * api/quiz-result.js uses) and pushes it to Mailchimp - same as the old
 * flow did at submit time, just triggered later, by the person's choice,
 * instead of automatically. The Mailchimp automation email already has the
 * 10% off code baked into its template - nothing here generates or sends one.
 *
 * No consent checkbox - a plain notice next to the submit button on
 * results.html covers marketing consent (this isn't health-data collection,
 * so it doesn't carry the same legal requirement the front-of-quiz consent
 * screen does; see the "Privacy design" section of the README for why that
 * distinction matters here).
 */

const { findSubmissionById } = require('../lib/airtable');
const { pushToMailchimp } = require('../lib/mailchimp');
const { withRetries } = require('../lib/retry');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { submissionId, email, firstName } = req.body || {};

  if (!submissionId) {
    res.status(400).json({ error: 'Missing submissionId.' });
    return;
  }
  if (!email || !EMAIL_RE.test(String(email))) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  let record;
  try {
    record = await findSubmissionById(submissionId);
  } catch (err) {
    console.error('Email-capture lookup failed:', err);
    res.status(500).json({ error: 'Could not look up this result.' });
    return;
  }

  if (!record) {
    res.status(404).json({ error: 'No result found for this submission yet.' });
    return;
  }

  const answers = { email, firstName: firstName || '' };
  const routedResult = {
    product: record['Routed Product'],
    firmness: record['Routed Firmness'],
    size: record['Routed Size'],
    thickness: record['Routed Thickness'],
  };
  const emailSummary = record['Email Summary'] || '';

  try {
    await withRetries(() => pushToMailchimp(answers, routedResult, emailSummary));
  } catch (err) {
    console.error('Mailchimp push failed after retries:', err);
    res.status(502).json({ error: 'Could not send your email right now. Please try again.' });
    return;
  }

  res.status(200).json({ status: 'ok' });
};
