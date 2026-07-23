/**
 * Quick smoke tests for routing.js, built from the actual scenarios discussed
 * while designing the quiz. Run with: node lib/routing.test.js
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
    hardSeatPain: ['none'],
    firmPreference: 'not_sure',
    diagnoses: [],
    tried: [],
    useCase: ['one_chair'],
    needsMoreSpace: 'no',
    recentEvents: ['none'],
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

// 5. One-sided pain -> Twin Cheeks + custom note present, never Custom itself
{
  const r = routeCushion(baseAnswers({ oneSided: 'yes', painLocations: ['sit_bones'] }));
  check('One-sided pain -> product is Twin Cheeks', r.product, 'Twin Cheeks');
  check('One-sided pain -> custom note present', r.notes.customNote !== null, true);
}

// 6. Wheelchair -> always 18", regardless of needsMoreSpace answer
check(
  'Wheelchair use -> 18" regardless of needsMoreSpace=no',
  routeCushion(baseAnswers({ useCase: ['wheelchair'], needsMoreSpace: 'no' })).size,
  '18" (Larger Size)'
);

// 7. Over 220 lbs -> always 18", even if needsMoreSpace = no
check(
  'Over 220 lbs -> 18" regardless of needsMoreSpace=no',
  routeCushion(baseAnswers({ weight: 'over220', needsMoreSpace: 'no' })).size,
  '18" (Larger Size)'
);

// 8. Tall + says yes to needing more space, but not heavy/wheelchair -> stays 16"
check(
  'Tall + needsMoreSpace=yes, not heavy -> 16" (leg length, not width)',
  routeCushion(
    baseAnswers({ height: 'tall', needsMoreSpace: 'yes', weight: '120-129' })
  ).size,
  '16" (Regular Size)'
);

// 9. Not tall + says yes to needing more space -> 18"
check(
  'Not tall + needsMoreSpace=yes -> 18"',
  routeCushion(baseAnswers({ height: 'regular', needsMoreSpace: 'yes' })).size,
  '18" (Larger Size)'
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

// ASSUMPTION: "Both — depends" isn't in Chrisie's table - treated as neutral
// (same as not_sure). Flag before trusting in production.
check(
  "Firm preference 'both' treated as neutral (ASSUMPTION, unconfirmed)",
  routeCushion(baseAnswers({ weight: '140-150', firmPreference: 'both' })).firmness,
  'Medium Plus'
);

// --- Extra Cush: now primary at Firm/Extra Firm bands with hard-seat pain,
// "also consider" at Medium/Medium Plus, never at Soft ---

// Hard-seat pain + Firm band -> Extra Cush primary, firmness bumped to Extra Firm
{
  const r = routeCushion(baseAnswers({ weight: '181-200', hardSeatPain: ['hips'] }));
  check('Hard-seat pain at Firm band -> Extra Cush primary', r.thickness, 'Extra Cush 3"');
  check('Extra Cush primary from Firm -> bumped to Extra Firm', r.firmness, 'Extra Firm');
  check(
    'Extra Cush primary note present',
    r.notes.thickness.includes('extra_cush_primary'),
    true
  );
}

// Hard-seat pain + already-Extra-Firm band -> Extra Cush primary, no bump needed
{
  const r = routeCushion(baseAnswers({ weight: 'over220', hardSeatPain: ['buttocks'] }));
  check('Hard-seat pain at Extra Firm band -> Extra Cush primary', r.thickness, 'Extra Cush 3"');
  check('Already Extra Firm -> stays Extra Firm', r.firmness, 'Extra Firm');
}

// Hard-seat pain + Medium Plus band -> NOT primary, Extra Cush is only "also consider"
{
  const r = routeCushion(baseAnswers({ weight: '151-169', hardSeatPain: ['hips'] }));
  check(
    'Hard-seat pain at Medium Plus -> thickness stays Regular (not primary)',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Hard-seat pain at Medium Plus -> Extra Cush also-consider suggested',
    r.secondCushion && r.secondCushion.trigger,
    'extra_cush_also_consider'
  );
}

// No hard-seat pain + soft preference at Medium (140-150 band, soft column) -> also-consider
check(
  'No hard-seat pain + soft preference at Medium -> Extra Cush also-consider',
  routeCushion(baseAnswers({ weight: '140-150', firmPreference: 'soft', hardSeatPain: ['none'] }))
    .secondCushion.trigger,
  'extra_cush_also_consider'
);

// Soft band -> no Extra Cush mention at all, even with soft preference
check(
  'Soft band -> no Extra Cush also-consider mention',
  routeCushion(baseAnswers({ weight: 'under120', firmPreference: 'soft', hardSeatPain: ['none'] }))
    .secondCushion,
  null
);

// Hard-seat pain at Medium/Medium Plus + travel: support NEED beats
// compactness WANT - stays on Regular (not Low Profile), with Low Profile
// offered as a secondary "also consider" carrying a support caveat, per
// Chrisie's clarified priority rules.
{
  const r = routeCushion(
    baseAnswers({ weight: '151-169', hardSeatPain: ['hips'], useCase: ['traveling'] })
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
    'Hard-seat pain at Medium Plus + travel -> Low Profile offered as also-consider with caveat',
    r.secondCushion && r.secondCushion.trigger,
    'lowprofile_also_consider_hardseatpain_caveat'
  );
  check(
    'Hard-seat pain at Medium Plus + travel -> also-consider suggestion is Low Profile',
    r.secondCushion.suggestion && r.secondCushion.suggestion.thickness,
    'Low Profile 1.5"'
  );
}

// Same conflict, but NOT selecting travel/driving at all - should behave like
// the plain Extra Cush "also consider" case (unaffected, no compactness want
// in play at all)
check(
  'Hard-seat pain at Medium Plus, no travel/driving -> plain Extra Cush also-consider',
  routeCushion(baseAnswers({ weight: '151-169', hardSeatPain: ['hips'] })).secondCushion.trigger,
  'extra_cush_also_consider'
);

// Hard-seat pain at Soft band + travel: Low Profile was never available here
// regardless (Soft band), falls back to Regular via the existing mechanism -
// not the new hard-seat-pain branch (which only applies at Medium/Medium Plus)
{
  const r = routeCushion(
    baseAnswers({ weight: 'under120', hardSeatPain: ['hips'], useCase: ['traveling'] })
  );
  check('Hard-seat pain at Soft band + travel -> Regular (Low Profile never fits)', r.thickness, 'Regular 2"');
  check(
    'Hard-seat pain at Soft band + travel -> unavailable-at-band note, not the hardseatpain-specific one',
    r.notes.thickness.includes('low_profile_unavailable_at_band') &&
      !r.notes.thickness.includes('hardseatpain_over_travel_stayed_regular'),
    true
  );
}

// Extra Cush primary (from a Firm base band) + travel -> underlying band still
// qualifies for Low Profile, so it's offered as a secondary "also consider"
// rather than a flat no
{
  const r = routeCushion(
    baseAnswers({ weight: '181-200', hardSeatPain: ['hips'], useCase: ['traveling'] })
  );
  check('Extra Cush primary + travel -> thickness stays Extra Cush (no swap)', r.thickness, 'Extra Cush 3"');
  check(
    'Extra Cush primary + travel -> conflict note present',
    r.notes.thickness.includes('extra_cush_travel_car_conflict'),
    true
  );
  check(
    'Extra Cush primary (Firm base band) + travel -> Low Profile offered as also-consider',
    r.secondCushion && r.secondCushion.suggestion && r.secondCushion.suggestion.thickness,
    'Low Profile 1.5"'
  );
  check(
    'Extra Cush primary (Firm base band) + travel -> also-consider trigger name',
    r.secondCushion.trigger,
    'extracush_plus_travel_car_lowprofile_also_consider'
  );
}

// Extra Cush primary + car -> same also-consider handling
{
  const r = routeCushion(
    baseAnswers({ weight: '181-200', hardSeatPain: ['buttocks'], useCase: ['car_truck'] })
  );
  check('Extra Cush primary + car -> thickness stays Extra Cush (no swap)', r.thickness, 'Extra Cush 3"');
  check(
    'Extra Cush primary + car -> conflict note present',
    r.notes.thickness.includes('extra_cush_travel_car_conflict'),
    true
  );
}

// Extra Cush primary from an ALREADY-Extra-Firm base band + travel -> too
// heavy for Low Profile even as a secondary - flat "no", not a suggestion
{
  const r = routeCushion(
    baseAnswers({ weight: 'over220', hardSeatPain: ['hips'], useCase: ['traveling'] })
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

// 13. Low Profile unavailable at Soft -> falls back to Regular with a note
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

// 16. Second cushion: 18" blocks Low Profile suggestion entirely (never comes in 18")
{
  const r = routeCushion(
    baseAnswers({ useCase: ['wheelchair', 'traveling'], needsMoreSpace: 'yes' })
  );
  check('18" + travel -> no second cushion suggested (Low Profile not in 18")', r.secondCushion, null);
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

// RESOLVED: the old "home_plus_travel" companion-suggestion branch (Regular
// primary + Low Profile suggested for travel) was removed entirely - Chrisie
// confirmed we don't want to recommend two cushions unless clearly needed,
// and the new "I travel often and need something compact" wording IS that
// clear statement, so Low Profile becoming the primary pick (when eligible)
// is the correct behavior, not a gap to fix.

// 17. Soother always includes the upgrade line
{
  const r = routeCushion(baseAnswers({ painLocations: ['bladder_urethra'] }));
  check(
    'Soother result always includes upgrade line',
    r.notes.soatherUpgradeLine !== null,
    true
  );
}

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

// 19. Exchange note: only shown when there's a real tradeoff, never on a
// straightforward result (per Chrisie: don't add hesitation where there isn't any)
check(
  'Straightforward result -> no exchange note',
  routeCushion(baseAnswers()).alwaysInclude.exchangeNote,
  null
);
check(
  'Result with a second-cushion suggestion -> exchange note shown',
  typeof routeCushion(baseAnswers({ weight: '151-169', hardSeatPain: ['hips'] })).alwaysInclude
    .exchangeNote,
  'string'
);
check(
  'Result with a soft-preference tradeoff -> exchange note shown',
  typeof routeCushion(
    baseAnswers({ weight: '151-169', firmPreference: 'soft', useCase: ['traveling'] })
  ).alwaysInclude.exchangeNote,
  'string'
);

// Tall + driving variant of the hard-seat-pain-vs-compactness conflict
{
  const r = routeCushion(
    baseAnswers({ height: 'tall', hardSeatPain: ['hips'], useCase: ['car_truck'] })
  );
  check(
    'Hard-seat pain + tall driving at Medium Plus -> stays on Regular',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Hard-seat pain + tall driving -> Low Profile offered as also-consider with caveat',
    r.secondCushion && r.secondCushion.trigger,
    'lowprofile_also_consider_hardseatpain_caveat'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
