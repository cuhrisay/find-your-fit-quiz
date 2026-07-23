/**
 * routing.js
 * ----------
 * Deterministic cushion routing for the CYA "Find Your Fit" quiz.
 * Translates Structure v4 (§3 Routing tables) into code.
 *
 * IMPORTANT: This file makes zero calls to Groq/AI. Per the design decision in
 * Structure v4 §1 ("Code picks the cushion. The AI writes the message."), every
 * decision here is a fixed rule traceable back to the doc. If you're changing what
 * gets recommended, change it here — not in the Groq prompt.
 *
 * Input: a normalized `answers` object (see parseTally.js for how raw Tally webhook
 * payloads get converted into this shape). `answers.weight` is a bucket key
 * (e.g. '151-169', 'over220', 'gift') from a multiple-choice dropdown - the
 * quiz collects weight in brackets, not as a raw numeric field.
 *
 * Output: a `result` object with product/firmness/size/thickness/notes/flags — see
 * the bottom of this file for the exact shape.
 *
 * ASSUMPTIONS CALLED OUT INLINE (search "ASSUMPTION:") are places where the source
 * doc was ambiguous. Each one is a judgment call made to ship something workable —
 * flag these to Chrisie/Trudy before trusting this in production.
 *
 * OPEN ITEM: the 201-220 lb band below follows Trudy's direct guidance (Firm),
 * which conflicts with the brochure/website copy (both say Extra Firm starting
 * at 200 lbs). Chrisie needs to reconcile the marketing materials with this.
 */

// ---------------------------------------------------------------------------
// Constants matching the exact Tally answer values (see parseTally.js for mapping
// from raw Tally option labels to these internal keys)
// ---------------------------------------------------------------------------

const FIRMNESS_BANDS = ['Soft', 'Medium', 'Medium Plus', 'Firm', 'Extra Firm'];

// Weight bucket + firm preference -> base firmness band. Direct lookup table,
// no index math - matches Chrisie's firmness table exactly.
const WEIGHT_FIRMNESS_TABLE = {
  under120: { firm: 'Medium', soft: 'Soft', neutral: 'Soft' },
  '120-129': { firm: 'Medium', soft: 'Medium', neutral: 'Medium' },
  '130-139': { firm: 'Medium Plus', soft: 'Medium', neutral: 'Medium' },
  '140-150': { firm: 'Medium Plus', soft: 'Medium', neutral: 'Medium Plus' },
  '151-169': { firm: 'Medium Plus', soft: 'Medium Plus', neutral: 'Medium Plus' },
  '170-180': { firm: 'Firm', soft: 'Medium Plus', neutral: 'Medium Plus' },
  '181-200': { firm: 'Firm', soft: 'Firm', neutral: 'Firm' },
  '201-220': { firm: 'Extra Firm', soft: 'Firm', neutral: 'Firm' },
  over220: { firm: 'Extra Firm', soft: 'Extra Firm', neutral: 'Extra Firm' },
};

/**
 * @param {string} weightBucket - a WEIGHT_FIRMNESS_TABLE key
 * @param {string} firmPreference - 'firm' | 'soft' | 'both' | 'not_sure'
 * @returns {string|null} a FIRMNESS_BANDS value, or null if weightBucket is unrecognized
 */
function baseFirmnessForWeight(weightBucket, firmPreference) {
  const row = WEIGHT_FIRMNESS_TABLE[weightBucket];
  if (!row) return null;
  // ASSUMPTION: Chrisie's table only lists firm/soft/not-sure columns - "Both
  // — depends" isn't addressed. Treated the same as "not sure" (the neutral
  // column) for now. Flag to Chrisie/Trudy before trusting this in production.
  const column =
    firmPreference === 'firm' ? 'firm' : firmPreference === 'soft' ? 'soft' : 'neutral';
  return row[column];
}

// Screen 3 locations that force Twin Cheeks regardless of anything else
const FORCING_LOCATIONS = [
  'tailbone', 'sit_bones', 'rectal', 'hips', 'buttocks', 'groin', 'perineum', 'prostate',
];

// Screen 3 locations that are eligible for the Soother path IF nothing else overrides
const CENTRAL_ONLY_LOCATIONS = ['bladder_urethra', 'genital_vaginal'];

// Screen 8 diagnoses that, if selected alongside central-only pain, bump Soother -> Twin Cheeks
// (nerve/muscle-mechanism conditions per Structure v4 §3's product table)
const DISQUALIFYING_DIAGNOSES = [
  'pudendal_neuralgia',
  'pelvic_floor_dysfunction',
  'vaginismus',
  'pelvic_girdle_pain',
  'endometriosis',
  'coccydynia',
  'interstitial_cystitis',
  'prostatitis_cpps',
];

// Screen 8 values that do NOT count as a "named chronic condition" for the
// temporary-condition Soother rule (Screen 12 + Screen 4 + "no chronic condition")
const NON_CHRONIC_DIAGNOSIS_VALUES = [
  'recovering_surgery_childbirth', 'something_else', 'no_diagnosis',
];

// ---------------------------------------------------------------------------
// PRODUCT
// ---------------------------------------------------------------------------

function routeProduct(answers) {
  const locations = answers.painLocations || [];
  const diagnoses = answers.diagnoses || [];

  const hasForcingLocation = locations.includes('not_sure') ||
    locations.some((loc) => FORCING_LOCATIONS.includes(loc));

  const isCentralOnly =
    locations.length > 0 &&
    locations.every((loc) => CENTRAL_ONLY_LOCATIONS.includes(loc));

  let product = 'Twin Cheeks'; // default per doc - Twin Cheeks is the fallback everywhere
  let soatherReason = null;

  if (hasForcingLocation) {
    // Row 1 of the Product table - takes priority over everything below.
    product = 'Twin Cheeks';
  } else if (isCentralOnly) {
    const hasDisqualifyingDiagnosis = diagnoses.some((d) =>
      DISQUALIFYING_DIAGNOSES.includes(d)
    );
    if (hasDisqualifyingDiagnosis) {
      product = 'Twin Cheeks';
    } else {
      // Central-only, and nothing (or only Vulvodynia, which isn't in the
      // disqualifying list) pushes it to Twin Cheeks -> Soother is appropriate.
      product = 'Simple Soother';
      soatherReason = 'central_only';
    }
  }

  // ASSUMPTION: the "temporary condition" Soother rule (Screen 12 + Screen 4 +
  // no chronic diagnosis) is only reachable here when pain locations are ALSO
  // central-only. The source doc (Structure v4 §3) lists this as a separate table
  // row with no explicit location constraint, which would directly contradict Row 1
  // (tailbone/sit-bone/etc pain always forces Twin Cheeks) if taken literally for
  // e.g. someone with tailbone pain from a recent fall. Constraining it to
  // central-only pain resolves that contradiction and matches the spirit of the
  // rest of the Soother logic (the channel design is for tailbone/sit-bone/rectal
  // pressure points regardless of how recently the pain started).
  // CONFIRM WITH CHRISIE/TRUDY BEFORE TRUSTING THIS IN PRODUCTION.
  if (isCentralOnly && product === 'Twin Cheeks') {
    const recentEvents = answers.recentEvents || [];
    const hasRecentEvent = recentEvents.some((e) => e !== 'none');
    const isRecentDuration = answers.duration === 'under_month';
    const hasChronicDiagnosis = diagnoses.some(
      (d) => !NON_CHRONIC_DIAGNOSIS_VALUES.includes(d)
    );
    if (hasRecentEvent && isRecentDuration && !hasChronicDiagnosis) {
      product = 'Simple Soother';
      soatherReason = 'temporary';
    }
  }

  // Custom-cutout note: surfaced as a conversation, never sold as the primary result.
  // Fires only on Screen 5 = "Yes" (one-sided pain), regardless of product.
  let customNote = null;
  if (answers.oneSided === 'yes') {
    customNote =
      "Pain that's clearly on one side sometimes fits a custom cutout better than " +
      'the centered channel. Customs aren\'t returnable, so we\'d rather you try the ' +
      "standard first and talk to us if it's not quite right.";
  }

  // Fixed Soother upgrade line - not optional, not left to Groq. Always shown
  // whenever Soother is the result (Structure v4 §3, "fixed result line, always shown").
  let soatherUpgradeLine = null;
  if (product === 'Simple Soother') {
    soatherUpgradeLine =
      "If this doesn't feel like enough, Twin Cheeks is an easy upgrade — just let us know.";
  }

  return { product, soatherReason, customNote, soatherUpgradeLine };
}

// ---------------------------------------------------------------------------
// FIRMNESS (weight + preference table lookup - no hard-seat-pain involvement;
// hard-seat pain now only affects Extra Cush, decided in routeThickness below)
// ---------------------------------------------------------------------------

function routeFirmness(answers) {
  const lookedUp = baseFirmnessForWeight(answers.weight, answers.firmPreference);
  const fallback = !lookedUp;
  // Shouldn't happen if the gift fork is handled upstream - default to the
  // most common band as a safe fallback and flag it, rather than throwing.
  const band = fallback ? 'Medium Plus' : lookedUp;
  return {
    firmness: band,
    firmnessIndex: FIRMNESS_BANDS.indexOf(band),
    weightFallbackUsed: fallback,
  };
}

// ---------------------------------------------------------------------------
// THICKNESS (depends on firmness band from above, plus use case / height)
// ---------------------------------------------------------------------------

function routeThickness(answers, firmnessResult) {
  let firmnessIndex = firmnessResult.firmnessIndex;
  const baseBand = FIRMNESS_BANDS[firmnessIndex];
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');

  const hardSeatPain = (answers.hardSeatPain || []).filter((v) => v !== 'none');
  const hasHardSeatPain = hardSeatPain.length > 0;

  let thickness = 'Regular 2"';
  const notes = [];
  let extraCushPrimary = false;

  // Extra Cush now only comes in Extra Firm fabric, and is the PRIMARY pick
  // (not a modifier layered on top of any band) when hard-seat pain is
  // present and the base band already lands on Firm or Extra Firm.
  if (hasHardSeatPain && (baseBand === 'Firm' || baseBand === 'Extra Firm')) {
    thickness = 'Extra Cush 3"';
    extraCushPrimary = true;
    // ASSUMPTION: bumping a Firm base band up to Extra Firm here, same
    // reasoning as the confirmed Low Profile bump below (the physical product
    // only exists in Extra Firm, so the displayed firmness has to match it).
    // Not explicitly stated for Extra Cush by Trudy, but consistent with her
    // confirmed principle for Low Profile. Flag before trusting in production.
    firmnessIndex = FIRMNESS_BANDS.indexOf('Extra Firm');
    notes.push('extra_cush_primary');
    if (wantsTravel || wantsCar) {
      // Don't silently swap away from Extra Cush - flag the conflict instead,
      // per "flag the conflict instead of silently swapping to something else."
      notes.push('extra_cush_travel_car_conflict');
    }
  } else if (wantsTravel) {
    thickness = 'Low Profile 1.5"';
    // Explicit note so the AI attributes this to travel, not to pain
    // locations/hardSeatPain (which drive product/Extra-Cush decisions, not
    // this branch) - without this, the AI has been observed inventing a false
    // connection to pain instead.
    notes.push('travel_low_profile');
  }

  // Car defaults: Regular 2" for everyone unless height says otherwise.
  // Only apply car-specific logic if Extra Cush wasn't already primary.
  if (wantsCar && !extraCushPrimary) {
    if (answers.height === 'tall') {
      thickness = 'Low Profile 1.5"';
      notes.push('tall_driver_low_profile');
    } else if (answers.height === 'short') {
      notes.push('booster_cushion_note');
    }
    // regular height: no caveat, Regular 2" default stands (already set above)
  }

  // Low Profile availability constraint: Chrisie confirmed the physical product
  // only comes in Medium / Medium Plus / Firm (indices 1, 2, 3) - never Soft or
  // Extra Firm. If the computed band is outside that range and thickness landed
  // on Low Profile, fall back to Regular 2" and note why - explicitly, not
  // silently: they wanted something compact, don't recommend Low Profile since
  // it wouldn't give enough support here, but note Regular still folds too
  // (just not as compact), and for driving specifically they may need to
  // adjust their seat down instead.
  if (thickness === 'Low Profile 1.5"' && (firmnessIndex < 1 || firmnessIndex > 3)) {
    thickness = 'Regular 2"';
    notes.push('low_profile_unavailable_at_band');
  } else if (thickness === 'Low Profile 1.5"') {
    // Firmness bump: whenever Low Profile is the result, bump the band up one.
    // CONFIRMED by Trudy directly on the call, not a guess: "when you go
    // shorter, you have to go more firm to get the same support." Capped at
    // Firm (index 3) rather than letting it reach Extra Firm, since Low
    // Profile doesn't physically come in Extra Firm fabric.
    firmnessIndex = Math.min(firmnessIndex + 1, 3);
    notes.push('low_profile_firmness_bump');
    if (answers.firmPreference === 'soft') {
      // Per Chrisie: flag this tradeoff explicitly rather than silently
      // picking - Low Profile isn't as soft/cushy as they said they want, and
      // Regular can also fold for travel/driving, just isn't as compact. Let
      // them decide which matters more.
      notes.push('low_profile_soft_preference_tradeoff');
    }
  }

  return { thickness, firmnessIndex, notes, hasHardSeatPain, baseBand, extraCushPrimary };
}

// ---------------------------------------------------------------------------
// SIZE
// ---------------------------------------------------------------------------

function routeSize(answers) {
  const useCase = answers.useCase || [];
  const notes = [];
  let size = '16" (Regular Size)';

  if (useCase.includes('wheelchair') || useCase.includes('recliner_couch')) {
    size = '18" (Larger Size)';
    notes.push('wheelchair_recliner_override');
  } else if (answers.weight === 'over220') {
    size = '18" (Larger Size)';
    notes.push('weight_override');
  } else if (answers.needsMoreSpace === 'yes' || answers.needsMoreSpace === 'sometimes') {
    if (answers.height === 'tall') {
      size = '16" (Regular Size)';
      notes.push('tall_not_wide_note'); // being tall isn't a reason to go wider
    } else {
      size = '18" (Larger Size)';
    }
  } else {
    size = '16" (Regular Size)';
    if (answers.needsMoreSpace === 'no') {
      notes.push('likely_dont_need_18');
    }
  }

  return { size, notes };
}

// ---------------------------------------------------------------------------
// SECOND CUSHION / ALSO CONSIDER
// ---------------------------------------------------------------------------

// Low Profile only comes in Medium / Medium Plus / Firm - shown alongside the
// suggestion so results.html can display it (e.g. "Low Profile 1.5" — Medium/
// Medium Plus/Firm") without hardcoding it client-side.
const LOW_PROFILE_FIRMNESS_RANGE = 'Medium/Medium Plus/Firm';

function routeSecondCushion(answers, size, thicknessResult) {
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');
  const wantsCarTravelOrPublic = wantsTravel || wantsCar;

  const { hasHardSeatPain, baseBand, extraCushPrimary } = thicknessResult;

  // Extra Cush "also consider": a secondary mention (not a primary swap) when
  // hard-seat pain is present at Medium/Medium Plus, or when there's no
  // hard-seat pain but preference is soft/cushy at Medium/Medium Plus. Never
  // shown at Soft, never shown when Extra Cush is already the primary pick,
  // and suppressed entirely for car/travel/public-place use (per Chrisie:
  // "suppress the also-consider mention entirely if they need the cushion for
  // car, travel, or public places").
  if (!extraCushPrimary && !wantsCarTravelOrPublic && baseBand !== 'Soft') {
    const extraCushAlsoConsider =
      (hasHardSeatPain && (baseBand === 'Medium' || baseBand === 'Medium Plus')) ||
      (!hasHardSeatPain &&
        answers.firmPreference === 'soft' &&
        (baseBand === 'Medium' || baseBand === 'Medium Plus'));
    if (extraCushAlsoConsider) {
      return {
        trigger: 'extra_cush_also_consider',
        suggestion: { size, thickness: 'Extra Cush 3"', firmnessRange: 'Extra Firm' },
        note: hasHardSeatPain
          ? "Since sitting on hard surfaces bothers you, Extra Cush's thicker top layer might feel better - just know it only comes in Extra Firm, a step up from what's recommended here."
          : "Since you said you like things soft and cushy, Extra Cush's thicker top layer might feel better - just know it only comes in Extra Firm, a step up from what's recommended here.",
      };
    }
  }

  // Extra Cush primary + travel/car: don't silently swap away from Extra Cush.
  // Whether Low Profile gets offered as a secondary option depends on their
  // UNDERLYING band, before Extra Cush's own bump to Extra Firm - if they were
  // already Firm (not yet bumped), that band still qualifies for Low Profile,
  // so it's worth mentioning as a secondary since they clearly said
  // portability matters. If they were already at Extra Firm before Extra Cush
  // even entered the picture, they're genuinely at a weight/support level
  // where Low Profile wouldn't hold up, so don't suggest it at all - just
  // explain why, and note that Regular still folds too.
  if (extraCushPrimary && wantsCarTravelOrPublic) {
    if (baseBand === 'Firm') {
      return {
        trigger: 'extracush_plus_travel_car_lowprofile_also_consider',
        suggestion: {
          size,
          thickness: 'Low Profile 1.5"',
          firmnessRange: LOW_PROFILE_FIRMNESS_RANGE,
        },
        note:
          'Extra Cush is the better fit for the pain you described, but since ' +
          'portability matters to you, a Low Profile is also an option - just ' +
          "know it won't have the Extra Cush layer.",
      };
    }
    return {
      trigger: 'extracush_plus_travel_car_tradeoff',
      suggestion: null, // flagged as a tradeoff, not auto-resolved
      note:
        "Extra Cush doesn't travel or fit typical car seats well, and at this " +
        "weight a Low Profile wouldn't give you enough support to make sense " +
        'as a pairing. Regular can still fold for travel/driving, just not as ' +
        'compact.',
    };
  }

  // Low Profile primary (from routeThickness) already directly covers a
  // travel/driving need when they qualify for it - per Chrisie, we don't want
  // to recommend two cushions unless clearly needed, so there's nothing
  // further to suggest here.
  return null;
}

// ---------------------------------------------------------------------------
// TOP-LEVEL
// ---------------------------------------------------------------------------

/**
 * Routes a normalized answers object to a full cushion recommendation.
 * Throws if `answers.weight` is missing/invalid or equals 'gift' — the gift fork
 * should be handled upstream in Tally/parseTally, this function should never be
 * called for a gift-card submission.
 */
function routeCushion(answers) {
  if (!answers || !answers.weight || answers.weight === 'gift') {
    throw new Error(
      'routeCushion called without a valid weight. The gift fork should ' +
        'redirect before reaching this function — check parseTally.js / the Tally flow.'
    );
  }

  const productResult = routeProduct(answers);
  const firmnessResult = routeFirmness(answers);
  const thicknessResult = routeThickness(answers, firmnessResult);
  const sizeResult = routeSize(answers);
  const finalFirmness = FIRMNESS_BANDS[thicknessResult.firmnessIndex];
  const secondCushion = routeSecondCushion(answers, sizeResult.size, thicknessResult);

  return {
    product: productResult.product,
    firmness: finalFirmness,
    size: sizeResult.size,
    thickness: thicknessResult.thickness,
    secondCushion,
    notes: {
      product: productResult.soatherReason,
      customNote: productResult.customNote,
      soatherUpgradeLine: productResult.soatherUpgradeLine,
      thickness: thicknessResult.notes,
      size: sizeResult.notes,
    },
    flags: {
      weightFallbackUsed: firmnessResult.weightFallbackUsed,
    },
    // Always-on messaging (Structure v4 §4, §5) - not conditional on any routing
    // outcome, shown on every result regardless of product/size/thickness.
    alwaysInclude: {
      breakIn: 'Keep in mind — our cushions come firm and soften over time.',
      returnPolicy:
        'Returns are open for 14 days. If you need more time to try it, just email ' +
        "us before the window closes and we'll extend it — no problem.",
      waitlistNote:
        sizeResult.size === '18" (Larger Size)'
          ? 'This one sometimes sells out. Don\'t worry — we restock regularly. ' +
            "Add your email and we'll let you know the moment it's back."
          : null,
      eighteenInchExplanation:
        sizeResult.size === '18" (Larger Size)'
          ? '18" isn\'t a bigger cushion overall — it\'s about an extra inch of ' +
            'foam under each thigh compared to 16". If your thighs go sore or ' +
            'hang off the edge of the standard size, that extra inch is what ' +
            'fixes it. It\'s also a stay-in-place cushion, not a travel one.'
          : null,
    },
  };
}

module.exports = {
  routeCushion,
  // exported for unit testing
  routeProduct,
  routeFirmness,
  routeThickness,
  routeSize,
  routeSecondCushion,
  baseFirmnessForWeight,
  FIRMNESS_BANDS,
};
