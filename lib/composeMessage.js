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
  // The diagnosis belongs in the "why" itself when one was named - "based on
  // your buttock pain" alone credits the weaker signal when the person just
  // told us the exact condition this product was designed for.
  const cond = firstDiagnosisLabel(answers);
  return (
    `Based on your ${pain}${cond ? ` and your ${cond}` : ''}, the Twin Cheeks ` +
    'Folding Cushion is your fit — its two adjustable panels support you ' +
    'while the open center channel keeps pressure off exactly where it hurts.'
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
    'You mentioned wanting something compact — the 18" only comes in our ' +
    "Regular or Extra Cush thickness, so we've kept you on Regular. It still " +
    "folds like our other cushions; at this width it's just a larger piece " +
    'to carry.',
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
    'You told us you need more space when you sit, so we\'ve gone with the ' +
    '18". It\'s a more specialized size, so it\'s worth being sure it\'s what ' +
    'you want before you order.',
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
// 'recovering_surgery_childbirth' is also absent HERE (it reads badly in the
// "your buttock pain and your X" why-clause) but has its own DIAGNOSIS_TEXT.
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
 * Condition-specific validation + mechanism, one paragraph per named
 * condition. The first version of this was a single generic "that's not
 * rare, we hear about it often" line for every condition - which failed
 * hardest exactly where it mattered most: someone naming pudendal neuralgia
 * (the single most common reason people find this cushion) was told "we hear
 * about it often" without ever being told the cushion is designed for
 * precisely that. Each entry below connects the named condition to what the
 * design actually does about it, sourced from Trudy's call and the product
 * page's own mechanism description. Wording is deliberately about pressure
 * relief/mechanism - never a cure claim.
 *
 * Product note: vulvodynia and recovering_surgery_childbirth are the only
 * two that can appear on a Simple Soother result (everything else forces
 * Twin Cheeks), so those two use product-neutral wording ("the open center
 * of this cushion" / "this design"); the rest can safely reference the Twin
 * Cheeks channel and panels.
 */
const DIAGNOSIS_TEXT = {
  pudendal_neuralgia:
    'Pudendal neuralgia is the number one reason people come to us — this ' +
    'cushion was designed around it. The center channel is positioned so the ' +
    'pudendal nerve pathway sits fully suspended, carrying none of your ' +
    'weight, while the side panels hold you up.',
  pelvic_floor_dysfunction:
    'With pelvic floor dysfunction, every hour of sitting pressure keeps ' +
    'those muscles aggravated — the channel redirects your weight away from ' +
    'the pelvic floor and onto the parts built to carry it, so those muscles ' +
    'finally get a break while you sit.',
  coccydynia:
    'With coccydynia, the goal is simple: never load the tailbone. The open ' +
    'channel means your tailbone sits suspended — it touches nothing at all ' +
    'when you sit.',
  interstitial_cystitis:
    'With interstitial cystitis, pressure through the central pelvic area ' +
    'can aggravate everything — the channel keeps that whole area untouched ' +
    'while the panels carry your weight.',
  prostatitis_cpps:
    'A lot of men with a prostatitis or CPPS diagnosis find sitting pressure ' +
    'is a big part of the problem — the channel keeps your weight entirely ' +
    "off the perineum and prostate area, which is often exactly the relief " +
    "they're looking for.",
  endometriosis:
    'Endometriosis pain often travels — pelvic nerves refer pain into the ' +
    'hips and beyond, and ordinary sitting compresses exactly those ' +
    'pathways. Taking that compression away is what this cushion is built ' +
    'to do.',
  vulvodynia:
    'With vulvodynia, the goal is zero contact pressure on sensitive tissue ' +
    '— the open center of this cushion means that area touches nothing at ' +
    'all when you sit.',
  vaginismus:
    'With vaginismus, keeping the pelvic floor calm matters — carrying your ' +
    'weight at the sit bones instead of across the pelvic floor takes ' +
    'constant pressure out of the picture.',
  pelvic_girdle_pain:
    'With pelvic girdle pain, uneven pressure is the enemy — the two panels ' +
    'adjust independently, so you can set the support exactly where your ' +
    'body wants it.',
  recovering_surgery_childbirth:
    "You mentioned recovering from surgery or childbirth — keeping direct " +
    'pressure off healing tissue is exactly what this design does, and the ' +
    'right support now can make recovery a lot more comfortable.',
};

/**
 * Up to two condition-specific paragraphs, in the order they selected them.
 * @param {object} answers
 * @returns {string[]}
 */
function diagnosisParagraphs(answers) {
  const diagnoses = (answers && answers.diagnoses) || [];
  const texts = [];
  for (const d of diagnoses) {
    if (DIAGNOSIS_TEXT[d]) texts.push(DIAGNOSIS_TEXT[d]);
    if (texts.length === 2) break;
  }
  return texts;
}

/**
 * The first labeled diagnosis, for weaving into the "why" sentence and the
 * email teaser ("your buttock pain and your pudendal neuralgia").
 * @param {object} answers
 * @returns {string|null}
 */
function firstDiagnosisLabel(answers) {
  const diagnoses = (answers && answers.diagnoses) || [];
  for (const d of diagnoses) {
    if (DIAGNOSIS_LABELS[d]) return DIAGNOSIS_LABELS[d];
  }
  return null;
}

/**
 * Explains WHY the firmness in the spec table is what it is - previously the
 * firmness appeared with zero justification anywhere in the message.
 * Skipped when Extra Cush is primary (its firmness is Extra Firm because
 * that's the only fabric it comes in - the extra_cush_primary note already
 * explains that, and "based on your weight" would be wrong).
 * @param {object} routedResult
 * @param {object} answers
 * @returns {string|null}
 */
function firmnessExplanation(routedResult, answers) {
  const f = routedResult.firmness;
  if (routedResult.product === 'Simple Soother') {
    return (
      `We set the firmness at ${f} to match your weight — the Soother comes ` +
      'in Medium and Firm, and this is the right one for you.'
    );
  }
  if ((routedResult.notes.thickness || []).includes('extra_cush_primary')) return null;
  const pref = answers && answers.firmPreference;
  if (pref === 'firm') {
    return (
      `We set your firmness at ${f} based on your weight and your preference ` +
      "for firm, supportive seating — enough support that you'll never sink " +
      'through to the seat underneath.'
    );
  }
  if (pref === 'soft') {
    return (
      `We set your firmness at ${f} based on your weight, with your ` +
      'preference for a softer feel factored in — as cushy as we can go ' +
      'without you sinking through it.'
    );
  }
  return (
    `We set your firmness at ${f} based on your weight — firm enough to hold ` +
    'you up fully, without feeling like a board.'
  );
}

// Thickness notes that already talk about the car - when any of these fired,
// the generic car-default line below would be redundant or contradictory.
const CAR_AWARE_NOTES = [
  'tall_driver_low_profile',
  'booster_cushion_note',
  'low_profile_unavailable_at_band',
  'low_profile_unavailable_18in',
  'hardseatpain_over_travel_stayed_regular',
  'extra_cush_travel_car_conflict',
  'extra_cush_primary',
];

/**
 * When they said they'll use it while driving and NOTHING else in the
 * message mentions the car, say Trudy's actual answer ("they're all good in
 * the car - the regular is good for most people") instead of silently
 * ignoring a use case they told us about.
 * @param {object} routedResult
 * @param {object} answers
 * @returns {string|null}
 */
function carDefaultLine(routedResult, answers) {
  const useCase = (answers && answers.useCase) || [];
  if (!useCase.includes('car_truck')) return null;
  if (routedResult.product !== 'Twin Cheeks') return null;
  if (routedResult.thickness !== 'Regular 2"') return null;
  const notes = routedResult.notes.thickness || [];
  if (notes.some((n) => CAR_AWARE_NOTES.includes(n))) return null;
  return (
    'You mentioned using it while driving — the Regular 2" is our ' +
    'recommendation for the car; it sits well on nearly any car seat and ' +
    "folds up to stow when you're not on it."
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

  // Condition-specific mechanism paragraphs go first - speak to the person's
  // actual condition before any product tradeoff notes.
  for (const t of diagnosisParagraphs(answers)) texts.push(t);

  // Then WHY the firmness is what it is (the spec table states it bare).
  const firmnessLine = firmnessExplanation(routedResult, answers);
  if (firmnessLine) texts.push(firmnessLine);

  for (const note of routedResult.notes.thickness || []) {
    let text = NOTE_TEXT[note];
    if (!text) continue;
    if (note === 'low_profile_unavailable_at_band' && useCase.includes('car_truck')) {
      text += ' ' + UNAVAILABLE_AT_BAND_CAR_ADDENDUM;
    }
    texts.push(text);
  }

  // If they said "while driving" and nothing above mentioned the car, say
  // Trudy's actual car answer rather than silently ignoring the use case.
  const carLine = carDefaultLine(routedResult, answers);
  if (carLine) texts.push(carLine);

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
    // Lead with the diagnosis when one was named - it's the strongest signal
    // they gave us and the strongest reason to buy ("this is FOR my
    // condition"). Weight drops out of that variant to protect the char cap.
    const cond = firstDiagnosisLabel(answers || {});
    core =
      (cond
        ? `Your ${pain} and ${cond} point to the Twin Cheeks in ${routedResult.firmness}`
        : `Your ${pain} plus your weight point to the Twin Cheeks in ${routedResult.firmness}`) +
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
