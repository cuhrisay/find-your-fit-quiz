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
 * payloads get converted into this shape).
 *
 * Output: a `result` object with product/firmness/size/thickness/notes/flags — see
 * the bottom of this file for the exact shape.
 *
 * ASSUMPTIONS CALLED OUT INLINE (search "ASSUMPTION:") are places where the source
 * doc was ambiguous or the quiz's existing answer buckets couldn't give an exact
 * match to a rule written in raw numbers. Each one is a judgment call made to ship
 * something workable — flag these to Chrisie/Trudy before trusting this in production.
 */

// ---------------------------------------------------------------------------
// Constants matching the exact Tally answer values (see parseTally.js for mapping
// from raw Tally option labels to these internal keys)
// ---------------------------------------------------------------------------

const WEIGHT_BUCKETS = ['under120', '120-140', '140-180', '180-220', 'over220'];

const FIRMNESS_BANDS = ['Soft', 'Medium', 'Medium Plus', 'Firm', 'Extra Firm'];

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
// FIRMNESS (base band from weight, then modifiers)
// ---------------------------------------------------------------------------

function baseFirmnessIndex(weightBucket) {
  const idx = WEIGHT_BUCKETS.indexOf(weightBucket);
  if (idx === -1) {
    // Shouldn't happen if the gift fork is handled upstream (gift/unknown weight
    // never reaches routing) - default to the most common band as a safe fallback
    // and flag it, rather than throwing.
    return { index: 2, fallback: true }; // Medium Plus
  }
  return { index: idx, fallback: false };
}

function routeFirmnessAndExtraCush(answers) {
  const { index: baseIndex, fallback } = baseFirmnessIndex(answers.weight);
  let bandIndex = baseIndex;
  let extraCushTriggered = false;
  let droppedForLightweight = false;

  const hardSeatPain = (answers.hardSeatPain || []).filter((v) => v !== 'none');
  const hasHardSeatPain = hardSeatPain.length > 0;

  // ASSUMPTION: the doc's Extra Cush eligibility threshold is "150 lbs+", but the
  // quiz collects weight as discrete buckets (Under 120 / 120-140 / 140-180 /
  // 180-220 / Over 220), and 150 falls inside the middle of the 140-180 bucket.
  // There is no way to distinguish a 145 lb person from a 175 lb person with the
  // buckets as built. This treats the ENTIRE 140-180 bucket as eligible (erring
  // toward offering the more supportive option when in doubt) rather than
  // excluding it. If precision matters here, the fix is a follow-up question, not
  // a code change — flag to Chrisie.
  const extraCushEligibleByWeight = baseIndex >= WEIGHT_BUCKETS.indexOf('140-180');

  if (hasHardSeatPain) {
    if (extraCushEligibleByWeight) {
      extraCushTriggered = true;
      // band stays as computed - Extra Cush handles the softness via thickness,
      // not by lowering structural support
    } else {
      bandIndex -= 1;
      droppedForLightweight = true;
    }
  }

  if (answers.firmPreference === 'firm') {
    bandIndex += 1;
  } else if (answers.firmPreference === 'soft') {
    if (!extraCushEligibleByWeight && !droppedForLightweight) {
      // "Under 150 with Extra Cush declined, one band down is acceptable" -
      // only apply this once even if multiple rules could trigger a drop.
      bandIndex -= 1;
    }
    // If extraCushEligibleByWeight: explicitly do NOT drop the band. Per doc:
    // "the softness comes from Extra Cush's top layer, not from underbuilt
    // support." If hardSeatPain didn't also fire, this person doesn't get Extra
    // Cush automatically from firmPreference alone — that's a literal reading of
    // the Thickness table, which only lists hardSeatPain as the Extra Cush
    // trigger. Flagged as a source-doc ambiguity in the routing.js file header.
  }
  // 'both' and 'not_sure': no adjustment, per doc.

  bandIndex = Math.max(0, Math.min(FIRMNESS_BANDS.length - 1, bandIndex));

  return {
    firmness: FIRMNESS_BANDS[bandIndex],
    firmnessIndex: bandIndex,
    extraCushTriggered,
    weightFallbackUsed: fallback,
  };
}

// ---------------------------------------------------------------------------
// THICKNESS (depends on firmness index from above, plus use case / height)
// ---------------------------------------------------------------------------

function routeThickness(answers, firmnessResult) {
  let { firmnessIndex, extraCushTriggered } = firmnessResult;
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');

  let thickness = 'Regular 2"';
  const notes = [];

  if (extraCushTriggered) {
    thickness = 'Extra Cush 3"';
  } else if (wantsTravel) {
    thickness = 'Low Profile 1.5"';
  }

  // Car defaults: Regular 2" for everyone unless height says otherwise.
  // Only apply car-specific logic if Extra Cush wasn't already triggered by pain.
  if (wantsCar && !extraCushTriggered) {
    if (answers.height === 'tall') {
      thickness = 'Low Profile 1.5"';
      notes.push('tall_driver_low_profile');
    } else if (answers.height === 'short') {
      notes.push('booster_cushion_note');
    }
    // regular height: no caveat, Regular 2" default stands (already set above)
  }

  // Short + car + Extra Cush already triggered -> prefer Low Profile over Extra
  // Cush for the car use case (flagged as a tradeoff, not silently decided).
  if (extraCushTriggered && wantsCar && answers.height === 'short') {
    notes.push('short_car_extracush_tradeoff');
    // Per doc: "Don't auto-downgrade — flag it and let them decide." We leave
    // thickness as Extra Cush 3" but surface the tradeoff note for the AI/result
    // message to explain, rather than silently swapping to Low Profile here.
  }

  // Height + Extra Cush + car caveat (regardless of short/tall bucket specifics)
  if (extraCushTriggered && wantsCar) {
    notes.push('extracush_car_height_caveat');
  }

  // Extra Cush doesn't fold - flag tradeoff if travel is also indicated
  if (extraCushTriggered && wantsTravel) {
    notes.push('extracush_travel_tradeoff');
  }

  // Low Profile availability constraint: only Medium Plus / Firm / Extra Firm
  // (indices 2, 3, 4). If the computed band is Soft or Medium and thickness
  // landed on Low Profile, fall back to Regular 2" and note why.
  // ASSUMPTION: the source doc doesn't explicitly state what happens in this
  // case — this fallback is inferred, not written in Structure v4. Flag before
  // launch.
  if (thickness === 'Low Profile 1.5"' && firmnessIndex < 2) {
    thickness = 'Regular 2"';
    notes.push('low_profile_unavailable_at_band');
  } else if (thickness === 'Low Profile 1.5"') {
    // Firmness bump: whenever Low Profile is the result, bump the band up one,
    // regardless of why Low Profile was chosen (Structure v4 §3, "Low Profile —
    // firmness bump applies whenever it's selected, regardless of why").
    firmnessIndex = Math.min(firmnessIndex + 1, FIRMNESS_BANDS.length - 1);
    notes.push('low_profile_firmness_bump');
  }

  return { thickness, firmnessIndex, notes };
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
// SECOND CUSHION
// ---------------------------------------------------------------------------

function routeSecondCushion(answers, size, thickness) {
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsHome = useCase.includes('one_chair') || useCase.includes('office_desk');

  if (size === '18" (Larger Size)' && wantsTravel) {
    return {
      trigger: '18in_plus_travel',
      suggestion: {
        size: '16" (Regular Size)', // ASSUMPTION: Low Profile assumed 16"-only; not stated in doc
        thickness: 'Low Profile 1.5"',
      },
      note: '18" stays put — pair it with a Low Profile for travel.',
    };
  }

  if (wantsHome && wantsTravel && thickness !== 'Low Profile 1.5"') {
    return {
      trigger: 'home_plus_travel',
      suggestion: { size, thickness: 'Low Profile 1.5"' },
      note: "Trudy's most common pairing: Regular for home, Low Profile for travel.",
    };
  }

  if (thickness === 'Extra Cush 3"' && wantsTravel) {
    return {
      trigger: 'extracush_plus_travel_tradeoff',
      suggestion: null, // flagged as a tradeoff, not auto-resolved - doc says
      // "flag the tradeoff directly rather than silently picking one"
      note:
        "Extra Cush doesn't fold well for travel. Worth asking which use case " +
        'matters more, or pairing it with a second, more portable cushion.',
    };
  }

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
      'routeCushion called without a valid weight bucket. The gift fork should ' +
        'redirect before reaching this function — check parseTally.js / the Tally flow.'
    );
  }

  const productResult = routeProduct(answers);
  const firmnessResult = routeFirmnessAndExtraCush(answers);
  const thicknessResult = routeThickness(answers, firmnessResult);
  const sizeResult = routeSize(answers);
  const secondCushion = routeSecondCushion(
    answers,
    sizeResult.size,
    thicknessResult.thickness
  );

  const finalFirmness = FIRMNESS_BANDS[thicknessResult.firmnessIndex];

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
  routeFirmnessAndExtraCush,
  routeThickness,
  routeSize,
  routeSecondCushion,
  WEIGHT_BUCKETS,
  FIRMNESS_BANDS,
};
