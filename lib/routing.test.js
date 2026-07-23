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
    weight: '140-180',
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
    baseAnswers({ height: 'tall', needsMoreSpace: 'yes', weight: '120-140' })
  ).size,
  '16" (Regular Size)'
);

// 9. Not tall + says yes to needing more space -> 18"
check(
  'Not tall + needsMoreSpace=yes -> 18"',
  routeCushion(baseAnswers({ height: 'regular', needsMoreSpace: 'yes' })).size,
  '18" (Larger Size)'
);

// 10. Buttock/hip/thigh pain at 150+ (140-180 bucket) -> Extra Cush, firmness NOT dropped
{
  const r = routeCushion(
    baseAnswers({ weight: '140-180', hardSeatPain: ['buttocks'] })
  );
  check('Hard-seat pain at 140-180 -> Extra Cush 3"', r.thickness, 'Extra Cush 3"');
  check(
    'Hard-seat pain at 140-180 -> firmness stays at base band (Medium Plus)',
    r.firmness,
    'Medium Plus'
  );
}

// 11. Buttock/hip/thigh pain under 150 (120-140 bucket) -> band drops instead of Extra Cush
{
  const r = routeCushion(
    baseAnswers({ weight: '120-140', hardSeatPain: ['hips'] })
  );
  check(
    'Hard-seat pain under 150 -> thickness stays Regular (no Extra Cush)',
    r.thickness,
    'Regular 2"'
  );
  check(
    'Hard-seat pain under 150 -> firmness dropped one band (Medium -> Soft)',
    r.firmness,
    'Soft'
  );
}

// 12. Low Profile firmness bump: traveling at Medium Plus should bump to Firm
{
  const r = routeCushion(
    baseAnswers({ weight: '140-180', useCase: ['traveling'] })
  );
  check('Travel at Medium Plus -> thickness is Low Profile', r.thickness, 'Low Profile 1.5"');
  check('Travel bumps firmness up one band (Medium Plus -> Firm)', r.firmness, 'Firm');
}

// 13. Low Profile unavailable at Soft/Medium -> falls back to Regular with a note
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

// 16b. Second cushion: Extra Cush + travel + over 200lb -> blocked, tradeoff note only
{
  const r = routeCushion(
    baseAnswers({ weight: '180-220', hardSeatPain: ['hips'], useCase: ['traveling'] })
  );
  check(
    'Extra Cush + travel + over 200lb -> second cushion suggestion blocked',
    r.secondCushion.suggestion,
    null
  );
  check(
    'Extra Cush + travel + over 200lb -> trigger is tradeoff',
    r.secondCushion.trigger,
    'extracush_plus_travel_tradeoff'
  );
}

// 16c. Second cushion: Extra Cush + travel + under 200lb -> Low Profile suggested with caveat
{
  const r = routeCushion(
    baseAnswers({ weight: '140-180', hardSeatPain: ['hips'], useCase: ['traveling'] })
  );
  check(
    'Extra Cush + travel + under 200lb -> Low Profile suggested',
    r.secondCushion.suggestion && r.secondCushion.suggestion.thickness,
    'Low Profile 1.5"'
  );
  check(
    'Extra Cush + travel + under 200lb -> firmness range included',
    r.secondCushion.suggestion.firmnessRange,
    'Medium/Medium Plus/Firm'
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
