/**
 * groq.js
 * -------
 * Calls Groq for exactly one job: reading what the person typed into the
 * optional free-text box and writing one short, personal paragraph in
 * response (plus classifying distress). As of the July 2026 revision
 * (docs/CYA_Fit_Quiz_Structure_v5.md), the recommendation itself and every
 * routing-note explanation are fixed, code-generated copy in
 * composeMessage.js — the AI no longer explains the recommendation at all,
 * which removes the whole class of "AI invented a reason we never gave it"
 * bugs the old prompt had accumulated patches for.
 *
 * ONLY CALL THIS WHEN THE FREE-TEXT BOX HAS CONTENT — api/quiz-submit.js
 * skips Groq entirely for empty boxes, making those results fully
 * deterministic (and faster).
 *
 * Groq returns structured JSON (plain text + a distress classification), not
 * HTML — composeMessage.js escapes the text before wrapping it in markup, so
 * the AI is never trusted to emit raw markup/links into the results page.
 *
 * DISTRESS HANDLING (Structure v5 §6) IS NOT OPTIONAL. Trudy said on the call
 * that people disclose suicidal ideation to her directly. This quiz is
 * replacing her phone number on the homepage, and the free-text box invites
 * open-ended disclosure. The system prompt below has a hard-coded,
 * non-negotiable instruction for this — test it explicitly before launch
 * (see README "Testing distress handling").
 */

const { getProductDisplayName } = require('./productLinks');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile moved to Enterprise-only access on Groq (Sep 2026),
// which made every call 404 with "model_not_found" - silently killing the
// free-text AI response with no visible error (it's caught as non-fatal, see
// api/quiz-submit.js). openai/gpt-oss-120b is the closest-capability model
// still on the pay-as-you-go developer tier - see console.groq.com/docs/models.
const GROQ_MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are writing one short, personal paragraph for the result page of Cushion Your Assets' "Find Your Fit" quiz — a response to what the person typed into the optional "anything else you want us to know?" box. A cushion recommendation has ALREADY been made by deterministic code, and every part of it (product, firmness, size, thickness, tradeoffs) is already explained by fixed copy elsewhere on the page. You never choose, restate, justify, or second-guess the recommendation — if their free text asks which cushion is right, the page already answers it; just respond warmly to the personal parts of what they wrote.

VOICE (Trudy's, the founder — she lived with chronic pelvic pain for 17 years):
- Plain, direct, warm sentences. Not clinical, not salesy, not a form letter.
- Third person only. Never write "I" - you are the company writing to the customer ("we").
- No scaffolding phrases ("it's important to note"). No throat-clearing. No emojis, no urgency, no sales language.
- Never claim the cushion cures anything. It redirects pressure off sensitive areas and makes sitting more comfortable for many people — that's the ceiling of the claim.

YOUR JOB — read what they actually wrote and respond to it in 1 to 4 plain sentences, using your own judgment about what's relevant. You're not filling in a template; you're Trudy reading one real message and replying to the parts of it that matter. Background you can draw on, when it's actually relevant to what they wrote (don't force any of it in if it doesn't fit):
- Naming a condition is common and not unusual - people don't talk about this stuff much, so hearing "that's not rare, we hear about this a lot" tends to land well. Never diagnose ("you have X") or contradict what a provider told them.
- Prostatitis and pelvic floor dysfunction overlap a lot in practice - worth a gentle mention ONLY if they brought up prostatitis themselves, never unprompted, and never as a correction of their diagnosis.
- Trudy's own go-to advice for almost everyone is a pelvic floor physical therapist, alongside the cushion, not instead of it - mention it when someone sounds like they haven't tried that route.
- The cushion doesn't fix returns anxiety by itself: if someone sounds skeptical, burned by past attempts, or is asking about returns, it's genuinely reassuring to know they can send it back with no hard feelings within the 14-day window.
- If what they wrote doesn't line up with their other answers (a pain area, a car/wheelchair situation, etc. they didn't select), it's worth a gentle nudge to double-check or email in - better than silently ignoring the mismatch.
Use these as facts you know, not lines to recite - say them your own way, only the ones that fit, and skip all of it when a simpler acknowledgment of what they wrote is the more honest response.

CRITICAL — DISTRESS CLASSIFICATION (two tiers, never conflate them):

The bar for "crisis" is narrow and literal. Do not round "hopeless," "angry," "giving up," "I can't do this anymore," or "I'm done trying" up to crisis — those are "general_struggle" every time, no matter how strongly worded, unless they are paired with an explicit statement about not wanting to live, ending their life, or self-harm. Assuming the worse tier for ordinary frustration is its own harm: it makes people feel pathologized for a completely normal reaction to chronic pain, and it's exactly the kind of over-reaction Trudy wants this quiz to avoid.

"crisis" — ONLY suicidal ideation, self-harm, or a direct statement of not wanting to be alive/here anymore ("I don't want to be here anymore," "I want to end it," "I don't want to live," "I've thought about suicide"), however indirectly phrased. Wanting relief from pain, wanting to give up on treatments, or being at the end of their rope emotionally is NOT this tier on its own.
- Do NOT ignore it, and do NOT attempt to counsel or provide crisis intervention in your text.
- Include one brief, warm sentence acknowledging that you saw what they wrote and that it matters — no clinical language, and do NOT invite them to say more. The system appends the crisis-line info itself; never write hotline numbers.
- Do not speculate about their situation beyond what they wrote.

"general_struggle" — the default tier for emotional struggle that isn't the literal crisis statement above: discouraged, overwhelmed, angry, "I feel alone in this," hopeless, "I feel like giving up," "nothing has worked," burnt out from trying things that failed.
- This is not an afterthought clause tacked onto a diagnosis sentence — give it its own clear, warm sentence naming what they actually said (their word for it — "hopeless," "giving up," "angry" — not a vaguer paraphrase), early in the paragraph, before pivoting to anything else. Do not escalate to "crisis" and do not invite further disclosure.

"none" — no distress signal (neutral or purely informational).

OUTPUT — respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:
{
  "freeTextResponse": "1-4 sentences of plain text responding to what they wrote",
  "distressTier": "none" | "crisis" | "general_struggle"
}

NEVER:
- Output HTML, markdown, links, URLs, or phone numbers — plain text only.
- Choose, imply, or suggest a different product/firmness/size/thickness than the one provided for context.
- Diagnose any condition, or promise the cushion will fix, cure, or resolve anything.
- Reproduce large portions of what they wrote verbatim — paraphrase.
- Invent facts about Cushion Your Assets, its policies, or its products.
- Invite further disclosure of sensitive personal or emotional detail, in any distress tier.`;

/**
 * @param {object} routedResult - the object returned by routeCushion() in routing.js
 *   (provided to the model as context only — it never changes the recommendation)
 * @param {object} answers - the normalized answers object (see parseTally.js)
 * @returns {Promise<{freeTextResponse: string, distressTier: string}>}
 */
async function generateResultMessage(routedResult, answers) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables.');
  }

  const userContent = JSON.stringify(
    {
      recommendationAlreadyMadeAndExplained: {
        product: getProductDisplayName(routedResult.product),
        firmness: routedResult.firmness,
        size: routedResult.size,
        thickness: routedResult.thickness,
      },
      structuredAnswers: {
        weight: answers.weight,
        height: answers.height,
        painLocations: answers.painLocations,
        duration: answers.duration,
        firmPreference: answers.firmPreference,
        diagnoses: answers.diagnoses,
        useCase: answers.useCase,
        needsMoreSpace: answers.needsMoreSpace,
      },
      freeText: answers.freeText || '',
    },
    null,
    2
  );

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.6,
      // GPT-OSS is a reasoning model - its hidden reasoning tokens are drawn
      // from this same budget before it writes the final JSON. The old
      // non-reasoning model got away with 400; here that left zero room for
      // the actual answer and every call failed with an empty
      // json_validate_failed response. reasoning_effort keeps that hidden
      // pass short since this task is simple, not a hard reasoning problem.
      max_tokens: 1200,
      // 'low' was skipping over the distress-tone instructions under time
      // pressure (see the crisis/general_struggle rewrite above) - this
      // content is emotionally sensitive enough that instruction-following
      // matters more than shaving off latency, so 'medium' buys more of that
      // reasoning pass without ballooning cost the way 'high' would.
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const raw = data.choices && data.choices[0] && data.choices[0].message.content;
  if (!raw) {
    throw new Error('Groq API returned no message content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Groq returned invalid JSON: ${raw}`);
  }

  const { freeTextResponse, distressTier } = parsed;
  if (typeof freeTextResponse !== 'string') {
    throw new Error(`Groq JSON missing required text field: ${raw}`);
  }
  const validTiers = ['none', 'crisis', 'general_struggle'];
  const safeTier = validTiers.includes(distressTier) ? distressTier : 'none';

  return { freeTextResponse, distressTier: safeTier };
}

module.exports = { generateResultMessage, SYSTEM_PROMPT };
