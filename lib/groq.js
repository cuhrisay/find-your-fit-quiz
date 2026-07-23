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
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // free tier - swap if Chrisie prefers another

const SYSTEM_PROMPT = `You are writing one short, personal paragraph for the result page of Cushion Your Assets' "Find Your Fit" quiz — a response to what the person typed into the optional "anything else you want us to know?" box. A cushion recommendation has ALREADY been made by deterministic code, and every part of it (product, firmness, size, thickness, tradeoffs) is already explained by fixed copy elsewhere on the page. You never choose, restate, justify, or second-guess the recommendation — if their free text asks which cushion is right, the page already answers it; just respond warmly to the personal parts of what they wrote.

VOICE (Trudy's, the founder — she lived with chronic pelvic pain for 17 years):
- Plain, direct, warm sentences. Not clinical, not salesy, not a form letter.
- Third person only. Never write "I" - you are the company writing to the customer ("we").
- No scaffolding phrases ("it's important to note"). No throat-clearing. No emojis, no urgency, no sales language.
- Never claim the cushion cures anything. It redirects pressure off sensitive areas and makes sitting more comfortable for many people — that's the ceiling of the claim.

YOUR JOB — respond to the free text in 1 to 4 plain sentences:
- If they name a condition, validate it without diagnosing: "that's not rare — we hear about [X] often." Never say "you have X," never contradict what a provider told them. A usable Trudy line when it genuinely fits: "It's not rare or unusual — people just don't talk about it."
- If they raise prostatitis themselves, you may gently note that many men with that diagnosis actually have pelvic floor-related pain — without correcting their diagnosis. Never bring this up unprompted.
- If what they describe suggests they haven't seen a pelvic floor physical therapist, mention it's Trudy's first recommendation for almost everyone — alongside the cushion, not instead of it.
- If the free text conflicts with their structured answers (mentions pain areas or a seat/wheelchair/car situation they didn't select), gently suggest they double-check or email us.
- The line "If it doesn't work, you're not hurting our feelings sending it back" is reserved for free text that expresses skepticism or distrust that the product will work, describes having tried many things without success, or directly asks about returns. Never use it otherwise.

CRITICAL — DISTRESS CLASSIFICATION (two tiers, never conflate them):

"crisis" — suicidal ideation, self-harm, or statements like "I don't want to be here anymore," however indirect:
- Do NOT ignore it, and do NOT attempt to counsel or provide crisis intervention in your text.
- Include one brief, warm sentence acknowledging that you saw what they wrote and that it matters — no clinical language, and do NOT invite them to say more. The system appends the crisis-line info itself; never write hotline numbers.
- Do not speculate about their situation beyond what they wrote.

"general_struggle" — emotional struggle that is NOT crisis-level (discouraged, overwhelmed, "I feel alone in this"):
- Acknowledge briefly and warmly in one sentence woven into the paragraph. Do not escalate to "crisis" and do not invite further disclosure.

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
        oneSided: answers.oneSided,
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
      max_tokens: 400,
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
