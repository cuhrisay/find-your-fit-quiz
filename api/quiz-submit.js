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
 *   5. Log everything to Airtable (airtable.js) - the permanent, privacy-safe
 *      data log described in Structure v5 §5.
 *   6. Write the finished result to resultCache.js (Vercel KV) - the fast,
 *      short-lived store api/quiz-result.js actually polls. Kept separate
 *      from Airtable so results.html's 1.5s polling loop doesn't burn
 *      Airtable's metered API calls (see resultCache.js for why).
 *
 * No email is collected or sent from here (August 2026 - see README "Privacy
 * design"). The quiz no longer asks for it at all; results.html offers an
 * optional "email me my results + 10% off" step AFTER the result is shown,
 * handled entirely by api/quiz-capture-email.js.
 *
 * Steps 3, 5, and 6 are logged-but-non-fatal: if Groq, Airtable, or the
 * result cache fail, the person still gets their result in this same
 * response (the composed message just won't include the free-text response
 * paragraph if Groq failed). The one thing that MUST succeed for a usable
 * response is routing. If step 6 fails, results.html's poll will time out
 * even though this response carries the result fine - that only matters for
 * people who reload the results page before the cache write lands.
 */

const crypto = require('crypto');
const { parseTallyPayload } = require('../lib/parseTally');
const { routeCushion } = require('../lib/routing');
const { generateResultMessage } = require('../lib/groq');
const { composeResultMessage, composeEmailSummary } = require('../lib/composeMessage');
const { logSubmission } = require('../lib/airtable');
const { setResult } = require('../lib/resultCache');
const { getOrderLink, getProductDisplayName } = require('../lib/productLinks');

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

  // Non-fatal: log failures but don't block the response. emailSummary is
  // stored now (not sent anywhere yet) so api/quiz-capture-email.js can hand
  // it to Mailchimp later without re-deriving it from the raw answers.
  try {
    await logSubmission(answers, routedResult, aiMessage, emailSummary, submissionId);
  } catch (err) {
    console.error('Airtable logging failed (non-fatal):', err);
  }

  if (submissionId) {
    const orderLink = getOrderLink(routedResult.product);
    try {
      await setResult(submissionId, {
        product: getProductDisplayName(routedResult.product),
        firmness: routedResult.firmness,
        size: routedResult.size,
        thickness: routedResult.thickness,
        secondCushion: routedResult.secondCushion || null,
        orderUrl: orderLink.url,
        orderLabel: orderLink.label,
        message: aiMessage,
      });
    } catch (err) {
      console.error('Result cache write failed (non-fatal):', err);
    }
  }

  res.status(200).json({
    status: 'ok',
    submissionId,
    result: routedResult,
    message: aiMessage,
  });
};
