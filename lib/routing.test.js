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

// Also-consider suppressed entirely when travel/car/public is in use case
{
  const r = routeCushion(
    baseAnswers({ weight: '151-169', hardSeatPain: ['hips'], useCase: ['traveling'] })
  );
  check(
    'Hard-seat pain at Medium Plus + travel -> Extra Cush also-consider suppressed',
    r.secondCushion === null || r.secondCushion.trigger !== 'extra_cush_also_consider',
    true
  );
}

// Extra Cush primary + travel -> flagged as a conflict, not silently swapped
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
    'Extra Cush primary + travel -> secondCushion has no suggestion, just a tradeoff note',
    r.secondCushion && r.secondCushion.suggestion,
    null
  );
  check(
    'Extra Cush primary + travel -> tradeoff trigger name',
    r.secondCushion.trigger,
    'extracush_plus_travel_car_tradeoff'
  );
}

// Extra Cush primary + car -> same conflict handling
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

// 12. Low Profile firmness bump: traveling at Medium Plus should bump to Firm
{
  const r = routeCushion(baseAnswers({ weight: '151-169', useCase: ['traveling'] }));
  check('Travel at Medium Plus -> thickness is Low Profile', r.thickness, 'Low Profile 1.5"');
  check('Travel bumps firmness up one band (Medium Plus -> Firm)', r.firmness, 'Firm');
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

// NOTE: routeSecondCushion's "home_plus_travel" branch (thickness !== 'Low
// Profile 1.5"' while wantsTravel is true) is currently unreachable - whenever
// travel is wanted and Extra Cush isn't primary, routeThickness always
// switches the PRIMARY thickness to Low Profile directly, so that condition
// can never be true. Pre-existing, not something this session's changes
// caused - flagged for Chrisie/Trudy to decide if "Regular for home, Low
// Profile for travel" should ever surface as a companion suggestion instead
// of Low Profile just becoming the primary pick.

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
