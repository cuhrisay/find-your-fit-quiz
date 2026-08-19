/**
 * composeMessage.js
 * ------------------
 * Builds the final HTML result message. Everything about the recommendation is
 * explained by fixed, code-generated copy here, keyed off routing.js's output,
 * so the reasoning always matches what the routing actually did. The AI
 * (groq.js) contributes only one optional paragraph — a reply to the free-text
 * box — and only when that box has content.
 *
 * CLAIM SAFETY (Trudy/Chrisie, firm rules — see docs/CYA_Fit_Quiz_Structure_v5.md):
 * - Never claim the cushion treats, cures, is "designed for" or "made for" a
 *   condition, and never rank ("#1"). It relieves pressure — that's the ceiling.
 * - The real mechanism: weight rests on the cushy part of the buttocks (NOT the
 *   sit bones — those sit just inside the channel with no pressure on them);
 *   relieving that pressure lets the tight pelvic floor relax, which is what
 *   eases pain, including referred pain in the hips/thighs the cushion never
 *   directly touches. Don't say "pressure off exactly where it hurts."
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

function composeWhyText(routedResult, answers) {
  const pain = painPhrase(answers || {});
  if (routedResult.product === 'Simple Soother') {
    const cutout = 'its cutout takes the pressure right off that area';
    if (routedResult.notes.product === 'temporary') {
      return (
        'Because you only reported central pain and it\'s fairly recent, the ' +
        `Simple Soother is a smart, lower-cost place to start — ${cutout}.`
      );
    }
    return (
      'Because you only reported central pain — nothing under the tailbone or ' +
      `sit bones — the Simple Soother is the right lower-cost fit, and ${cutout}.`
    );
  }
  const cond = firstDiagnosisLabel(answers);
  return (
    `Based on your ${pain}${cond ? ` and your ${cond}` : ''}, the Twin Cheeks ` +
    'Folding Cushion is your fit. Its two adjustable panels carry your weight ' +
    'on the cushy part of your buttocks, while your sit bones rest just inside ' +
    "the open channel with no pressure on them — that's what lets the pelvic " +
    "floor relax, and it's usually where the relief comes from."
  );
}

// ---------------------------------------------------------------------------
// "For You Specifically" — fixed explanations
// ---------------------------------------------------------------------------

// Every thickness/size note routing.js can emit. An unknown note is simply
// skipped (never mis-explained).
const NOTE_TEXT = {
  low_profile_primary:
    'Since you need something compact for travel, we went with the Low Profile ' +
    '— it packs down small. Because it sits lower, its foam is a level firmer ' +
    "than your weight alone would call for (that's the firmness shown above), " +
    'so it still holds you up.',
  low_profile_over200:
    'You wanted something compact for travel — the Regular folds and travels ' +
    "fine, so we've kept you there. At your weight a Low Profile wouldn't have " +
    'enough foam to support you.',
  extra_cush_primary:
    "Since you'd like a cushy seat and you're at a weight where a plain firm " +
    'cushion can feel hard, we went with the Extra Cush — an extra inch of soft ' +
    'foam over an Extra Firm base, so it feels cushioned without bottoming out. ' +
    'Prefer not to add the height? The Regular is a great pick too.',
  extra_cush_car_caveat:
    'For the car, the Extra Cush adds a couple inches of height — great if your ' +
    'seat lowers or you have headroom like an SUV or minivan, but in a small car ' +
    'with a fixed seat, go with the Regular for driving.',
  extra_cush_travel_caveat:
    "Heads up for travel: the Extra Cush is thicker, so it's bulkier to pack. It " +
    'still folds and carries — it just takes up more room than our thinner cushions.',
  extra_cush_also_consider_unsure:
    'Torn between firm and cushy? The Extra Cush 3" gives you both — an Extra ' +
    'Firm base for support with a soft top for comfort — though it does add some height.',
  extra_cush_also_consider_firm:
    'One option to keep in mind: Firm and Extra Firm come quite hard, and since ' +
    'a hard seat bothers you where you sit, the Extra Cush 3" softens that with a ' +
    "cushy top over the same firm support. It adds a little height, so it's your call.",
  wheelchair_recliner_wide_seat_check:
    'One thing to double-check: wheelchair and recliner seats often run wide. ' +
    'If yours does, the 18" may seat better — measure it if you\'re not sure, ' +
    "or email us and we'll help.",
  consider_18in_not_sure:
    "Since you weren't sure if you need more room: the 18\" gives about an " +
    'extra inch of foam under each thigh. Worth a look if you\'re bigger-framed ' +
    "or your thighs tend to hurt on a narrow seat — email us if you'd rather " +
    'switch sizes after the fact.',
};

// ---------------------------------------------------------------------------
// Diagnosis handling
// ---------------------------------------------------------------------------

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

// One paragraph per named condition — condition-specific, mechanism only, no
// treatment/cure/design claims (see CLAIM SAFETY at top). "One of the most
// common things people come to us about" for the four Trudy named (PN,
// coccydynia, prostatitis, vulvodynia); no ranking language.
const DIAGNOSIS_TEXT = {
  pudendal_neuralgia:
    'Pudendal neuralgia is one of the most common things people come to us ' +
    'about. The open channel keeps your weight off the pudendal nerve pathway, ' +
    "so it isn't compressed while you sit.",
  coccydynia:
    'Tailbone pain — coccydynia — is one of the most common reasons people find ' +
    'us. The open channel lets your tailbone rest suspended, carrying no weight ' +
    'at all while you sit.',
  prostatitis_cpps:
    'A lot of the discomfort that comes with a prostatitis or CPPS diagnosis is ' +
    'tied to sitting pressure and pelvic floor tension. Taking that pressure off ' +
    'the area gives those muscles a chance to relax.',
  vulvodynia:
    'Vulvodynia is something we hear about often. The open center keeps direct ' +
    'contact and pressure off that sensitive tissue while you sit.',
  pelvic_floor_dysfunction:
    'With pelvic floor dysfunction, sitting all day keeps those muscles under ' +
    'constant pressure. Lifting your weight off the pelvic floor gives them a ' +
    'real chance to relax.',
  interstitial_cystitis:
    'With interstitial cystitis, pressure through the pelvic area can make ' +
    'everything flare. Keeping your weight off that whole central area while you ' +
    'sit takes one aggravator out of the day.',
  endometriosis:
    'Endometriosis pain often radiates through the pelvic region and out to the ' +
    'hips. Easing the sitting pressure lets the surrounding muscles relax, which ' +
    'can ease some of that referred ache.',
  vaginismus:
    'With vaginismus, keeping the pelvic floor calm matters. Carrying your weight ' +
    'on the cushy part of your buttocks, off the pelvic floor entirely, gives ' +
    'those muscles room to relax.',
  pelvic_girdle_pain:
    'With pelvic girdle pain, balanced support makes a difference — the two ' +
    'panels adjust independently, so you can set the support where your body ' +
    'wants it.',
  recovering_surgery_childbirth:
    'You mentioned recovering from surgery or childbirth. Keeping direct pressure ' +
    'off tender, healing tissue is what this cushion does, and good support now ' +
    'can make sitting a lot more comfortable while you heal.',
};

/** Up to two condition paragraphs, in the order selected. */
function diagnosisParagraphs(answers) {
  const diagnoses = (answers && answers.diagnoses) || [];
  const texts = [];
  for (const d of diagnoses) {
    if (DIAGNOSIS_TEXT[d]) texts.push(DIAGNOSIS_TEXT[d]);
    if (texts.length === 2) break;
  }
  return texts;
}

/** First labeled diagnosis, for the "why" sentence and email teaser. */
function firstDiagnosisLabel(answers) {
  const diagnoses = (answers && answers.diagnoses) || [];
  for (const d of diagnoses) {
    if (DIAGNOSIS_LABELS[d]) return DIAGNOSIS_LABELS[d];
  }
  return null;
}

/**
 * Explains WHY the firmness in the spec table is what it is. Skipped when Extra
 * Cush is primary (its firmness is Extra Firm because that's its only fabric —
 * the extra_cush_primary note covers that).
 */
function firmnessExplanation(routedResult, answers) {
  const f = routedResult.firmness;
  const w = answers && answers.weight;
  const pref = answers && answers.firmPreference;

  if (routedResult.product === 'Simple Soother') {
    if (w === '130-139' || w === '140-150') {
      return (
        `The Soother comes in Medium and Firm. At your weight you're right on the ` +
        `line between them, so we went with ${f} — but the other is fine too, ` +
        'depending on how much support you want.'
      );
    }
    return `The Soother comes in Medium and Firm — at your weight, ${f} is the right one.`;
  }

  // Low Profile explains its own (bumped) firmness in its note; a "based on your
  // weight" line here would contradict it. Same for Extra Cush (Extra Firm is
  // its only fabric, explained in its note).
  const tNotes = routedResult.notes.thickness || [];
  if (tNotes.includes('extra_cush_primary') || tNotes.includes('low_profile_primary')) return null;

  // Right around 140–150 lb is a genuine either/or between Medium and Medium Plus.
  if (w === '140-150') {
    return (
      `At around 140–150 lbs you're between our Medium and Medium Plus — we've ` +
      `gone with ${f}, but the other works too, depending on how much support you want.`
    );
  }
  if (pref === 'firm') {
    return (
      `We set your firmness at ${f} based on your weight and your preference for ` +
      "firm, supportive seating — enough support that you'll never sink through to " +
      'the seat underneath.'
    );
  }
  if (pref === 'soft') {
    return (
      `We set your firmness at ${f} based on your weight, with your preference for ` +
      'a softer feel factored in — as cushy as we can go without you sinking through it.'
    );
  }
  return (
    `We set your firmness at ${f} based on your weight — firm enough to hold you ` +
    'up fully, without feeling like a board.'
  );
}

/**
 * When they'll use it while driving and nothing else in the message mentions
 * the car, give Trudy's actual car answer. Suppressed when a second-cushion
 * suggestion (Low Profile companion) already covers the car/travel angle.
 */
function carDefaultLine(routedResult, answers) {
  const useCase = (answers && answers.useCase) || [];
  if (!useCase.includes('car_truck')) return null;
  if (routedResult.product !== 'Twin Cheeks') return null;
  if (routedResult.thickness !== 'Regular 2"') return null;
  if (routedResult.secondCushion && routedResult.secondCushion.suggestion) return null;
  return (
    'You mentioned driving — the Regular is our pick for the car. It adds a ' +
    'little height, so if your seat lowers, drop it to compensate; it folds up ' +
    "to stow when you're not on it."
  );
}

/**
 * Gathers every "For You Specifically" paragraph, in a stable order.
 * @returns {string[]}
 */
function composeSpecificsTexts(routedResult, answers) {
  const texts = [];
  const useCase = (answers && answers.useCase) || [];
  const isSoother = routedResult.product === 'Simple Soother';

  if (routedResult.notes.spaceBumpedFromSoother) {
    texts.push(
      'Your pain pattern alone would usually point to the lower-cost Simple ' +
        "Soother, but since you need more room to sit, we've gone with the " +
        'Twin Cheeks instead — the Soother only comes in one size.'
    );
  }

  for (const t of diagnosisParagraphs(answers)) texts.push(t);

  const firmnessLine = firmnessExplanation(routedResult, answers);
  if (firmnessLine) texts.push(firmnessLine);

  for (const note of routedResult.notes.thickness || []) {
    if (NOTE_TEXT[note]) texts.push(NOTE_TEXT[note]);
  }

  const carLine = carDefaultLine(routedResult, answers);
  if (carLine) texts.push(carLine);

  if (isSoother && (useCase.includes('traveling') || useCase.includes('public_places'))) {
    texts.push(
      "One note: the Simple Soother isn't the best for travel — it doesn't fold " +
        'down the way the Twin Cheeks does.'
    );
  }

  for (const note of routedResult.notes.size || []) {
    if (NOTE_TEXT[note]) texts.push(NOTE_TEXT[note]);
  }

  // The 18" explanation (already includes its own gut-check) — shown whenever 18".
  if (routedResult.alwaysInclude.eighteenInchExplanation) {
    texts.push(routedResult.alwaysInclude.eighteenInchExplanation);
  }

  if (routedResult.secondCushion && routedResult.secondCushion.note) {
    // Only an actual companion-product suggestion gets the bold lead-in -
    // notes that merely explain (e.g. "your wheelchair already travels with
    // you") aren't offering another option, so they stay plain.
    texts.push(
      routedResult.secondCushion.suggestion
        ? { lead: 'Another option to consider:', text: routedResult.secondCushion.note }
        : routedResult.secondCushion.note
    );
  }

  if (routedResult.notes.sootherUpgradeLine) {
    texts.push(routedResult.notes.sootherUpgradeLine);
  }

  return texts;
}

function composePolicyBlock(routedResult) {
  return (
    '<h3>Important Note</h3>\n' +
    `<p>${escapeHtml(routedResult.alwaysInclude.breakIn)} ${escapeHtml(routedResult.alwaysInclude.returnPolicy)}</p>`
  );
}

/**
 * Builds the full HTML result message.
 * @param {object} routedResult - routeCushion() output
 * @param {object} answers - normalized answers
 * @param {{freeTextResponse: string, distressTier: string}|null} aiResult
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
    for (const item of specifics) {
      if (typeof item === 'string') {
        sections.push(`<p>${escapeHtml(item)}</p>`);
      } else {
        sections.push(`<p><strong>${escapeHtml(item.lead)}</strong> ${escapeHtml(item.text)}</p>`);
      }
    }
    if (aiParagraph) sections.push(`<p>${escapeHtml(aiParagraph)}</p>`);
  }

  if (aiResult && aiResult.distressTier === 'crisis') sections.push(CRISIS_BLOCK);

  sections.push(composePolicyBlock(routedResult));
  sections.push(MORE_SUPPORT_BLOCK);
  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Email teaser (Mailchimp AIMSG merge field, ~240 char cap)
// ---------------------------------------------------------------------------

const EMAIL_SUMMARY_CHAR_LIMIT = 240;

function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

function composeAlsoConsiderSuffix(secondCushion) {
  if (!secondCushion || !secondCushion.suggestion) return '';
  const s = secondCushion.suggestion;
  const firmness = s.firmnessRange ? ` (${s.firmnessRange})` : '';
  return ` Also consider: ${s.thickness}${firmness} for travel.`;
}

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

function painPhrase(answers) {
  const labels = (answers.painLocations || [])
    .map((loc) => PAIN_LABELS[loc])
    .filter(Boolean)
    .slice(0, 2);
  if (labels.length === 0) return 'pain';
  return labels.join(' and ') + ' pain';
}

function emailDriverClause(routedResult) {
  const notes = routedResult.notes.thickness || [];
  if (notes.includes('extra_cush_primary')) {
    return ' — an extra inch of soft foam over an Extra Firm base: cushioned but supportive.';
  }
  if (notes.includes('low_profile_primary')) {
    return ' — Low Profile packs small for travel, firmness bumped up so it still supports you.';
  }
  if (notes.includes('low_profile_over200')) {
    return " — the Regular folds for travel; a Low Profile wouldn't hold you up at your weight.";
  }
  if (routedResult.size === '18" (Larger Size)') {
    return ' — the 18" gives your thighs the extra room you wanted.';
  }
  return ' — it lifts pressure off the pelvic floor so it can finally relax.';
}

function composeEmailSummary(routedResult, answers) {
  const pain = painPhrase(answers || {});
  let core;
  if (routedResult.product === 'Simple Soother') {
    core =
      routedResult.notes.product === 'temporary'
        ? `Your ${pain} is central and recent, so we'd start with the lower-cost Simple Soother — its cutout takes pressure right off that area.`
        : `You only reported central ${pain}, so the lower-cost Simple Soother is the right start — its cutout takes pressure right off that area.`;
  } else {
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
