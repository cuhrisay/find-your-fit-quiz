/**
 * routing.js
 * ----------
 * Deterministic cushion routing for the CYA "Find Your Fit" quiz.
 * Code picks the cushion; the AI (groq.js) only writes the free-text reply.
 * The full, human-readable rules live in docs/CYA_Fit_Quiz_Structure_v5.md —
 * keep this file and that doc in sync.
 *
 * Input: a normalized `answers` object (see parseTally.js).
 * Output: { product, firmness, size, thickness, secondCushion, notes, alwaysInclude }.
 */

const FIRMNESS_BANDS = ['Soft', 'Medium', 'Medium Plus', 'Firm', 'Extra Firm'];

// Weight bucket x firmness preference -> base firmness band (Twin Cheeks only).
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

function baseFirmnessForWeight(weightBucket, firmPreference) {
  const row = WEIGHT_FIRMNESS_TABLE[weightBucket];
  if (!row) return null;
  const column =
    firmPreference === 'firm' ? 'firm' : firmPreference === 'soft' ? 'soft' : 'neutral';
  return row[column];
}

// ---------------------------------------------------------------------------
// Pain-location and diagnosis groups (July 2026 rewrite, Trudy-confirmed)
// ---------------------------------------------------------------------------

// Central pain the Simple Soother's single cutout can address on its own.
// Perineum and prostate are deliberately NOT here (they stay Twin Cheeks).
const CENTRAL_LOCATIONS = ['groin', 'genital_vaginal', 'bladder_urethra', 'rectal'];

// Places a firm/hard seat directly hurts. These make someone an Extra Cush
// candidate, and mean Low Profile is never offered (not supportive enough).
const HARD_SURFACE_LOCATIONS = ['sit_bones', 'hips', 'buttocks', 'thighs_hamstrings'];

// Diagnoses that imply pain beyond a single central spot -> force Twin Cheeks
// even when the reported pain is central-only. (IC and vulvodynia are NOT here:
// Trudy considers the Soother a good fit for them.)
const SOOTHER_INCOMPATIBLE_DIAGNOSES = [
  'pudendal_neuralgia', 'pelvic_floor_dysfunction', 'endometriosis',
  'pelvic_girdle_pain', 'coccydynia', 'vaginismus', 'prostatitis_cpps',
];

// Weight thresholds.
const EXTRA_CUSH_MIN = ['170-180', '181-200', '201-220', 'over220']; // >= 170 lb
const LOW_PROFILE_OK = [
  'under120', '120-129', '130-139', '140-150', '151-169', '170-180', '181-200',
]; // <= 200 lb; over 200 the foam isn't supportive enough (Trudy)

// Heavier buckets used only for the informational wheelchair/recliner wide-seat note.
const HEAVY_WEIGHT_BUCKETS = ['170-180', '181-200', '201-220', 'over220'];

function hasHardSurfacePain(answers) {
  return (answers.painLocations || []).some((l) => HARD_SURFACE_LOCATIONS.includes(l));
}

// ---------------------------------------------------------------------------
// PRODUCT — Twin Cheeks (default) vs Simple Soother
// ---------------------------------------------------------------------------

function routeProduct(answers) {
  const locations = answers.painLocations || [];
  const diagnoses = answers.diagnoses || [];

  // Soother needs: at least one location, ALL of them central (a tight cluster
  // of central spots is fine), no diagnosis implying wider pain, a duration
  // that isn't long-established, and no confident need for more room - the
  // Soother is a single fixed size, so it can't serve someone who needs 18".
  const allCentral =
    locations.length > 0 && locations.every((l) => CENTRAL_LOCATIONS.includes(l));
  const incompatibleDx = diagnoses.some((d) => SOOTHER_INCOMPATIBLE_DIAGNOSES.includes(d));
  const durationOk =
    answers.duration !== 'over_2yr' &&
    (answers.duration !== '6mo_2yr' || diagnoses.includes('recovering_surgery_childbirth'));
  const needsSpaceOk = answers.needsMoreSpace !== 'yes';

  let product = 'Twin Cheeks';
  let sootherReason = null;
  let spaceBumpedFromSoother = false;
  if (allCentral && !incompatibleDx && durationOk) {
    if (needsSpaceOk) {
      product = 'Simple Soother';
      const recent = answers.duration === 'under_month' || answers.duration === '1_6_months';
      const recovering = diagnoses.includes('recovering_surgery_childbirth');
      sootherReason = recent || recovering ? 'temporary' : 'central_only';
    } else {
      // Pain pattern alone would have qualified them - flagged so the message
      // can be honest about why they got the pricier option anyway.
      spaceBumpedFromSoother = true;
    }
  }

  const sootherUpgradeLine =
    product === 'Simple Soother'
      ? "If this doesn't feel like enough, Twin Cheeks is an easy upgrade — just let us know."
      : null;

  return { product, sootherReason, sootherUpgradeLine, spaceBumpedFromSoother };
}

// ---------------------------------------------------------------------------
// FIRMNESS (Twin Cheeks) — weight x preference lookup
// ---------------------------------------------------------------------------

function routeFirmness(answers) {
  const band = baseFirmnessForWeight(answers.weight, answers.firmPreference) || 'Medium Plus';
  return { firmness: band, firmnessIndex: FIRMNESS_BANDS.indexOf(band) };
}

// ---------------------------------------------------------------------------
// THICKNESS (Twin Cheeks) — Regular / Low Profile / Extra Cush
// ---------------------------------------------------------------------------

/**
 * @param {object} answers
 * @param {object} firmnessResult - routeFirmness() output
 * @param {string} size - routeSize().size (18" never comes in Low Profile)
 */
function routeThickness(answers, firmnessResult, size) {
  const useCase = answers.useCase || [];
  const wantsTravel = useCase.includes('traveling') || useCase.includes('public_places');
  const wantsCar = useCase.includes('car_truck');
  const hasStationaryUse =
    useCase.includes('one_chair') || useCase.includes('office_desk') ||
    useCase.includes('recliner_couch') || useCase.includes('wheelchair');
  const pref = answers.firmPreference;
  const hardSurface = hasHardSurfacePain(answers);
  const heavyForCush = EXTRA_CUSH_MIN.includes(answers.weight);
  const is18 = size === '18" (Larger Size)';

  // Low Profile: <=200 lb, never for hard-surface pain (not supportive enough),
  // never in 18". Firmness bumps up one band (shorter foam has to be firmer to
  // support the same weight), capped at Firm (LP isn't made in Extra Firm).
  const lpEligible = LOW_PROFILE_OK.includes(answers.weight) && !hardSurface && !is18;
  const lpFirmnessIndex = Math.min(firmnessResult.firmnessIndex + 1, 3);

  let thickness = 'Regular 2"';
  let firmnessIndex = firmnessResult.firmnessIndex;
  let extraCushPrimary = false;
  const notes = [];

  if (heavyForCush && pref === 'soft') {
    // Cushy preference at 170+: a plain Firm/Extra Firm seat can feel hard.
    // Extra Cush = Extra Firm base + cushy top = the support they need with
    // the feel they want. Only fabric is Extra Firm, so the band matches.
    thickness = 'Extra Cush 3"';
    firmnessIndex = FIRMNESS_BANDS.indexOf('Extra Firm');
    extraCushPrimary = true;
    notes.push('extra_cush_primary');
    if (wantsCar) notes.push('extra_cush_car_caveat');
    else if (wantsTravel) notes.push('extra_cush_travel_caveat');
  } else if (wantsTravel && !hasStationaryUse && lpEligible) {
    // Travel is the dominant need and they qualify -> Low Profile is the pick.
    thickness = 'Low Profile 1.5"';
    firmnessIndex = lpFirmnessIndex;
    notes.push('low_profile_primary');
  } else {
    // Regular 2" default. Offer Extra Cush in a note when relevant (it adds
    // height, so it's never the silent default). Suppressed when they need
    // travel — Extra Cush is bulky to pack.
    if (heavyForCush && !wantsTravel) {
      if (pref === 'not_sure') notes.push('extra_cush_also_consider_unsure');
      else if (pref === 'firm' && hardSurface) notes.push('extra_cush_also_consider_firm');
    }
    if (wantsTravel && !LOW_PROFILE_OK.includes(answers.weight) && !hardSurface) {
      notes.push('low_profile_over200'); // wanted compact but too heavy for LP
    }
  }

  return {
    thickness,
    firmnessIndex,
    notes,
    extraCushPrimary,
    lpEligible,
    lpFirmnessIndex,
    wantsTravel,
    wantsCar,
    hardSurface,
  };
}

// ---------------------------------------------------------------------------
// SIZE — 16" default, 18" only on a confident "yes"
// ---------------------------------------------------------------------------

function routeSize(answers) {
  const useCase = answers.useCase || [];
  const notes = [];

  if (answers.needsMoreSpace === 'yes') {
    // EIGHTEEN_INCH_EXPLANATION (always shown at 18") already carries the
    // gut-check - no separate note needed here.
    return { size: '18" (Larger Size)', notes };
  }

  const usesWheelchairOrRecliner =
    useCase.includes('wheelchair') || useCase.includes('recliner_couch');
  const isLikelyLargeBottomed =
    HEAVY_WEIGHT_BUCKETS.includes(answers.weight) && answers.height !== 'tall';
  if (usesWheelchairOrRecliner && isLikelyLargeBottomed) {
    notes.push('wheelchair_recliner_wide_seat_check');
  }

  // "Not sure" + a supporting signal (heavier build, or thigh pain - a
  // seat-width complaint in disguise) -> a gentle nudge toward 18", not an
  // automatic upgrade. Weight/thigh pain are proxies, not proof, so a
  // confident "no" is never second-guessed this way.
  if (answers.needsMoreSpace === 'sometimes') {
    const heavier = HEAVY_WEIGHT_BUCKETS.includes(answers.weight);
    const thighPain = (answers.painLocations || []).includes('thighs_hamstrings');
    if (heavier || thighPain) {
      notes.push('consider_18in_not_sure');
    }
  }

  return { size: '16" (Regular Size)', notes };
}

// ---------------------------------------------------------------------------
// SECOND CUSHION — a Low Profile companion, only when it genuinely helps
// ---------------------------------------------------------------------------

function routeSecondCushion(answers, size, thicknessResult) {
  const { thickness, lpEligible, lpFirmnessIndex, wantsTravel, wantsCar, hardSurface } =
    thicknessResult;
  const useCase = answers.useCase || [];
  const usesWheelchair = useCase.includes('wheelchair');
  const is18 = size === '18" (Larger Size)';
  const lpFirmness = FIRMNESS_BANDS[lpFirmnessIndex];
  const lpWeightOk = LOW_PROFILE_OK.includes(answers.weight);

  // 18" + travel: the 18" doesn't come in Low Profile, so the travel need
  // wants a separate compact cushion.
  if (is18 && wantsTravel) {
    if (usesWheelchair) {
      return {
        trigger: 'wheelchair_travels_with_them',
        suggestion: null,
        note:
          "Your wheelchair travels with you, so a separate compact cushion isn't " +
          'necessary — the 18" rides along wherever you go.',
      };
    }
    if (lpWeightOk && !hardSurface) {
      return {
        trigger: 'eighteen_plus_travel_lp',
        suggestion: { size: '16" (Regular Size)', thickness: 'Low Profile 1.5"', firmnessRange: lpFirmness },
        note:
          'The 18" is great where you sit most, but it\'s a large piece to carry ' +
          '— a Low Profile 16" is worth considering for the road.',
      };
    }
    return {
      trigger: 'eighteen_plus_travel_tradeoff',
      suggestion: null,
      note:
        'The 18" is great where you sit most, but it\'s a large piece to carry, ' +
        "and a Low Profile wouldn't support you well enough at your weight to pair with it.",
    };
  }

  // Regular is the pick, they travel or drive tall, and they qualify for Low
  // Profile -> offer it as a compact companion (Trudy's "Regular for home,
  // Low Profile for the road" pattern).
  if (thickness === 'Regular 2"' && lpEligible && (wantsTravel || (wantsCar && answers.height === 'tall'))) {
    return {
      trigger: 'low_profile_companion',
      suggestion: { size: '16" (Regular Size)', thickness: 'Low Profile 1.5"', firmnessRange: lpFirmness },
      note:
        wantsCar && !wantsTravel
          ? 'For the car, a Low Profile 16" adds the least height if you\'d rather ' +
            'not sit up as high — its foam is one level firmer so it still supports you.'
          : 'A Low Profile 16" is worth considering for travel — it packs small, ' +
            'with its foam one level firmer so it still supports you.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// TOP-LEVEL
// ---------------------------------------------------------------------------

// Always-on messaging, shown on every result.
const BREAK_IN_NOTE =
  'Our cushions come firm and soften over time, and they take a little ' +
  'getting used to, since they hold you differently than an ordinary seat.';
const RETURN_POLICY_NOTE =
  'Returns are open for 14 days. If you need more time to try it, just email ' +
  "us before the window closes and we'll extend it — no problem.";
const EIGHTEEN_INCH_EXPLANATION =
  'The 18" is our wider size — the same design with about an extra inch of foam ' +
  'under each thigh, so your legs get full support with room to spare. It folds ' +
  "like our other cushions; it's just a larger piece to carry, so most people " +
  'keep it where they sit the most.';

function alwaysInclude(size) {
  return {
    breakIn: BREAK_IN_NOTE,
    returnPolicy: RETURN_POLICY_NOTE,
    eighteenInchExplanation: size === '18" (Larger Size)' ? EIGHTEEN_INCH_EXPLANATION : null,
  };
}

/**
 * Routes a normalized answers object to a full cushion recommendation.
 * Throws if `answers.weight` is missing/invalid or 'gift' — the gift fork
 * should redirect upstream before ever reaching this function.
 */
function routeCushion(answers) {
  if (!answers || !answers.weight || answers.weight === 'gift') {
    throw new Error(
      'routeCushion called without a valid weight. The gift fork should ' +
        'redirect before reaching this function — check parseTally.js / the Tally flow.'
    );
  }

  const productResult = routeProduct(answers);

  // The Simple Soother is a single fixed product: 3" thick, one size, only
  // Medium and Firm. Never route it through the Twin Cheeks tables. Firmness:
  // Medium under 140 lb, Firm at 140+; on the cusp (130-150) the person's
  // firmness preference breaks the tie (too firm can hurt, too soft won't hold).
  if (productResult.product === 'Simple Soother') {
    const w = answers.weight;
    let firmness = ['under120', '120-129', '130-139'].includes(w) ? 'Medium' : 'Firm';
    if (w === '130-139' && answers.firmPreference === 'firm') firmness = 'Firm';
    if (w === '140-150' && answers.firmPreference === 'soft') firmness = 'Medium';
    return {
      product: 'Simple Soother',
      firmness,
      size: 'One Size',
      thickness: '3"',
      secondCushion: null,
      notes: {
        product: productResult.sootherReason,
        sootherUpgradeLine: productResult.sootherUpgradeLine,
        spaceBumpedFromSoother: false,
        thickness: [],
        size: [],
      },
      alwaysInclude: { breakIn: BREAK_IN_NOTE, returnPolicy: RETURN_POLICY_NOTE, eighteenInchExplanation: null },
    };
  }

  const firmnessResult = routeFirmness(answers);
  const sizeResult = routeSize(answers); // before thickness: 18" blocks Low Profile
  const thicknessResult = routeThickness(answers, firmnessResult, sizeResult.size);
  const finalFirmness = FIRMNESS_BANDS[thicknessResult.firmnessIndex];
  const secondCushion = routeSecondCushion(answers, sizeResult.size, thicknessResult);

  return {
    product: 'Twin Cheeks',
    firmness: finalFirmness,
    size: sizeResult.size,
    thickness: thicknessResult.thickness,
    secondCushion,
    notes: {
      product: null,
      sootherUpgradeLine: null,
      spaceBumpedFromSoother: productResult.spaceBumpedFromSoother,
      thickness: thicknessResult.notes,
      size: sizeResult.notes,
    },
    alwaysInclude: alwaysInclude(sizeResult.size),
  };
}

module.exports = {
  routeCushion,
  routeProduct,
  routeFirmness,
  routeThickness,
  routeSize,
  routeSecondCushion,
  baseFirmnessForWeight,
  FIRMNESS_BANDS,
};
