/**
 * resultCache.js
 * --------------
 * Short-lived store for the "is it ready yet?" handshake between
 * api/quiz-submit.js (writes once, on the Tally webhook) and
 * api/quiz-result.js (reads repeatedly, polled by results.html every 1.5s).
 *
 * This used to be Airtable's job too, but that meant every poll from every
 * results.html tab burned an Airtable API call - Airtable now meters those
 * per month, and a single person's results page alone could cost 5-20 calls
 * before the result was ready. Airtable stays the permanent, privacy-safe
 * record (see airtable.js); this is purely the fast, disposable cache that
 * make the polling itself cheap. Backed by Vercel KV (Upstash Redis) - see
 * README "Setup checklist" for the one-time dashboard step to provision it.
 *
 * TTL is intentionally short: nobody needs their result cached past the
 * couple of minutes it takes to view the page and optionally submit the
 * email-capture form (which reads the permanent Airtable record instead,
 * not this cache - see quiz-capture-email.js).
 */

const { kv } = require('@vercel/kv');

const TTL_SECONDS = 10 * 60;

function cacheKey(submissionId) {
  return `quiz-result:${submissionId}`;
}

/**
 * @param {string} submissionId
 * @param {object} resultPayload - the exact shape api/quiz-result.js should
 *   hand back to results.html once ready (see its `result` field).
 */
async function setResult(submissionId, resultPayload) {
  await kv.set(cacheKey(submissionId), resultPayload, { ex: TTL_SECONDS });
}

/**
 * @param {string} submissionId
 * @returns {Promise<object|null>} the cached result payload, or null if not
 *   ready yet (or the TTL has expired).
 */
async function getResult(submissionId) {
  const value = await kv.get(cacheKey(submissionId));
  return value || null;
}

module.exports = { setResult, getResult };
