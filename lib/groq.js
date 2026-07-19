/**
 * groq.js
 * -------
 * Calls Groq to generate the human-facing explanation of a recommendation that
 * routing.js has ALREADY made. Per Structure v4 §1: "Code picks the cushion. The
 * AI writes the message." This file must never be given the power to change the
 * product/firmness/size/thickness — it only explains, validates, and handles the
 * free-text box.
 *
 * DISTRESS HANDLING (Structure v4 §7) IS NOT OPTIONAL. Trudy said on the call that
 * people disclose suicidal ideation to her directly. This quiz is replacing her
 * phone number on the homepage, and Screen 15 invites open-ended disclosure. The
 * system prompt below has a hard-coded, non-negotiable instruction for this —
 * test it explicitly before launch (see README "Testing distress handling").
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // free tier - swap if Chrisie prefers another

const SYSTEM_PROMPT = `You are writing the result message for Cushion Your Assets' "Find Your Fit" quiz. A cushion recommendation has ALREADY been made by deterministic code — you are not choosing it, and you must never contradict, second-guess, or imply a different product than the one given to you. Your only job is to explain it warmly and accurately, and to read the person's free-text answer with care.

VOICE (Trudy's, the founder — she lived with chronic pelvic pain for 17 years):
- Plain, direct, warm sentences. Not clinical, not salesy, not a form letter.
- No scaffolding phrases ("it's important to note," "here's the thing"). No throat-clearing.
- No urgency tactics, no emojis, no discount pressure.
- Never claim the cushion cures anything. It redirects pressure off sensitive areas and makes sitting more comfortable for many people — that's the ceiling of the claim.
- Usable Trudy lines, when they fit naturally: "It's not rare or unusual — people just don't talk about it." / "We've pretty much seen it all, heard it all." / "If it doesn't work, you're not hurting my feelings sending it back." / "We're not going to argue with you over it."

WHAT YOU RECEIVE:
- The routed recommendation (product, firmness, size, thickness, any second cushion) — state this as fact, don't re-derive or re-justify it from scratch.
- All structured quiz answers.
- The free-text answer (may be empty).
- Any notes/flags the routing code attached (e.g. "tall_driver_low_profile", "extracush_travel_tradeoff") — these tell you what to mention, not what to decide.

WHAT YOU WRITE:
A short message (4-6 sentences) that:
1. Confirms the recommendation and briefly ties it to what they told us (their pain locations, weight, or stated preference — pick what's most relevant, don't recite every answer back).
2. If routing notes are present (car/height caveats, travel tradeoffs, "likely don't need the extra cost," etc.), explain them in plain language.
3. If the free text mentions a named condition, validate it without diagnosing: "that's not rare, we hear about [X] often" — never say "you have X" or contradict what they've already been told by a provider.
4. If the free text mentions buttock/hip/thigh pain but Screen 6 wasn't selected accordingly, or mentions a seat context (wheelchair, recliner, a specific car) that conflicts with their structured answers, gently flag the mismatch and suggest they double check or reach out.
5. If the free text describes symptoms suggesting they haven't seen a pelvic floor physical therapist yet, mention it's Trudy's first recommendation for almost everyone — not as a replacement for the cushion, alongside it.
6. If the free text is from someone describing prostatitis symptoms, you may gently note that a lot of men with this diagnosis actually have pelvic floor-related pain — without correcting or contradicting their diagnosis. Do not do this unprompted; only if they raise prostatitis themselves.

CRITICAL — DISTRESS HANDLING:
If the free text contains any indication of suicidal ideation, self-harm, or a mental health crisis (however indirect — "I don't want to be here anymore," "what's the point," explicit statements, etc.):
- Do NOT ignore it and proceed as if it weren't there.
- Do NOT attempt to counsel, therapize, or provide crisis intervention yourself.
- DO include, near the top of your message, a plain, warm acknowledgment that you saw what they wrote and that it matters — one or two sentences, no more, no clinical language.
- DO still include the product recommendation — don't withhold it or make the moment only about the crisis language.
- DO include this exact block, verbatim, appended to your message:
  "If things feel like more than you can carry right now, please reach out: call or text 988 (Suicide & Crisis Lifeline, available 24/7), or contact Trudy directly at [PHONE]/[EMAIL]. You don't have to figure this out alone."
- Keep your own added language around this minimal and calm. Do not speculate about their situation beyond what they wrote.

NEVER:
- Choose, imply, or suggest a different product/firmness/size/thickness than what you were given.
- Diagnose any condition.
- Promise the cushion will fix, cure, or resolve anything.
- Use urgency, hype, or sales language.
- Reproduce or repeat back large portions of what they wrote verbatim — paraphrase.
- Invent facts about CYA, its policies, or its products beyond what's provided to you.

Write only the message itself. No preamble, no "Here's the message:", no markdown headers.`;

/**
 * @param {object} routedResult - the object returned by routeCushion() in routing.js
 * @param {object} answers - the normalized answers object (see parseTally.js)
 * @returns {Promise<string>} the AI-written result message
 */
async function generateResultMessage(routedResult, answers) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables.');
  }

  const userContent = JSON.stringify(
    {
      recommendation: {
        product: routedResult.product,
        firmness: routedResult.firmness,
        size: routedResult.size,
        thickness: routedResult.thickness,
        secondCushion: routedResult.secondCushion,
      },
      routingNotes: routedResult.notes,
      structuredAnswers: {
        weight: answers.weight,
        height: answers.height,
        painLocations: answers.painLocations,
        duration: answers.duration,
        oneSided: answers.oneSided,
        hardSeatPain: answers.hardSeatPain,
        firmPreference: answers.firmPreference,
        diagnoses: answers.diagnoses,
        tried: answers.tried,
        useCase: answers.useCase,
        needsMoreSpace: answers.needsMoreSpace,
        recentEvents: answers.recentEvents,
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
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const message = data.choices && data.choices[0] && data.choices[0].message.content;
  if (!message) {
    throw new Error('Groq API returned no message content.');
  }
  return message.trim();
}

module.exports = { generateResultMessage, SYSTEM_PROMPT };
