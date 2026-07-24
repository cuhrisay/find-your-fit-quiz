/**
 * composeMessage.js
 * ------------------
 * Builds the final HTML result message. As of the July 2026 revision
 * (docs/CYA_Fit_Quiz_Structure_v5.md), EVERYTHING about the recommendation is
 * explained by fixed, code-generated copy in this file — the "why" paragraph
 * and every routing-note explanation are templates keyed off routing.js's
 * output, so the reasoning shown to the customer is guaranteed to match what
 * the routing actually did. The AI (groq.js) contributes exactly one optional
 * paragraph: a response to whatever the person typed in the free-text box
 * (plus the distress classification). When the box is empty, Groq isn't
 * called at all and the whole message is deterministic.
 *
 * This is the only place that ever emits HTML for the result message — the
 * AI's text is always HTML-escaped before being wrapped in markup, since
 * freeText is user-submitted and flows into Groq's context. The "For More
 * Support" section and the crisis-line block are fixed content, never left to
 * the AI to reproduce.
 */

const { getProductDisplayName } = require('./productLinks');

const NAVIGATING_PELVIC_PAIN_GUIDE_URL =
  'https://static1.squarespace.com/static/68e81b678021d5189cf1f247/t/6a361a6ff2db6d6cf2c9d08a/1781930607084/Navigating+Pelvic+Pain+Guide.pdf';
const BLOG_URL = 'https://cushionyourassets.com/blog';
const PROVIDER_DIRECTORY_URL = 'https://cushionyourassets.com/provider-directory';
const SUPPORT_EMAIL = 'support@cushionyourassets.com';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CRISIS_BLOCK =
  '<p><strong>If things feel like more than you can carry right now,</strong> ' +
  "please reach out: call or text 988 (Suicide &amp; Crisis Lifeline, available " +
  "24/7). You don't have to figure this out alone.</p>";

// Always appended, regardless of distress tier - every result ends the same way.
const MORE_SUPPORT_BLOCK =
  '<h3>For More Support</h3>\n' +
  '<p>We know how confusing, exhausting, and lonely recovery can be. ' +
  "That's why we created these free resources for you:</p>\n" +
  '<ul>\n' +
  `<li>Download the <a href="${NAVIGATING_PELVIC_PAIN_GUIDE_URL}">Navigating Pelvic Pain Guide</a>. ` +
  'It explains what\'s actually happening in your body and how to find the right care.</li>\n' +
  `<li>Explore the <a href="${BLOG_URL}">Pelvic Pain Answers Blog</a> for insider tips and ` +
  'stories of hope and healing.</li>\n' +
  `<li>Search through our exclusive <a href="${PROVIDER_DIRECTORY_URL}">Provider Directory</a> ` +
  'with over 250 pelvic pain specialists.</li>\n' +
  '</ul>\n' +
  '<p>Still have questions? Email us at ' +
  `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;

// ---------------------------------------------------------------------------
// "Why We Recommend" — one confident, deterministic paragraph
// ---------------------------------------------------------------------------

/**
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {object} answers - normalized answers (see parseTally.js) - used to
 *   name the person's actual pain location(s) instead of speaking in the
 *   abstract. Without this, a submission that doesn't trigger any thickness/
 *   size routing note (no travel, no hard-seat pain, no 18", not Soother -
 *   i.e. a "plain" result, which is most submissions) got a fully generic
 *   paragraph with zero reference to what they actually told us - the "why
 *   didn't any details come through" bug.
 * @returns {string} plain text (escaped by the caller)
 */
function composeWhyText(routedResult, answers) {
  const pain = painPhrase(answers || {});
  if (routedResult.product === 'Simple Soother') {
    if (routedResult.notes.product === 'temporary') {
      return (
        `Because your ${pain} started recently and may well be temporary, we ` +
        "recommend starting with the Simple Soother — our lower-cost cushion — " +
        'rather than spending more than you may need.'
      );
    }
    return (
      `Because your ${pain} is centrally located rather than under your ` +
      'tailbone or sit bones, the Simple Soother is the right starting point — ' +
      'it costs less, and its center cutout is designed for exactly this kind of pain.'
    );
  }
  return (
    `Based on your ${pain} and how you'll be using it, the Twin Cheeks Folding ` +
    'Cushion is your fit — its two adjustable panels support you while the ' +
    'open center channel keeps pressure off exactly where it hurts.'
  );
}

// ---------------------------------------------------------------------------
// "For You Specifically" — fixed explanations for each routing note
// ---------------------------------------------------------------------------

/**
 * Every thickness/size note routing.js can emit, explained in Trudy's plain
 * register. If routing adds a note, add its sentence here — an unknown note is
 * simply not rendered (it will never be mis-explained, just silently skipped,
 * which is the safe failure).
 *
 * 'likely_dont_need_18' is deliberately absent: it exists for the data log
 * only and is never narrated to the customer.
 */
const NOTE_TEXT = {
  travel_low_profile:
    'You told us you travel often and need something compact, so we went with ' +
    'the Low Profile — it folds up smaller and carries easily, at the same ' +
    'firmness as our Regular thickness.',
  low_profile_soft_preference_tradeoff:
    "One tradeoff to know about: the Low Profile is compact, but it won't feel " +
    "as soft and cushy as you said you'd like. If softness matters more to you " +
    'than packing small, the Regular thickness also folds for travel — it just ' +
    "isn't quite as compact.",
  low_profile_unavailable_at_band:
    'You mentioned wanting something compact, but at your support level a ' +
    "thinner cushion would compress too quickly to hold you up — so we've kept " +
    'you on the Regular thickness. It still folds for travel and driving, just ' +
    'not as small.',
  low_profile_unavailable_18in:
    'You mentioned wanting something compact, but the 18" only comes in our ' +
    "Regular or Extra Cush thickness — it's built to stay in one place, not " +
    "travel with you. We've kept you on Regular; it still folds for the road, " +
    'just not as small as our thinnest option.',
  extra_cush_primary:
    'Because hard seats bother your buttocks, hips, or thighs and you prefer a ' +
    'softer feel, we recommend the Extra Cush: an extra inch of soft foam on ' +
    'top, with Extra Firm support underneath so you never bottom out.',
  extra_cush_travel_car_conflict:
    "One tradeoff to know about: the Extra Cush is taller and doesn't fold as " +
    "compactly, so it's not the easiest cushion for travel or a low car seat. " +
    "If you'll mostly use it in one place, it's the right call.",
  hardseatpain_over_travel_stayed_regular:
    'Since hard seats bother your buttocks, hips, or thighs, we kept you on ' +
    'the Regular thickness — support comes first. It still folds and travels, ' +
    'just not quite as small as our thinnest option.',
  tall_driver_low_profile:
    'At your height, the Low Profile keeps you from sitting up too tall in ' +
    'the car.',
  booster_cushion_note:
    'If you currently use a booster cushion in the car, you may be able to ' +
    'remove it — the cushion adds some height on its own.',
  confirm_18in_needed:
    'You told us you need more space when you sit, so we recommend the 18" — ' +
    "it's our larger, specialized size, so it's worth being sure before you " +
    'order.',
  wheelchair_recliner_wide_seat_check:
    'One thing to double-check: wheelchair and recliner seats often run wide. ' +
    'If yours does, the 18" size might actually fit your seat better — ' +
    "measure it if you're not sure, or email us and we'll help.",
};

// The car-specific addendum for low_profile_unavailable_at_band - only shown
// when driving is actually one of their use cases.
const UNAVAILABLE_AT_BAND_CAR_ADDENDUM =
  'If the Regular sits you a little high in the car, adjusting your seat down ' +
  'usually solves it.';

// Short, natural-reading labels for the diagnosis keys (Screen 7/8's
// checkbox options). 'something_else' and 'no_diagnosis' are deliberately
// absent - too vague/irrelevant to acknowledge specifically.
const DIAGNOSIS_LABELS = {
  coccydynia: 'coccydynia',
  pudendal_neuralgia: 'pudendal neuralgia',
  pelvic_floor_dysfunction: 'pelvic floor dysfunction',
  interstitial_cystitis: 'interstitial cystitis',
  prostatitis_cpps: 'prostatitis/CPPS',
  endometriosis: 'endometriosis',
  vulvodynia: 'vulvodynia',
  vaginismus: 'vaginismus',
  pelvic_girdle_pain: 'pelvic girdle pain',
};

/**
 * A short, deterministic acknowledgment of whatever diagnosis/condition they
 * named (Structure v5 - Trudy's "that's not rare, we hear about it often"
 * validation, one of the quiz's original stated goals). Previously this only
 * ever happened via Groq, which only runs when the free-text box has
 * content - someone who answers every structured question carefully but
 * skips the optional free text got NO acknowledgment of their diagnosis at
 * all, which is why "plain" results (no travel/hard-seat/18"/Soother
 * modifier either) could read as fully generic even with a diagnosis
 * selected. This restores it unconditionally, independent of free text or
 * routing notes.
 * @param {object} answers
 * @returns {string|null}
 */
function diagnosisAcknowledgment(answers) {
  const diagnoses = (answers && answers.diagnoses) || [];
  if (diagnoses.includes('recovering_surgery_childbirth')) {
    return (
      "You mentioned you're recovering from surgery or childbirth — we hope " +
      'that recovery continues to go smoothly, and having the right support ' +
      'now can make a real difference.'
    );
  }
  const labels = diagnoses.map((d) => DIAGNOSIS_LABELS[d]).filter(Boolean).slice(0, 2);
  if (labels.length === 0) return null;
  return (
    `You mentioned dealing with ${labels.join(' and ')} — that's not as rare ` +
    "as it feels, and we hear about it often."
  );
}

/**
 * Gathers every fixed explanation paragraph that applies to this result, in a
 * stable, sensible order. Returns plain-text strings (escaped by the caller).
 * @param {object} routedResult
 * @param {object} answers - normalized answers (see parseTally.js)
 * @returns {string[]}
 */
function composeSpecificsTexts(routedResult, answers) {
  const texts = [];
  const useCase = (answers && answers.useCase) || [];

  // Diagnosis acknowledgment goes first - validate the person before any
  // product-specific tradeoff notes.
  const diagnosisNote = diagnosisAcknowledgment(answers);
  if (diagnosisNote) texts.push(diagnosisNote);

  for (const note of routedResult.notes.thickness || []) {
    let text = NOTE_TEXT[note];
    if (!text) continue;
    if (note === 'low_profile_unavailable_at_band' && useCase.includes('car_truck')) {
      text += ' ' + UNAVAILABLE_AT_BAND_CAR_ADDENDUM;
    }
    texts.push(text);
  }

  for (const note of routedResult.notes.size || []) {
    if (NOTE_TEXT[note]) texts.push(NOTE_TEXT[note]);
  }

  // These arrive from routing.js as finished customer-facing sentences.
  if (routedResult.alwaysInclude.eighteenInchExplanation) {
    texts.push(routedResult.alwaysInclude.eighteenInchExplanation);
  }
  if (routedResult.notes.customNote) texts.push(routedResult.notes.customNote);
  if (routedResult.secondCushion && routedResult.secondCushion.note) {
    texts.push(routedResult.secondCushion.note);
  }
  if (routedResult.notes.soatherUpgradeLine) {
    texts.push(routedResult.notes.soatherUpgradeLine);
  }

  return texts;
}

/**
 * Break-in note + return policy, always shown, exactly once.
 * @param {object} routedResult
 * @returns {string} HTML
 */
function composePolicyBlock(routedResult) {
  return `<p>${escapeHtml(routedResult.alwaysInclude.breakIn)} ${escapeHtml(routedResult.alwaysInclude.returnPolicy)}</p>`;
}

/**
 * Builds the full HTML result message.
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {object} answers - normalized answers object
 * @param {{freeTextResponse: string, distressTier: string}|null} aiResult -
 *   Groq's response to the free-text box, or null when the box was empty or
 *   the Groq call failed (the message is complete without it).
 * @returns {string} final HTML message
 */
function composeResultMessage(routedResult, answers, aiResult) {
  const sections = [
    `<h3>Why We Recommend The ${escapeHtml(getProductDisplayName(routedResult.product))}</h3>`,
    `<p>${escapeHtml(composeWhyText(routedResult, answers))}</p>`,
  ];

  const specifics = composeSpecificsTexts(routedResult, answers);
  const aiParagraph =
    aiResult && aiResult.freeTextResponse && aiResult.freeTextResponse.trim()
      ? aiResult.freeTextResponse.trim()
      : null;

  if (specifics.length > 0 || aiParagraph) {
    sections.push('<h3>For You Specifically</h3>');
    for (const text of specifics) {
      sections.push(`<p>${escapeHtml(text)}</p>`);
    }
    if (aiParagraph) {
      sections.push(`<p>${escapeHtml(aiParagraph)}</p>`);
    }
  }

  if (aiResult && aiResult.distressTier === 'crisis') {
    sections.push(CRISIS_BLOCK);
  }

  if (routedResult.alwaysInclude.waitlistNote) {
    sections.push(`<p>${escapeHtml(routedResult.alwaysInclude.waitlistNote)}</p>`);
  }

  sections.push(composePolicyBlock(routedResult));
  sections.push(MORE_SUPPORT_BLOCK);
  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Email teaser (Mailchimp AIMSG merge field)
// ---------------------------------------------------------------------------

// Mailchimp's "text" type merge fields cap out around 255 characters (a hard
// platform limit) - nowhere near enough for the full formatted message above.
// AIMSG gets this short plain-text teaser instead; the full detail lives on
// the results page. No HTML here - every character costs budget in a field
// this small, and Mailchimp merge fields don't render markup as formatting
// anyway.
const EMAIL_SUMMARY_CHAR_LIMIT = 240;

function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/**
 * @param {object|null} secondCushion - routedResult.secondCushion
 * @returns {string} short suffix, or '' if there's nothing to suggest
 */
function composeAlsoConsiderSuffix(secondCushion) {
  if (!secondCushion || !secondCushion.suggestion) return '';
  const s = secondCushion.suggestion;
  const firmness = s.firmnessRange ? ` (${s.firmnessRange})` : '';
  // Extra Cush "also consider" isn't travel-motivated (it's suppressed
  // whenever travel/car use is present) - only the Low Profile suggestions are.
  const context = secondCushion.trigger === 'extra_cush_also_consider' ? 'for extra cushioning' : 'for travel';
  return ` Also consider: ${s.thickness}${firmness} ${context}.`;
}

// Short human-readable labels for the pain-location keys, used to make the
// email teaser specific to THEM instead of a generic "based on your answers."
const PAIN_LABELS = {
  tailbone: 'tailbone',
  sit_bones: 'sit bone',
  rectal: 'rectal',
  perineum: 'perineum',
  genital_vaginal: 'genital',
  bladder_urethra: 'bladder/urethra',
  prostate: 'prostate',
  hips: 'hip',
  buttocks: 'buttock',
  thighs_hamstrings: 'thigh',
  groin: 'groin',
};

/** @param {object} answers @returns {string} e.g. "tailbone and hip pain" */
function painPhrase(answers) {
  const labels = (answers.painLocations || [])
    .map((loc) => PAIN_LABELS[loc])
    .filter(Boolean)
    .slice(0, 2); // two at most - this has to fit in ~240 chars total
  if (labels.length === 0) return 'pain';
  return labels.join(' and ') + ' pain';
}

/**
 * The ONE thickness/size clause most worth the email's scarce characters, in
 * priority order. Everything else waits for the results page.
 * @param {object} routedResult
 * @returns {string} clause starting with " — ", or ''
 */
function emailDriverClause(routedResult) {
  const notes = routedResult.notes.thickness || [];
  if (notes.includes('extra_cush_primary')) {
    return ' — an extra inch of soft foam on top, Extra Firm support underneath so you never bottom out.';
  }
  if (notes.includes('hardseatpain_over_travel_stayed_regular')) {
    return ' — we kept the Regular 2" thickness so support comes first; it still folds for travel.';
  }
  if (notes.includes('travel_low_profile')) {
    return ' — Low Profile packs small for travel, same firmness as our Regular.';
  }
  if (notes.includes('tall_driver_low_profile')) {
    return " — Low Profile so you don't sit up too tall behind the wheel.";
  }
  if (notes.includes('low_profile_unavailable_18in')) {
    return ' — Regular 2" thickness, since the 18" doesn\'t come in Low Profile.';
  }
  if (notes.includes('low_profile_unavailable_at_band')) {
    return ' — Regular 2" thickness, since a thinner cushion wouldn\'t hold you up.';
  }
  if (routedResult.size === '18" (Larger Size)') {
    return ' — the 18" adds the extra thigh room you said you need.';
  }
  return ' — its open center channel keeps pressure off exactly where it hurts.';
}

/**
 * Deterministic — same template whether or not Groq ran. A quick, specific
 * synopsis of the fit and why (their pain areas, weight, and the one deciding
 * factor); the full explanation lives on the results page. The email template
 * already shows product/firmness/size/thickness as their own merge fields, so
 * this spends its characters on the WHY, not on restating the spec.
 * @param {object} routedResult
 * @param {object} answers - normalized answers (see parseTally.js)
 * @returns {string} short plain-text teaser for Mailchimp's AIMSG merge field
 */
function composeEmailSummary(routedResult, answers) {
  const pain = painPhrase(answers || {});
  let core;
  if (routedResult.product === 'Simple Soother') {
    core =
      routedResult.notes.product === 'temporary'
        ? `Your ${pain} started recently and may be temporary, so we'd start with the lower-cost Simple Soother — its center cutout is made for exactly this kind of pain.`
        : `Your ${pain} is centrally located, so the lower-cost Simple Soother is the right start — its center cutout takes the pressure off exactly that area.`;
  } else {
    core =
      `Your ${pain} plus your weight point to the Twin Cheeks in ${routedResult.firmness}` +
      emailDriverClause(routedResult);
  }
  const suffix = composeAlsoConsiderSuffix(routedResult.secondCushion);
  const mainBudget = EMAIL_SUMMARY_CHAR_LIMIT - suffix.length;
  return truncateAtWord(core, mainBudget) + suffix;
}

module.exports = {
  composeResultMessage,
  composeEmailSummary,
  composeWhyText,
  composeSpecificsTexts,
};
