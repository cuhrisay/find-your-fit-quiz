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
 * OPEN ITEM (awaiting Trudy): the 201-220 lb band below follows Trudy's direct
 * guidance on the call (Firm), which conflicts with the product-page copy
 * ("Extra Firm — 200 lbs and up"). Chrisie believes the overlap on the site is
 * intentional preference-nuance Trudy built up over the years; once Trudy
 * confirms, reconcile the site copy with this table (or vice versa).
 *
 * July 2026 revision (see docs/CYA_Fit_Quiz_Structure_v5.md):
 * - The hard-seat-pain question (old Screen 6) was merged into the pain-location
 *   question. "Buttocks", "Hips", and the new "Backs of my thighs / hamstrings"
 *   selections on the pain question ARE the hard-seat signal now.
 * - The temporary-condition Soother rule is now real and reachable: central-only
 *   pain + duration under a month + no chronic diagnosis -> Soother with the
 *   "this may be temporary" framing. (The old version depended on the removed
 *   recent-events question and was provably unreachable.)
 * - Extra Cush is primary ONLY when all three are true: hard-seat pain, a
 *   Firm/Extra Firm support band, and a stated soft/cushy preference. With a
 *   firm or unsure preference it's a gentle "also consider" instead. It is
 *   never mentioned below the Firm band (confirmed by Chrisie, July 2026).
 *
 * July 2026 revision, round 2 (Trudy's direct written answers, superseding a
 * piece of the original call reasoning):
 * - REMOVED the "bump Low Profile up one firmness level" rule. Asked directly
 *   ("if I have Medium Plus Regular, should I get Firm Low Profile?"), Trudy
 *   said "the same as the regular cushion" - no bump. The call quote that
 *   justified the old bump ("go shorter, go more firm") turns out to describe
 *   a different mechanism: THICKNESS (not firmness rating) is what provides
 *   perceived softness/give, because it's the depth of material available to
 *   compress into. Firmness rating is about resisting bottoming out. Low
 *   Profile has less depth, so it inherently gives less regardless of its
 *   firmness label - it doesn't need a firmer label to compensate, it just
 *   has less cushioning. This is also why Extra Cush works the way it does
 *   (soft top layer for depth/give, over an Extra Firm base for support) and
 *   why hard-seat-pain sufferers stay on Regular instead of Low Profile
 *   below (they need depth, not a firmness adjustment).
 * - ADDED: 18" never comes in Low Profile (confirmed - it's only made in
 *   Regular and Extra Cush 3"). Previously the code could recommend "18",
 *   Low Profile" as a primary result for someone who confidently needed 18"
 *   and also wanted something compact for travel - an impossible product
 *   combination. Low Profile is now blocked whenever size is 18", the same
 *   way it's already blocked outside the Medium/Medium Plus/Firm band.
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
 * @param {string} firmPreference - 'firm' | 'soft' | 'not_sure'
 * @returns {string|null} a FIRMNESS_BANDS value, or null if weightBucket is unrecognized
 */
function baseFirmnessForWeight(weightBucket, firmPreference) {
  const row = WEIGHT_FIRMNESS_TABLE[weightBucket];
  if (!row) return null;
  // The old separate "Both - depends" option was merged into "Depends / I'm
  // not sure" on the Tally form (both always resolved to the same neutral
  // column anyway), so anything that isn't explicitly firm/soft falls here.
  const column =
    firmPreference === 'firm' ? 'firm' : firmPreference === 'soft' ? 'soft' : 'neutral';
  return row[column];
}

// Screen 3 locations that force Twin Cheeks regardless of anything else
const FORCING_LOCATIONS = [
  'tailbone', 'sit_bones', 'rectal', 'hips', 'buttocks', 'thighs_hamstrings',
  'groin', 'perineum', 'prostate',
];

// Screen 3 locations that are eligible for the Soother path IF nothing else overrides
const CENTRAL_ONLY_LOCATIONS = ['bladder_urethra', 'genital_vaginal'];

// Pain-location selections that double as the "hard seats bother me" signal.
// The old standalone hard-seat question (Screen 6) was merged into the pain
// question - selecting any of these areas IS the hard-seat signal now.
const HARD_SEAT_LOCATIONS = ['buttocks', 'hips', 'thighs_hamstrings'];

/** @param {object} answers @returns {string[]} the hard-seat pain areas selected */
function hardSeatPainAreas(answers) {
  return (answers.painLocations || []).filter((loc) => HARD_SEAT_LOCATIONS.includes(loc));
}

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
      // Temporary framing (confirmed by Chrisie, July 2026): central-only pain
      // that started under a month ago, with no chronic condition named, gets
      // Trudy's "this may be temporary, start with the lower-cost option"
      // message instead of the generic central-only one. Same product either
      // way - only the explanation changes. (The old version of this rule also
      // required a recent surgery/accident answer from a since-removed
      // question, which made it unreachable; duration alone carries it now.)
      const hasChronicDiagnosis = diagnoses.some(
        (d) => !NON_CHRONIC_DIAGNOSIS_VALUES.includes(d)
      );
      soatherReason =
        answers.duration === 'under_month' && !hasChronicDiagnosis
          ? 'temporary'
          : 'central_only';
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
// THICKNESS (depends on firmness band from above, plus use case / height / size)
// ---------------------------------------------------------------------------

/**
 * @param {object} answers
 * @param {object} firmnessResult - routeFirmness()'s output
 * @param {string} size - routeSize().size, needed because 18" never comes in
 *   Low Profile (confirmed by Trudy) - has to be checked here, before Low
 *   Profile is finalized as the primary thickness.
 */
function routeThickness(answers, firmnessResult, size) {
  let firmnessIndex = firmnessResult.firmnessIndex;
  const baseBand = FIRMNESS_BANDS[firmnessIndex];
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');
  // "Wants something compact" - the actual driver behind ever considering Low
  // Profile at all: travel, or a tall driver (short/regular drivers don't need
  // Low Profile per se, per Chrisie).
  const wantsCompact = wantsTravel || (wantsCar && answers.height === 'tall');

  const hardSeatPain = hardSeatPainAreas(answers);
  const hasHardSeatPain = hardSeatPain.length > 0;

  let thickness = 'Regular 2"';
  const notes = [];
  let extraCushPrimary = false;
  // True when hard-seat pain overrode what would otherwise have been Low
  // Profile (via travel/tall-driving) - routeSecondCushion suppresses any
  // secondary suggestion in this case (Low Profile is never mentioned to
  // hard-seat pain sufferers).
  let stayedRegularForHardSeatPain = false;

  // Extra Cush only comes in Extra Firm fabric (a cushy top layer over an
  // Extra Firm base). It is the PRIMARY pick only when ALL THREE are true
  // (per Chrisie, July 2026): hard-seat pain (buttocks/hips/thighs), a base
  // band of Firm or Extra Firm (the base has to be that supportive for the
  // soft top to work), and a stated soft/cushy preference. Someone who asked
  // for a firm feel keeps their firm cushion - they get a gentle
  // "also consider" instead (see routeSecondCushion).
  if (
    hasHardSeatPain &&
    answers.firmPreference === 'soft' &&
    (baseBand === 'Firm' || baseBand === 'Extra Firm')
  ) {
    thickness = 'Extra Cush 3"';
    extraCushPrimary = true;
    // ASSUMPTION (awaiting Trudy's confirmation, safe per the site's own
    // variant list): the physical product only exists in Extra Firm, so the
    // displayed firmness has to match it.
    firmnessIndex = FIRMNESS_BANDS.indexOf('Extra Firm');
    notes.push('extra_cush_primary');
    if (wantsTravel || wantsCar) {
      // Don't silently swap away from Extra Cush - flag the conflict instead,
      // per "flag the conflict instead of silently swapping to something else."
      notes.push('extra_cush_travel_car_conflict');
    }
  } else if (hasHardSeatPain && wantsCompact && baseBand !== 'Soft') {
    // Hard-seat pain is a real support NEED, not just a comfort preference -
    // it should win over a mere compactness WANT. Staying on Regular (more
    // support than Low Profile) is the primary; Low Profile is never even
    // mentioned to hard-seat pain sufferers (per Chrisie - it genuinely
    // wouldn't hold up for them, so offering it just adds confusion).
    // Covers every band from Medium up: at Firm/Extra Firm this is the
    // firm-or-unsure-preference path (soft preference went to Extra Cush
    // above). At Soft band, the Low Profile availability check below already
    // lands them on Regular with its own note.
    thickness = 'Regular 2"';
    notes.push('hardseatpain_over_travel_stayed_regular');
    stayedRegularForHardSeatPain = true;
  } else if (wantsTravel) {
    thickness = 'Low Profile 1.5"';
    // Explicit note so the AI attributes this to travel, not to pain
    // locations/hardSeatPain (which drive product/Extra-Cush decisions, not
    // this branch) - without this, the AI has been observed inventing a false
    // connection to pain instead.
    notes.push('travel_low_profile');
  }

  // Car defaults: Regular 2" for everyone unless height says otherwise.
  // Only apply car-specific logic if Extra Cush wasn't already primary and
  // hard-seat pain didn't already keep us on Regular above.
  if (wantsCar && !extraCushPrimary && !stayedRegularForHardSeatPain) {
    if (answers.height === 'tall') {
      thickness = 'Low Profile 1.5"';
      notes.push('tall_driver_low_profile');
    } else if (answers.height === 'short') {
      notes.push('booster_cushion_note');
    }
    // regular height: no caveat, Regular 2" default stands (already set above)
  }

  // Low Profile availability constraints - two independent reasons it can be
  // unavailable, checked together since both fall back to the same Regular
  // 2" default:
  //   1. Firmness band: Chrisie confirmed the physical product only comes in
  //      Medium / Medium Plus / Firm (indices 1, 2, 3) - never Soft or Extra
  //      Firm.
  //   2. Size: Trudy confirmed 18" only comes in Regular and Extra Cush 3" -
  //      never Low Profile, regardless of what firmness band it would
  //      otherwise be.
  // Size is checked first when both apply - "18" doesn't come in Low Profile"
  // is a simpler, unconditional fact than the band nuance, so it's the more
  // useful reason to surface if both are technically true at once.
  const wantsLowProfile = thickness === 'Low Profile 1.5"';
  const lowProfileBlockedBySize = size === '18" (Larger Size)';
  const lowProfileBlockedByBand = firmnessIndex < 1 || firmnessIndex > 3;

  if (wantsLowProfile && (lowProfileBlockedBySize || lowProfileBlockedByBand)) {
    thickness = 'Regular 2"';
    // The unavailable note SUPERSEDES whichever note recommended Low Profile
    // in the first place - remove those so the composed message never says
    // "we went with the Low Profile" and "we kept you on the Regular" in the
    // same breath.
    for (const superseded of ['travel_low_profile', 'tall_driver_low_profile']) {
      const idx = notes.indexOf(superseded);
      if (idx !== -1) notes.splice(idx, 1);
    }
    notes.push(
      lowProfileBlockedBySize ? 'low_profile_unavailable_18in' : 'low_profile_unavailable_at_band'
    );
  } else if (wantsLowProfile) {
    // No firmness change here - per Trudy, Low Profile is chosen at the SAME
    // firmness Regular would be (see the header comment for why: thickness,
    // not firmness rating, is what provides give/depth).
    if (answers.firmPreference === 'soft') {
      // Per Chrisie: flag this tradeoff explicitly rather than silently
      // picking - Low Profile has less depth to give under you regardless of
      // its firmness label, so it won't feel as soft/cushy as they said they
      // want. Regular can also fold for travel/driving, just isn't as
      // compact. Let them decide which matters more.
      notes.push('low_profile_soft_preference_tradeoff');
    }
  }

  return {
    thickness,
    firmnessIndex,
    notes,
    hasHardSeatPain,
    baseBand,
    extraCushPrimary,
    stayedRegularForHardSeatPain,
  };
}

// ---------------------------------------------------------------------------
// SIZE
// ---------------------------------------------------------------------------

// ASSUMPTION: Chrisie wasn't certain of the exact threshold herself ("180lb
// and under 5'11", I don't know but basically") - using weight bucket
// 170-180 or above, combined with not being tall, as a reasonable proxy for
// "large-bottomed" here. This only affects a caveat NOTE (see below), never
// the actual size decision - flag before trusting in production.
const HEAVY_WEIGHT_BUCKETS = ['170-180', '181-200', '201-220', 'over220'];

/**
 * Per Chrisie: default to 16" - only size up to 18" when they confidently
 * need it. That need is determined almost entirely by their direct answer to
 * "Do you find yourself needing a bigger seat / more space when you sit?" -
 * wheelchair/recliner use and weight no longer force 18" on their own, they
 * only ever produce an informational caveat note.
 */
function routeSize(answers) {
  const useCase = answers.useCase || [];
  const notes = [];

  if (answers.needsMoreSpace === 'yes') {
    // Trust their direct answer even if other signals (weight/height) don't
    // obviously suggest it - but caution them, since 18" is a specialized,
    // larger product, not the safe default.
    notes.push('confirm_18in_needed');
    return { size: '18" (Larger Size)', notes };
  }

  // 'no' or "Depends / I'm not sure" both land here - default to 16".
  const usesWheelchairOrRecliner =
    useCase.includes('wheelchair') || useCase.includes('recliner_couch');
  const isLikelyLargeBottomed =
    HEAVY_WEIGHT_BUCKETS.includes(answers.weight) && answers.height !== 'tall';

  if (usesWheelchairOrRecliner && isLikelyLargeBottomed) {
    notes.push('wheelchair_recliner_wide_seat_check');
  } else if (answers.needsMoreSpace === 'no') {
    notes.push('likely_dont_need_18');
  }

  return { size: '16" (Regular Size)', notes };
}

// ---------------------------------------------------------------------------
// SECOND CUSHION / ALSO CONSIDER
// ---------------------------------------------------------------------------

function routeSecondCushion(answers, size, firmness, thicknessResult) {
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');
  const wantsCarTravelOrPublic = wantsTravel || wantsCar;
  const usesWheelchair = useCase.includes('wheelchair');
  const usesReclinerCouch = useCase.includes('recliner_couch');

  const { hasHardSeatPain, baseBand, extraCushPrimary, stayedRegularForHardSeatPain } =
    thicknessResult;

  // 18" (from a confident "yes" to needing more space) + travel: 18" never
  // comes in Low Profile (see routeThickness), so anyone who both needs 18"
  // and travels has a genuine tension between the two. A wheelchair travels
  // WITH them already, so there's no separate "need something compact"
  // scenario there - just a note acknowledging it. Everyone else (recliner
  // users, or no particular stay-put context at all) genuinely needs
  // something different at home vs. on the go, so a Low Profile companion is
  // worth suggesting, if their firmness still allows it. Recliner keeps its
  // own trigger name/wording since it's the most common real pairing
  // (Trudy's "regular for home, low profile for travel" pattern).
  if (size === '18" (Larger Size)' && wantsTravel) {
    if (usesWheelchair) {
      return {
        trigger: 'wheelchair_travels_with_them',
        suggestion: null,
        note:
          'Your wheelchair travels with you, so a separate compact cushion ' +
          "isn't necessary the way it might be otherwise — the 18\" rides " +
          'along wherever you go.',
      };
    }
    const homeContext = usesReclinerCouch ? 'your recliner at home' : 'one place';
    if (firmness !== 'Soft' && firmness !== 'Extra Firm') {
      return {
        trigger: usesReclinerCouch
          ? 'recliner_plus_travel_lowprofile_also_consider'
          : 'eighteen_plus_travel_lowprofile_also_consider',
        suggestion: {
          size: '16" (Regular Size)',
          thickness: 'Low Profile 1.5"',
          // No bump - per Trudy, Low Profile is chosen at the same firmness
          // as Regular would be (see routeThickness header comment).
          firmnessRange: firmness,
        },
        note:
          `The 18" is great for ${homeContext}, but it's a large piece to ` +
          'carry back and forth — a Low Profile is worth considering for on ' +
          'the go.',
      };
    }
    return {
      trigger: usesReclinerCouch ? 'recliner_plus_travel_tradeoff' : 'eighteen_plus_travel_tradeoff',
      suggestion: null,
      note:
        `The 18" is great for ${homeContext}, but it's a large piece to ` +
        "carry back and forth, and a Low Profile wouldn't give you enough " +
        'support at your level to make sense as a pairing.',
    };
  }

  // Hard-seat pain kept the primary on Regular instead of dropping to Low
  // Profile (support NEED beats compactness WANT). Per Chrisie: don't even
  // mention Low Profile here - it genuinely wouldn't hold up for someone with
  // hip/buttock/thigh pain on hard surfaces, so offering it as an option (even
  // caveated) just introduces confusion rather than a real solution. No
  // secondary suggestion at all - the recommendation stands confidently on
  // its own.
  if (stayedRegularForHardSeatPain) {
    return null;
  }

  // Extra Cush "also consider" (per Chrisie, July 2026): hard-seat pain at a
  // Firm/Extra Firm band, but they asked for a firm feel (or weren't sure) -
  // so Extra Cush didn't become the primary. Mention it gently anyway: the
  // real-world pattern is people ordering Firm/Extra Firm, finding it very
  // firm on sore buttocks/hips/thighs, and wishing they'd known about the
  // soft-top option. Never shown below the Firm band, never shown when Extra
  // Cush is already primary, and suppressed for car/travel/public use (it
  // doesn't fold or travel well, so it would just muddy that recommendation).
  if (
    !extraCushPrimary &&
    hasHardSeatPain &&
    !wantsCarTravelOrPublic &&
    (baseBand === 'Firm' || baseBand === 'Extra Firm')
  ) {
    return {
      trigger: 'extra_cush_also_consider',
      suggestion: { size, thickness: 'Extra Cush 3"', firmnessRange: 'Extra Firm' },
      note:
        'Our cushions come firm on purpose and soften as they break in. Since ' +
        'hard seats bother your buttocks, hips, or thighs, the Extra Cush is ' +
        'worth knowing about — it adds an extra inch of soft foam on top of ' +
        'the same Extra Firm support, for people who end up wanting a cushier ' +
        'feel without giving up support.',
    };
  }

  // Extra Cush primary + travel/car: don't silently swap away from Extra Cush.
  // Extra Cush is only ever primary because of hard-seat pain (hips/buttocks/
  // thighs), so per Chrisie's rule above, never suggest Low Profile here
  // either - it wouldn't hold up for that same pain. Just flag the tradeoff.
  if (extraCushPrimary && wantsCarTravelOrPublic) {
    return {
      trigger: 'extracush_plus_travel_car_tradeoff',
      suggestion: null, // flagged as a tradeoff, not auto-resolved
      note:
        "Extra Cush doesn't travel or fit typical car seats well, and a Low " +
        "Profile wouldn't give enough support for this level of pain to make " +
        'sense as a pairing. Regular can still fold for travel/driving, just ' +
        'not as compact.',
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

// Always-on messaging (Structure v5) - shown on every result, no exceptions.
const BREAK_IN_NOTE = 'Keep in mind — our cushions come firm and soften over time.';
const RETURN_POLICY_NOTE =
  'Returns are open for 14 days. If you need more time to try it, just email ' +
  "us before the window closes and we'll extend it — no problem.";

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

  // The Simple Soother is a single fixed product: 3" thick, one size, sold in
  // exactly two firmness options (per the live product page: "Medium for
  // 140 lbs and under, Firm for 140 to 200 lbs and up"). None of the Twin
  // Cheeks firmness bands, thickness variants, or 16"/18" sizes exist for it,
  // so a Soother result must never route through those tables - it would
  // recommend specs the person literally cannot buy on the Soother page.
  if (productResult.product === 'Simple Soother') {
    const sootherFirmness = ['under120', '120-129', '130-139'].includes(answers.weight)
      ? 'Medium'
      : 'Firm';
    return {
      product: productResult.product,
      firmness: sootherFirmness,
      size: 'One Size',
      thickness: '3"',
      secondCushion: null,
      notes: {
        product: productResult.soatherReason,
        customNote: productResult.customNote,
        soatherUpgradeLine: productResult.soatherUpgradeLine,
        thickness: [],
        size: [],
      },
      flags: { weightFallbackUsed: false },
      alwaysInclude: {
        breakIn: BREAK_IN_NOTE,
        returnPolicy: RETURN_POLICY_NOTE,
        waitlistNote: null,
        eighteenInchExplanation: null,
      },
    };
  }

  const firmnessResult = routeFirmness(answers);
  // Size is computed before thickness because thickness needs to know it -
  // Low Profile is blocked whenever size is 18" (see routeThickness).
  const sizeResult = routeSize(answers);
  const thicknessResult = routeThickness(answers, firmnessResult, sizeResult.size);
  const finalFirmness = FIRMNESS_BANDS[thicknessResult.firmnessIndex];
  const secondCushion = routeSecondCushion(answers, sizeResult.size, finalFirmness, thicknessResult);

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
    // Always-on messaging (Structure v5) - not conditional on any routing
    // outcome, shown on every result regardless of product/size/thickness.
    alwaysInclude: {
      breakIn: BREAK_IN_NOTE,
      returnPolicy: RETURN_POLICY_NOTE,
      waitlistNote:
        sizeResult.size === '18" (Larger Size)'
          ? 'This one sometimes sells out. Don\'t worry — we restock regularly. ' +
            "Add your email and we'll let you know the moment it's back."
          : null,
      // Honest, forward-looking 18" framing (reworked per Chrisie, July 2026):
      // it IS wider - say so plainly, don't claim "not bigger overall." Don't
      // compare against a 16" experience they've never had ("if your thighs
      // go sore on the standard size" presumes they've owned one). And it
      // folds like every other cushion - it's just a larger piece to carry,
      // not a "stay-in-place, not travel" product.
      eighteenInchExplanation:
        sizeResult.size === '18" (Larger Size)'
          ? 'The 18" is our wider size — the same design with about an extra ' +
            'inch of foam under each thigh, so your legs get full support ' +
            'with room to spare. It folds like our other cushions; it\'s ' +
            'just a larger piece to carry, so most people keep it where they ' +
            'sit the most.'
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
