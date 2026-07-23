/**
 * mailchimp.js
 * ------------
 * Adds/updates the quiz-taker in Mailchimp with the recommendation as merge
 * fields, tagged "quiz-results" so an existing Mailchimp automation (built
 * separately in the Mailchimp UI - see CYA_Fit_Quiz_System_Architecture.md §4)
 * can send the actual result email. This file does NOT send an email itself -
 * Mailchimp's automation, triggered by the tag, does that.
 *
 * Uses the "add or update member" endpoint (PUT with the MD5 hash of the
 * lowercased email as the resource ID) - this is Mailchimp's standard idempotent
 * upsert pattern, so re-submitting the quiz with the same email won't create a
 * duplicate contact.
 *
 * IMPORTANT: Mailchimp's "tag added" automation trigger only fires on an actual
 * absent->present transition. A returning quiz-taker (or anyone re-submitting
 * with an email that already has the "quiz-results" tag from a previous
 * submission) would silently NOT retrigger the automation if the tag were only
 * ever set once via the upsert body - the merge fields would update, but no new
 * email would send. To guarantee every submission retriggers it, the tag is
 * explicitly removed then re-added as two follow-up calls after the upsert.
 */

const crypto = require('crypto');
const { getProductDisplayName } = require('./productLinks');

/**
 * @param {object} answers - normalized answers object (must include .email)
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {string} emailSummary - short plain-text teaser from
 *   composeMessage.js's composeEmailSummary() - NOT the full result message.
 *   Mailchimp's "text" type merge fields cap out around 255 characters (a
 *   hard platform limit), so the full HTML message would just get silently
 *   truncated mid-sentence. The "For More Support" links belong as static
 *   content in the Mailchimp email template itself, not this merge field.
 */
async function pushToMailchimp(answers, routedResult, emailSummary) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX; // e.g. "us4" - the suffix after the dash in your API key
  const listId = process.env.MAILCHIMP_AUDIENCE_ID;

  if (!apiKey || !serverPrefix || !listId) {
    throw new Error(
      'MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, and MAILCHIMP_AUDIENCE_ID must be set.'
    );
  }
  if (!answers.email) {
    throw new Error('pushToMailchimp called without an email address.');
  }

  const subscriberHash = crypto
    .createHash('md5')
    .update(answers.email.toLowerCase().trim())
    .digest('hex');

  const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`;

  // Mailchimp merge tags are capped at 10 characters and must already exist as
  // merge fields in the audience (Audience -> Settings -> Merge fields) before
  // this will work - see README "Mailchimp setup".
  const mergeFields = {
    FNAME: answers.firstName || '',
    PRODUCT: getProductDisplayName(routedResult.product),
    FIRMNESS: routedResult.firmness,
    SIZE: routedResult.size,
    THICKNS: routedResult.thickness, // Mailchimp merge tag max length is 10 chars
    AIMSG: emailSummary,
  };

  const body = {
    email_address: answers.email,
    status_if_new: 'subscribed', // only applies if this is a new contact
    merge_fields: mergeFields,
  };

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`, // Confirmed: Mailchimp v3 API accepts Bearer auth with the raw API key directly (Basic auth also works, but this is simpler)
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mailchimp API error (${response.status}): ${errText}`);
  }

  const result = await response.json();

  // Force a fresh "tag added" transition every time (see file header note) so
  // the automation fires even for a repeat submission with the same email.
  const tagsUrl = `${url}/tags`;
  await fetch(tagsUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ tags: [{ name: 'quiz-results', status: 'inactive' }] }),
  });
  const addTagResponse = await fetch(tagsUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ tags: [{ name: 'quiz-results', status: 'active' }] }),
  });
  if (!addTagResponse.ok) {
    const errText = await addTagResponse.text();
    throw new Error(`Mailchimp tag update error (${addTagResponse.status}): ${errText}`);
  }

  return result;
}

module.exports = { pushToMailchimp };
