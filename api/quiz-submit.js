/**
 * api/quiz-submit.js
 * -------------------
 * POST endpoint. Tally's webhook (Integrations -> Webhooks) points here.
 *
 * Flow per submission:
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
 *      sends the email copy.
 *
 * Steps 3, 5, and 6 are logged-but-non-fatal: if Groq, Airtable, or Mailchimp
 * fail, the person still gets their result (the composed message just won't
 * include the free-text response paragraph if Groq failed). The one thing that
 * MUST succeed for a usable response is routing.
 */

const { parseTallyPayload } = require('../lib/parseTally');
const { routeCushion } = require('../lib/routing');
const { generateResultMessage } = require('../lib/groq');
const { composeResultMessage, composeEmailSummary } = require('../lib/composeMessage');
const { logSubmission } = require('../lib/airtable');
const { pushToMailchimp } = require('../lib/mailchimp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
      await pushToMailchimp(answers, routedResult, emailSummary);
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
