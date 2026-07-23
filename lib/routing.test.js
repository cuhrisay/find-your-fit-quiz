/**
 * Quick smoke tests for routing.js, built from the actual scenarios discussed
 * while designing the quiz. Run with: node lib/routing.test.js
 *
 * July 2026 revision notes (docs/CYA_Fit_Quiz_Structure_v5.md):
 * - hardSeatPain is no longer a separate answer - selecting buttocks/hips/
 *   thighs_hamstrings on the pain-location question IS the hard-seat signal.
 * - The temporary Soother rule is now duration-driven and actually reachable.
 * - Extra Cush primary requires a stated soft preference on top of hard-seat
 *   pain + a Firm/Extra Firm band; firm/unsure preference gets an
 *   also-consider instead. Nothing Extra Cush below the Firm band.
 */
const { routeCushion } = require('./routing');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
    console.log('  expected:', JSON.stringify(expected));
    console.log('  actual:  ', JSON.stringify(actual));
  }
}

function baseAnswers(overrides = {}) {
  return {
    weight: '151-169', // Medium Plus regardless of preference
    height: 'regular',
    painLocations: [],
    duration: 'over_2yr',
    oneSided: 'no',
    firmPreference: 'not_sure',
    diagnoses: [],
    useCase: ['one_chair'],
    needsMoreSpace: 'no',
    ...overrides,
  };
}

// 1. Chrisie's own case: hip pain from endo. Should be Twin Cheeks (hips is a
// forcing location), not Soother.
check(
  'Hip pain (Chrisie\'s case) -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['hips'], diagnoses: ['endometriosis'] }))
    .product,
  'Twin Cheeks'
);

// 2. Central-only pain (bladder), no diagnosis -> Soother
check(
  'Bladder-only pain, no diagnosis -> Simple Soother',
  routeCushion(baseAnswers({ painLocations: ['bladder_urethra'] })).product,
  'Simple Soother'
);

// 3. Central-only pain + pudendal neuralgia -> bumped to Twin Cheeks
check(
  'Bladder-only pain + pudendal neuralgia -> Twin Cheeks',
  routeCushion(
    baseAnswers({
      painLocations: ['bladder_urethra'],
      diagnoses: ['pudendal_neuralgia'],
    })
  ).product,
  'Twin Cheeks'
);

// 4. Central-only pain + vulvodynia only -> stays Soother (vulvodynia is NOT
// disqualifying, per Trudy's call)
check(
  'Genital pain + vulvodynia only -> Simple Soother',
  routeCushion(
    baseAnswers({ painLocations: ['genital_vaginal'], diagnoses: ['vulvodynia'] })
  ).product,
  'Simple Soother'
);

// 4b. NEW thighs/hamstrings option is a forcing location -> Twin Cheeks
check(
  'Thighs/hamstrings-only pain -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['thighs_hamstrings'] })).product,
  'Twin Cheeks'
);

// --- Temporary Soother framing (confirmed by Chrisie, July 2026): central-only
// pain + duration under a month + no chronic diagnosis -> same Soother product,
// but the "this may be temporary" reason instead of the generic central-only one.
{
  const r = routeCushion(
    baseAnswers({ painLocations: ['bladder_urethra'], duration: 'under_month' })
  );
  check('Central-only + recent onset -> Simple Soother', r.product, 'Simple Soother');
  check('Central-only + recent onset -> temporary framing', r.notes.product, 'temporary');
}
{
  // Recovering from surgery/childbirth is explicitly non-chronic - temporary
  // framing still applies.
  const r = routeCushion(
    baseAnswers({
      painLocations: ['genital_vaginal'],
      duration: 'under_month',
      diagnoses: ['recovering_surgery_childbirth'],
    })
  );
  check(
    'Central-only + recent onset + recovering-from-surgery -> temporary framing',
    r.notes.product,
    'temporary'
  );
}
check(
  'Central-only + recent onset + chronic diagnosis (vulvodynia) -> central-only framing, not temporary',
  routeCushion(
    baseAnswers({
      painLocations: ['bladder_urethra'],
      duration: 'under_month',
      diagnoses: ['vulvodynia'],
    })
  ).notes.product,
  'central_only'
);
check(
  'Central-only + long duration -> central-only framing',
  routeCushion(
    baseAnswers({ painLocations: ['bladder_urethra'], duration: 'over_2yr' })
  ).notes.product,
  'central_only'
);
check(
  'Recent onset but tailbone pain -> still Twin Cheeks (temporary rule is central-only)',
  routeCushion(
    baseAnswers({ painLocations: ['tailbone'], duration: 'under_month' })
  ).product,
  'Twin Cheeks'
);

// 5. One-sided pain -> Twin Cheeks + custom note present, never Custom itself
{
  const r = routeCushion(baseAnswers({ oneSided: 'yes', painLocations: ['sit_bones'] }));
  check('One-sided pain -> product is Twin Cheeks', r.product, 'Twin Cheeks');
  check('One-sided pain -> custom note present', r.notes.customNote !== null, true);
}

// 6. Wheelchair alone no longer forces 18" - default to 16" unless they
// confidently say Yes to needing more space (per Chrisie's new philosophy)
check(
  'Wheelchair use + needsMoreSpace=no -> 16" (wheelchair alone no longer forces 18")',
  routeCushion(baseAnswers({ useCase: ['wheelchair'], needsMoreSpace: 'no' })).size,
  '16" (Regular Size)'
);

// 6b. Wheelchair + heavy + needsMoreSpace=no -> still 16", but with a caveat
// note suggesting they double-check their wheelchair's seat width
{
  const r = routeCushion(
    baseAnswers({ useCase: ['wheelchair'], needsMoreSpace: 'no', weight: '181-200' })
  );
  check('Wheelchair + heavy + no -> still defaults to 16"', r.size, '16" (Regular Size)');
  check(
    'Wheelchair + heavy + no -> wide-seat caveat note present',
    r.notes.size.includes('wheelchair_recliner_wide_seat_check'),
    true
  );
}

// 7. Over 220 lbs alone no longer forces 18" - same new philosophy
check(
  'Over 220 lbs + needsMoreSpace=no -> 16" (weight alone no longer forces 18")',
  routeCushion(baseAnswers({ weight: 'over220', needsMoreSpace: 'no' })).size,
  '16" (Regular Size)'
);

// 8. Confident "Yes" to needing more space -> 18", even if tall - trust the
// direct answer over inferred signals like height
check(
  'Tall + needsMoreSpace=yes -> still 18" (trust the direct answer)',
  routeCushion(
    baseAnswers({ height: 'tall', needsMoreSpace: 'yes', weight: '120-129' })
  ).size,
  '18" (Larger Size)'
);

// 9. Not tall + says yes to needing more space -> 18"
check(
  'Not tall + needsMoreSpace=yes -> 18"',
  routeCushion(baseAnswers({ height: 'regular', needsMoreSpace: 'yes' })).size,
  '18" (Larger Size)'
);

// 9b. Confident Yes always gets the "make sure you really need it" caveat note
check(
  'needsMoreSpace=yes -> confirm-18in-needed note present',
  routeCushion(baseAnswers({ needsMoreSpace: 'yes' })).notes.size.includes('confirm_18in_needed'),
  true
);

// --- Weight bucket + preference firmness table (routeFirmness / baseFirmnessForWeight) ---
// Exhaustive: every bucket x every preference column, matching Chrisie's table exactly.
const FIRMNESS_TABLE_TESTS = [
  { weight: 'under120', pref: 'firm', expected: 'Medium' },
  { weight: 'under120', pref: 'soft', expected: 'Soft' },
  { weight: 'under120', pref: 'not_sure', expected: 'Soft' },
  { weight: '120-129', pref: 'firm', expected: 'Medium' },
  { weight: '120-129', pref: 'soft', expected: 'Medium' },
  { weight: '120-129', pref: 'not_sure', expected: 'Medium' },
  { weight: '130-139', pref: 'firm', expected: 'Medium Plus' },
  { weight: '130-139', pref: 'soft', expected: 'Medium' },
  { weight: '130-139', pref: 'not_sure', expected: 'Medium' },
  { weight: '140-150', pref: 'firm', expected: 'Medium Plus' },
  { weight: '140-150', pref: 'soft', expected: 'Medium' },
  { weight: '140-150', pref: 'not_sure', expected: 'Medium Plus' },
  { weight: '151-169', pref: 'firm', expected: 'Medium Plus' },
  { weight: '151-169', pref: 'soft', expected: 'Medium Plus' },
  { weight: '151-169', pref: 'not_sure', expected: 'Medium Plus' },
  { weight: '170-180', pref: 'firm', expected: 'Firm' },
  { weight: '170-180', pref: 'soft', expected: 'Medium Plus' },
  { weight: '170-180', pref: 'not_sure', expected: 'Medium Plus' },
  { weight: '181-200', pref: 'firm', expected: 'Firm' },
  { weight: '181-200', pref: 'soft', expected: 'Firm' },
  { weight: '181-200', pref: 'not_sure', expected: 'Firm' },
  { weight: '201-220', pref: 'firm', expected: 'Extra Firm' },
  { weight: '201-220', pref: 'soft', expected: 'Firm' },
  { weight: '201-220', pref: 'not_sure', expected: 'Firm' },
  { weight: 'over220', pref: 'firm', expected: 'Extra Firm' },
  { weight: 'over220', pref: 'soft', expected: 'Extra Firm' },
  { weight: 'over220', pref: 'not_sure', expected: 'Extra Firm' },
];
FIRMNESS_TABLE_TESTS.forEach(({ weight, pref, expected }) => {
  check(
    `Weight bucket '${weight}' + pref '${pref}' -> ${expected}`,
    routeCushion(baseAnswers({ weight, firmPreference: pref })).firmness,
    expected
  );
});

// Any unrecognized/unexpected preference value should still safely fall back
// to the neutral column rather than erroring.
check(
  'Unrecognized firm preference falls back to neutral column',
  routeCushion(baseAnswers({ weight: '140-150', firmPreference: 'unexpected_value' })).firmness,
  'Medium Plus'
);

// --- Extra Cush (per Chrisie, July 2026): primary needs hard-seat pain AND a
// Firm/Extra Firm band AND a soft preference. Firm/unsure preference at those
// bands gets an also-consider. Nothing below the Firm band, ever. ---

// Soft pref + hard-seat pain + Firm band -> Extra Cush primary, bumped to Extra Firm.
// (This is Chrisie's 210-lb example: 201-220 + soft pref = Firm band; hip
// sensitivity on hard seats then upgrades to Extra Cush.)
{
  const r = routeCushion(
    baseAnswers({ weight: '201-220', firmPreference: 'soft', painLocations: ['hips'] })
  );
  check('Soft pref + hard-seat pain at Firm band -> Extra Cush primary', r.thickness, 'Extra Cush 3"');
  check('Extra Cush primary from Firm -> bumped to Extra Firm', r.firmness, 'Extra Firm');
  check(
    'Extra Cush primary note present',
    r.notes.thickness.includes('extra_cush_primary'),
    true
  );
}

// Soft pref + hard-seat pain + already-Extra-Firm band -> primary, no bump needed
{
  const r = routeCushion(
    baseAnswers({ weight: 'over220', firmPreference: 'soft', painLocations: ['buttocks'] })
  );
  check('Soft pref + hard-seat pain at Extra Firm band -> Extra Cush primary', r.thickness, 'Extra Cush 3"');
  check('Already Extra Firm -> stays Extra Firm', r.firmness, 'Extra Firm');
}

// FIRM pref + hard-seat pain + Firm band -> keeps their firm cushion, Extra
// Cush offered as a gentle also-consider (they may find it very firm later)
{
  const r = routeCushion(
    baseAnswers({ weight: '181-200', firmPreference: 'firm', painLocations: ['hips'] })
  );
  check('Firm pref + hard-seat pain at Firm band -> thickness stays Regular', r.thickness, 'Regular 2"');
  check('Firm pref + hard-seat pain at Firm band -> firmness stays Firm', r.firmness, 'Firm');
  check(
    'Firm pref + hard-seat pain at Firm band -> Extra Cush also-consider',
    r.secondCushion && r.secondCushion.trigger,
    'extra_cush_also_consider'
  );
}

// Unsure pref + hard-seat pain + Firm band -> same also-consider treatment
check(
  'Unsure pref + hard-seat pain at Firm band -> Extra Cush also-consider',
  routeCushion(baseAnswers({ weight: '181-200', painLocations: ['hips'] })).secondCushion.trigger,
  'extra_cush_also_consider'
);

// Hard-seat pain at Medium Plus -> no Extra Cush mention at all anymore
{
  const r = routeCushion(baseAnswers({ weight: '151-169', painLocations: ['hips'] }));
  check('Hard-seat pain at Medium Plus -> thickness stays Regular', r.thickness, 'Regular 2"');
  check('Hard-seat pain at Medium Plus -> no Extra Cush mention', r.secondCushion, null);
}

// Soft preference alone (no hard-seat pain) -> no Extra Cush mention either
check(
  'Soft preference without hard-seat pain -> no Extra Cush mention',
  routeCushion(baseAnswers({ weight: '140-150', firmPreference: 'soft' })).secondCushion,
  null
);

// Hard-seat pain + travel: support NEED beats compactness WANT - stays on
// Regular (not Low Profile), and Low Profile is never mentioned at all.
{
  const r = routeCushion(
    baseAnswers({ weight: '151-169', painLocations: ['hips'], useCase: ['traveling'] })
  );
  check(
    'Hard-seat pain at Medium Plus + travel -> stays on Regular (not Low Profile)',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Hard-seat pain at Medium Plus + travel -> hardseatpain-over-travel note present',
    r.notes.thickness.includes('hardseatpain_over_travel_stayed_regular'),
    true
  );
  check(
    'Hard-seat pain at Medium Plus + travel -> no secondCushion (Low Profile never mentioned)',
    r.secondCushion,
    null
  );
}

// Firm pref + hard-seat pain at Firm band + travel -> stays Regular (Extra
// Cush primary needs soft pref; Low Profile is blocked by the pain; the
// also-consider is suppressed for travel)
{
  const r = routeCushion(
    baseAnswers({
      weight: '181-200',
      firmPreference: 'firm',
      painLocations: ['hips'],
      useCase: ['traveling'],
    })
  );
  check(
    'Firm pref + hard-seat pain at Firm band + travel -> stays on Regular',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Firm pref + hard-seat pain at Firm band + travel -> no secondCushion at all',
    r.secondCushion,
    null
  );
}

// Hard-seat pain at Soft band + travel: Low Profile was never available here
// regardless (Soft band) - falls back to Regular via the availability check.
{
  const r = routeCushion(
    baseAnswers({ weight: 'under120', painLocations: ['hips'], useCase: ['traveling'] })
  );
  check('Hard-seat pain at Soft band + travel -> Regular (Low Profile never fits)', r.thickness, 'Regular 2"');
  check(
    'Hard-seat pain at Soft band + travel -> unavailable-at-band note, not the hardseatpain-specific one',
    r.notes.thickness.includes('low_profile_unavailable_at_band') &&
      !r.notes.thickness.includes('hardseatpain_over_travel_stayed_regular'),
    true
  );
}

// Extra Cush primary + travel -> never swap away silently; flat tradeoff note,
// never a Low Profile suggestion (their hard-seat pain rules it out).
{
  const r = routeCushion(
    baseAnswers({
      weight: '181-200',
      firmPreference: 'soft',
      painLocations: ['hips'],
      useCase: ['traveling'],
    })
  );
  check('Extra Cush primary + travel -> thickness stays Extra Cush (no swap)', r.thickness, 'Extra Cush 3"');
  check(
    'Extra Cush primary + travel -> conflict note present',
    r.notes.thickness.includes('extra_cush_travel_car_conflict'),
    true
  );
  check(
    'Extra Cush primary + travel -> no Low Profile suggestion',
    r.secondCushion && r.secondCushion.suggestion,
    null
  );
  check(
    'Extra Cush primary + travel -> flat tradeoff trigger name',
    r.secondCushion.trigger,
    'extracush_plus_travel_car_tradeoff'
  );
}

// Extra Cush primary + car -> same handling
{
  const r = routeCushion(
    baseAnswers({
      weight: '181-200',
      firmPreference: 'soft',
      painLocations: ['buttocks'],
      useCase: ['car_truck'],
    })
  );
  check('Extra Cush primary + car -> thickness stays Extra Cush (no swap)', r.thickness, 'Extra Cush 3"');
  check(
    'Extra Cush primary + car -> conflict note present',
    r.notes.thickness.includes('extra_cush_travel_car_conflict'),
    true
  );
}

// Extra Cush primary from an ALREADY-Extra-Firm base band + travel -> same flat "no"
{
  const r = routeCushion(
    baseAnswers({
      weight: 'over220',
      firmPreference: 'soft',
      painLocations: ['hips'],
      useCase: ['traveling'],
    })
  );
  check(
    'Extra Cush primary (already Extra Firm) + travel -> no Low Profile suggestion at all',
    r.secondCushion && r.secondCushion.suggestion,
    null
  );
  check(
    'Extra Cush primary (already Extra Firm) + travel -> flat tradeoff trigger name',
    r.secondCushion.trigger,
    'extracush_plus_travel_car_tradeoff'
  );
}

// 12. Low Profile firmness bump: traveling at Medium Plus should bump to Firm
{
  const r = routeCushion(baseAnswers({ weight: '151-169', useCase: ['traveling'] }));
  check('Travel at Medium Plus -> thickness is Low Profile', r.thickness, 'Low Profile 1.5"');
  check('Travel bumps firmness up one band (Medium Plus -> Firm)', r.firmness, 'Firm');
  check(
    'No soft-preference tradeoff note when preference is not_sure',
    r.notes.thickness.includes('low_profile_soft_preference_tradeoff'),
    false
  );
}

// Soft-preference tradeoff note: travel + soft preference -> Low Profile still
// primary (they qualify), but flagged that it won't be as soft as they want
{
  const r = routeCushion(
    baseAnswers({ weight: '151-169', firmPreference: 'soft', useCase: ['traveling'] })
  );
  check('Travel + soft preference -> Low Profile still primary', r.thickness, 'Low Profile 1.5"');
  check(
    'Travel + soft preference -> soft tradeoff note present',
    r.notes.thickness.includes('low_profile_soft_preference_tradeoff'),
    true
  );
}

// Same tradeoff note for tall + driving + soft preference
{
  const r = routeCushion(
    baseAnswers({ height: 'tall', firmPreference: 'soft', useCase: ['car_truck'] })
  );
  check('Tall + driving + soft preference -> Low Profile still primary', r.thickness, 'Low Profile 1.5"');
  check(
    'Tall + driving + soft preference -> soft tradeoff note present',
    r.notes.thickness.includes('low_profile_soft_preference_tradeoff'),
    true
  );
}

// 13. Low Profile unavailable at Soft -> falls back to Regular with a note,
// and the superseded travel_low_profile note is REMOVED (otherwise the
// composed message would recommend Low Profile and Regular in the same breath)
{
  const r = routeCushion(baseAnswers({ weight: 'under120', useCase: ['traveling'] }));
  check(
    'Travel at Soft band -> falls back to Regular 2" (Low Profile unavailable)',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Fallback note present',
    r.notes.thickness.includes('low_profile_unavailable_at_band'),
    true
  );
  check(
    'Superseded travel_low_profile note removed',
    r.notes.thickness.includes('travel_low_profile'),
    false
  );
}

// 14. Tall driver -> Low Profile suggested for car
check(
  'Tall + car -> Low Profile suggested',
  routeCushion(baseAnswers({ height: 'tall', useCase: ['car_truck'] })).thickness,
  'Low Profile 1.5"'
);

// 15. Never recommend Custom as the product itself
{
  const r = routeCushion(baseAnswers({ oneSided: 'yes', painLocations: ['sit_bones'] }));
  check('Custom is never the product itself', r.product !== 'Custom', true);
}

// 16. Wheelchair + 18" (confident yes) + travel -> no product suggestion (the
// wheelchair itself travels with them), but still a note about the tension
{
  const r = routeCushion(
    baseAnswers({ useCase: ['wheelchair', 'traveling'], needsMoreSpace: 'yes' })
  );
  check('Wheelchair + 18" + travel -> size is 18"', r.size, '18" (Larger Size)');
  check(
    'Wheelchair + 18" + travel -> no product suggestion, just a note',
    r.secondCushion && r.secondCushion.suggestion,
    null
  );
  check(
    'Wheelchair + 18" + travel -> correct trigger name',
    r.secondCushion.trigger,
    'wheelchair_travels_with_them'
  );
}

// 16b. Recliner + 18" (confident yes) + travel -> Low Profile IS worth
// suggesting (a recliner doesn't travel with them the way a wheelchair does),
// as long as their firmness still allows it
{
  const r = routeCushion(
    baseAnswers({ useCase: ['recliner_couch', 'traveling'], needsMoreSpace: 'yes' })
  );
  check('Recliner + 18" + travel -> size is 18"', r.size, '18" (Larger Size)');
  check(
    'Recliner + 18" + travel -> Low Profile offered as also-consider',
    r.secondCushion && r.secondCushion.suggestion && r.secondCushion.suggestion.thickness,
    'Low Profile 1.5"'
  );
  check(
    'Recliner + 18" + travel -> correct trigger name',
    r.secondCushion.trigger,
    'recliner_plus_travel_lowprofile_also_consider'
  );
}

// 16c. Recliner + 18" + travel, but too heavy for Low Profile -> no
// suggestion, just a tradeoff note (same firmness gating as everywhere else)
{
  const r = routeCushion(
    baseAnswers({
      useCase: ['recliner_couch', 'traveling'],
      needsMoreSpace: 'yes',
      weight: 'over220',
    })
  );
  check(
    'Recliner + 18" + travel + Extra Firm -> no Low Profile suggestion',
    r.secondCushion && r.secondCushion.suggestion,
    null
  );
  check(
    'Recliner + 18" + travel + Extra Firm -> tradeoff trigger name',
    r.secondCushion.trigger,
    'recliner_plus_travel_tradeoff'
  );
}

// 16d. Second cushion: Extra Firm blocks Low Profile suggestion even for home+travel
{
  const r = routeCushion(
    baseAnswers({ weight: 'over220', useCase: ['one_chair', 'traveling'] })
  );
  check('Extra Firm band -> no Low Profile second cushion suggested', r.secondCushion, null);
}

// 16e. Second cushion: Soft blocks Low Profile suggestion even for home+travel
{
  const r = routeCushion(
    baseAnswers({ weight: 'under120', useCase: ['one_chair', 'traveling'] })
  );
  check('Soft band -> no Low Profile second cushion suggested', r.secondCushion, null);
}

// 17. Soother always includes the upgrade line
{
  const r = routeCushion(baseAnswers({ painLocations: ['bladder_urethra'] }));
  check(
    'Soother result always includes upgrade line',
    r.notes.soatherUpgradeLine !== null,
    true
  );
}

// 17b. Soother is a single fixed product - it must never carry Twin Cheeks
// specs (bands/thicknesses/sizes that don't exist on the Soother page).
// Per the live product page: SS Medium for 140 lbs and under, SS Firm above.
{
  const r = routeCushion(
    baseAnswers({ painLocations: ['bladder_urethra'], weight: '130-139', useCase: ['traveling'] })
  );
  check('Soother at 130-139 lbs -> Medium', r.firmness, 'Medium');
  check('Soother thickness is always 3"', r.thickness, '3"');
  check('Soother size is always One Size', r.size, 'One Size');
  check('Soother never gets thickness notes (no Low Profile talk)', r.notes.thickness, []);
  check('Soother never gets a second-cushion suggestion', r.secondCushion, null);
}
check(
  'Soother at 151-169 lbs -> Firm',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], weight: '151-169' })).firmness,
  'Firm'
);

// 18. Every result includes break-in and return policy regardless of routing
{
  const r = routeCushion(baseAnswers());
  check('Every result includes break-in note', typeof r.alwaysInclude.breakIn, 'string');
  check(
    'Every result includes return policy note',
    typeof r.alwaysInclude.returnPolicy,
    'string'
  );
}

// 19. The $8 exchange note was removed entirely per Chrisie's feedback (it
// duplicated the return policy and she didn't want the fee mentioned) -
// alwaysInclude no longer has an exchangeNote field at all.
check(
  'alwaysInclude has no exchangeNote field',
  routeCushion(baseAnswers()).alwaysInclude.exchangeNote,
  undefined
);

// Tall + driving variant of the hard-seat-pain-vs-compactness conflict
{
  const r = routeCushion(
    baseAnswers({ height: 'tall', painLocations: ['hips'], useCase: ['car_truck'] })
  );
  check(
    'Hard-seat pain + tall driving at Medium Plus -> stays on Regular',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Hard-seat pain + tall driving -> no secondCushion (Low Profile never mentioned)',
    r.secondCushion,
    null
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
