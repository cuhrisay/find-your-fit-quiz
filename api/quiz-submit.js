/**
 * api/quiz-submit.js
 * -------------------
 * POST endpoint. Tally's webhook (Integrations -> Webhooks) points here.
 *
 * Flow per submission:
 *   0. Verify the request actually came from Tally (Tally-Signature header) -
 *      this endpoint has no other auth, so anyone who finds the URL could
 *      otherwise POST crafted payloads to it directly.
 *   1. Parse the raw Tally payload into normalized answers.
 *   2. Run the deterministic routing table (routing.js) -> product/firmness/etc.
 *   3. ONLY if the free-text box has content: call Groq for the one personal
 *      paragraph + distress classification (groq.js). Empty box -> no AI call
 *      at all; the message is fully deterministic.
 *   4. Compose the final message from fixed templates (composeMessage.js).
 *   5. Log everything to Airtable (airtable.js) - this doubles as the short-term
 *      "result lookup" store that api/quiz-result.js polls, AND the permanent
 *      data log described in Structure v5 §5.
 *   6. Push the result to Mailchimp (mailchimp.js) so the existing automation
 *      sends the email copy. Retried a couple times with backoff since, after
 *      the Airtable privacy split (August 2026), Mailchimp is the only place
 *      an email is ever connected to a recommendation - worth a bit of extra
 *      effort before giving up.
 *
 * Steps 3, 5, and 6 are logged-but-non-fatal: if Groq, Airtable, or Mailchimp
 * fail, the person still gets their result (the composed message just won't
 * include the free-text response paragraph if Groq failed). The one thing that
 * MUST succeed for a usable response is routing.
 */

const crypto = require('crypto');
const { parseTallyPayload } = require('../lib/parseTally');
const { routeCushion } = require('../lib/routing');
const { generateResultMessage } = require('../lib/groq');
const { composeResultMessage, composeEmailSummary } = require('../lib/composeMessage');
const { logSubmission } = require('../lib/airtable');
const { pushToMailchimp } = require('../lib/mailchimp');

/**
 * Verifies the Tally-Signature header against TALLY_SIGNING_SECRET, per
 * Tally's documented scheme: base64(HMAC-SHA256(signingSecret,
 * JSON.stringify(payload))) - see tally.so/help/webhooks.
 *
 * If TALLY_SIGNING_SECRET isn't set, verification is skipped (returns true)
 * rather than rejecting everything - this lets the code ship before the
 * secret is generated in Tally's webhook settings and added to Vercel's env
 * vars. Once both are set, every unsigned or mismatched request is rejected.
 */
function isValidTallySignature(req) {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) return true;

  const signature = req.headers['tally-signature'];
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('base64');

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Retries an async function with exponential backoff. Used only for the
 * Mailchimp push (see file header) - a transient outage or rate-limit no
 * longer silently drops the one place email connects to a recommendation.
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isValidTallySignature(req)) {
    console.error('Rejected webhook request: missing or invalid Tally-Signature.');
    res.status(401).json({ error: 'Invalid signature.' });
    return;
  }

  // Tally sends the submission ID at payload.data.submissionId (varies slightly
  // by Tally's webhook version - check a real test payload and adjust if needed).
  const submissionId =
    (req.body && req.body.data && req.body.data.submissionId) || null;

  let answers;
  try {
    answers = parseTallyPayload(req.body);
  } catch (err) {
    console.error('Failed to parse Tally payload:', err);
    res.status(400).json({ error: 'Could not parse submission payload.' });
    return;
  }

  // Gift-fork submissions should never reach this function - Tally's own
  // conditional logic should route them to the gift card page instead of
  // submitting the full quiz. This is a safety check, not the primary handling.
  if (answers.weight === 'gift') {
    res.status(200).json({
      status: 'gift_fork',
      message: 'This submission is a gift-card path and was not routed.',
    });
    return;
  }

  let routedResult;
  try {
    routedResult = routeCushion(answers);
  } catch (err) {
    console.error('Routing failed:', err);
    res.status(500).json({ error: 'Could not determine a recommendation.' });
    return;
  }

  // Groq only runs when there's actually free text to respond to. An empty
  // box (or a Groq failure) still produces the complete, deterministic
  // message - the AI paragraph is additive, never load-bearing.
  let aiResult = null;
  if ((answers.freeText || '').trim()) {
    try {
      aiResult = await generateResultMessage(routedResult, answers);
    } catch (err) {
      console.error('Groq call failed (non-fatal, message composed without it):', err);
    }
  }

  const aiMessage = composeResultMessage(routedResult, answers, aiResult);
  const emailSummary = composeEmailSummary(routedResult, answers);

  // Non-fatal: log failures but don't block the response. Airtable/the results
  // page get the full aiMessage; Mailchimp gets the short emailSummary since
  // its merge field caps out around 255 characters (see composeMessage.js).
  try {
    await logSubmission(answers, routedResult, aiMessage, submissionId);
  } catch (err) {
    console.error('Airtable logging failed (non-fatal):', err);
  }

  try {
    if (answers.email) {
      await withRetries(() => pushToMailchimp(answers, routedResult, emailSummary));
    }
  } catch (err) {
    console.error('Mailchimp push failed after retries (non-fatal):', err);
  }

  res.status(200).json({
    status: 'ok',
    submissionId,
    result: routedResult,
    message: aiMessage,
  });
};
