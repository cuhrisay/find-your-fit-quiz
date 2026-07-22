/**
 * api/quiz-submit.js
 * -------------------
 * POST endpoint. Tally's webhook (Integrations -> Webhooks) points here.
 *
 * Flow per submission:
 *   1. Parse the raw Tally payload into normalized answers.
 *   2. Run the deterministic routing table (routing.js) -> product/firmness/etc.
 *   3. Call Groq to write the human-facing explanation (groq.js).
 *   4. Log everything to Airtable (airtable.js) - this doubles as the short-term
 *      "result lookup" store that api/quiz-result.js polls, AND the permanent
 *      data log described in Structure v4 §6.
 *   5. Push the result to Mailchimp (mailchimp.js) so the existing automation
 *      sends the email copy.
 *
 * Steps 4 and 5 are logged-but-non-fatal: if Airtable or Mailchimp fail, the
 * person still gets their result (this function still returns 200 and the
 * routed+AI-written result), but the failure is logged to Vercel's function logs
 * for Chrisie to notice. The one thing that MUST succeed for a usable response is
 * routing + Groq.
 */

const { parseTallyPayload } = require('../lib/parseTally');
const { routeCushion } = require('../lib/routing');
const { generateResultMessage } = require('../lib/groq');
const { logSubmission } = require('../lib/airtable');
const { pushToMailchimp } = require('../lib/mailchimp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // TEMPORARY - remove once the "Something else" diagnoses elaboration field's
  // key is captured and added to parseTally.js.
  console.log('RAW TALLY PAYLOAD:', JSON.stringify(req.body, null, 2));

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

  let aiMessage;
  try {
    aiMessage = await generateResultMessage(routedResult, answers);
  } catch (err) {
    // Groq failing shouldn't mean the person gets nothing - fall back to a
    // plain, honest message built from the fixed always-include copy so the
    // page still shows something useful.
    console.error('Groq call failed, using fallback message:', err);
    aiMessage =
      `Based on what you told us, we'd recommend the ${routedResult.product}, ` +
      `${routedResult.firmness} firmness, ${routedResult.size}, ${routedResult.thickness}. ` +
      `${routedResult.alwaysInclude.breakIn} ${routedResult.alwaysInclude.returnPolicy} ` +
      `If you'd like to talk it through, reach out any time.`;
  }

  // Non-fatal: log failures but don't block the response.
  try {
    await logSubmission(answers, routedResult, aiMessage, submissionId);
  } catch (err) {
    console.error('Airtable logging failed (non-fatal):', err);
  }

  try {
    if (answers.email) {
      await pushToMailchimp(answers, routedResult, aiMessage);
    }
  } catch (err) {
    console.error('Mailchimp push failed (non-fatal):', err);
  }

  res.status(200).json({
    status: 'ok',
    submissionId,
    result: routedResult,
    message: aiMessage,
  });
};
