/**
 * airtable.js
 * -----------
 * Logs every quiz submission to Airtable's "Submissions" table (see
 * CYA_Fit_Quiz_System_Architecture.md §3 for the base structure).
 *
 * Uses the raw Airtable REST API directly rather than an SDK, to keep this
 * function's cold-start time low and avoid an extra dependency.
 *
 * PRIVACY (August 2026): this table intentionally never receives email or name.
 * Identity lives only in Mailchimp, keyed by email; this table is keyed only by
 * the opaque Tally submission ID, so a breach or export of either system alone
 * can't connect someone's identity to their health/diagnosis answers.
 */

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

/**
 * @param {object} answers - normalized answers object (see parseTally.js)
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {string} aiMessage - the full composed result message (shown on the results page)
 * @param {string} emailSummary - the short (~240 char) teaser, stored now so
 *   api/quiz-capture-email.js can hand it to Mailchimp later without ever
 *   needing to re-parse the raw answers back out of Airtable
 * @param {string|null} submissionId - Tally's submission ID, used by
 *   api/quiz-result.js and api/quiz-capture-email.js to look this record back up
 * @returns {Promise<object>} the created Airtable record
 */
async function logSubmission(answers, routedResult, aiMessage, emailSummary, submissionId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_SUBMISSIONS_TABLE || 'Submissions';

  if (!apiKey || !baseId) {
    throw new Error(
      'AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set in environment variables.'
    );
  }

  // Airtable multi-select / linked fields want arrays; long text fields want
  // strings. Arrays get joined for fields Airtable treats as plain text, since
  // building actual Airtable "multiple select" field option lists ahead of time
  // is a manual setup step in the Airtable UI (see README "Airtable setup").
  const fields = {
    'Tally Submission ID': submissionId || '',
    Timestamp: new Date().toISOString(),
    Weight: answers.weight,
    Height: answers.height,
    'Pain Locations': (answers.painLocations || []).join(', '),
    Duration: answers.duration,
    'Firm Preference': answers.firmPreference,
    Diagnoses: (answers.diagnoses || []).join(', '),
    'Use Case': (answers.useCase || []).join(', '),
    'Needs More Space': answers.needsMoreSpace,
    Sex: answers.sex,
    'Age Range': answers.ageRange,
    'Free Text': answers.freeText,
    'Routed Product': routedResult.product,
    'Routed Firmness': routedResult.firmness,
    'Routed Size': routedResult.size,
    'Routed Thickness': routedResult.thickness,
    'Second Cushion': routedResult.secondCushion
      ? JSON.stringify(routedResult.secondCushion)
      : '',
    'AI Message': aiMessage,
    'Email Summary': emailSummary || '',
    'Consent Given': answers.consentGiven ? 'yes' : 'no',
  };

  const response = await fetch(
    `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    // Logging failure should NOT block the user from getting their result -
    // the caller (api/quiz-submit.js) catches and logs this rather than
    // throwing it back to the user-facing response.
    throw new Error(`Airtable API error (${response.status}): ${errText}`);
  }

  return response.json();
}

/**
 * Looks up a previously logged submission by Tally's submission ID. Used by
 * api/quiz-result.js so the results page can poll for the finished
 * recommendation after the Tally webhook has had time to process it.
 * @param {string} submissionId
 * @returns {Promise<object|null>} the matching record's fields, or null if not found yet
 */
async function findSubmissionById(submissionId) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_SUBMISSIONS_TABLE || 'Submissions';

  if (!apiKey || !baseId) {
    throw new Error(
      'AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set in environment variables.'
    );
  }

  const formula = encodeURIComponent(`{Tally Submission ID} = "${submissionId}"`);
  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(
    tableName
  )}?filterByFormula=${formula}&maxRecords=1`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Airtable lookup error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.records || data.records.length === 0) return null;
  return data.records[0].fields;
}

module.exports = { logSubmission, findSubmissionById };
