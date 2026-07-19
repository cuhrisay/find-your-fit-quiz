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
 */

const crypto = require('crypto');

/**
 * @param {object} answers - normalized answers object (must include .email)
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {string} aiMessage - the Groq-generated result message
 */
async function pushToMailchimp(answers, routedResult, aiMessage) {
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
    PRODUCT: routedResult.product,
    FIRMNESS: routedResult.firmness,
    SIZE: routedResult.size,
    THICKNS: routedResult.thickness, // Mailchimp merge tag max length is 10 chars
    AIMSG: aiMessage.slice(0, 5000), // Mailchimp text merge field max ~10,000 chars; keeping headroom
  };

  const body = {
    email_address: answers.email,
    status_if_new: 'subscribed', // only applies if this is a new contact
    merge_fields: mergeFields,
    tags: ['quiz-results'],
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`, // Confirmed: Mailchimp v3 API accepts Bearer auth with the raw API key directly (Basic auth also works, but this is simpler)
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mailchimp API error (${response.status}): ${errText}`);
  }

  return response.json();
}

module.exports = { pushToMailchimp };
