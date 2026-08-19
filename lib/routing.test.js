/**
 * Smoke tests for routing.js. Run: node lib/routing.test.js
 *
 * Covers the July 2026 rewrite (Trudy-confirmed): Simple Soother eligibility
 * (central-only + duration + condition gates), Extra Cush (170+ / cushy-primary
 * / firm+hard-surface-also-consider), Low Profile (<=200, firmness bump,
 * travel-only-primary vs companion), and the weight x preference firmness table.
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
    weight: '151-169',
    height: 'regular',
    painLocations: ['tailbone'],
    duration: 'over_2yr',
    firmPreference: 'not_sure',
    diagnoses: [],
    useCase: ['one_chair'],
    needsMoreSpace: 'no',
    ...overrides,
  };
}

const thNotes = (r) => r.notes.thickness;

// ===========================================================================
// PRODUCT — Simple Soother eligibility
// ===========================================================================

// Single central location, no dx, recent -> Soother
check('Bladder-only, recent -> Soother',
  routeCushion(baseAnswers({ painLocations: ['bladder_urethra'], duration: 'under_month' })).product,
  'Simple Soother');

// Central cluster (tight cluster OK)
check('Groin+rectal+genital cluster, recent -> Soother',
  routeCushion(baseAnswers({ painLocations: ['groin', 'rectal', 'genital_vaginal'], duration: '1_6_months' })).product,
  'Simple Soother');

// Rectal and groin are now central (moved out of forcing)
check('Rectal-only, recent -> Soother',
  routeCushion(baseAnswers({ painLocations: ['rectal'], duration: 'under_month' })).product,
  'Simple Soother');

// Central + non-central -> Twin Cheeks
check('Groin + tailbone -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['groin', 'tailbone'], duration: 'under_month' })).product,
  'Twin Cheeks');

// Perineum and prostate stay Twin Cheeks (NOT central for Soother)
check('Perineum-only -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['perineum'], duration: 'under_month' })).product,
  'Twin Cheeks');
check('Prostate-only -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['prostate'], duration: 'under_month' })).product,
  'Twin Cheeks');

// Condition gates
check('Central + vulvodynia + recent -> Soother (compatible)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], diagnoses: ['vulvodynia'], duration: 'under_month' })).product,
  'Simple Soother');
check('Central + IC + recent -> Soother (IC now compatible)',
  routeCushion(baseAnswers({ painLocations: ['bladder_urethra'], diagnoses: ['interstitial_cystitis'], duration: 'under_month' })).product,
  'Simple Soother');
check('Central + PN -> Twin Cheeks (incompatible)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], diagnoses: ['pudendal_neuralgia'], duration: 'under_month' })).product,
  'Twin Cheeks');
check('Central + prostatitis -> Twin Cheeks (incompatible)',
  routeCushion(baseAnswers({ painLocations: ['bladder_urethra'], diagnoses: ['prostatitis_cpps'], duration: 'under_month' })).product,
  'Twin Cheeks');
check('Central + vaginismus -> Twin Cheeks (incompatible)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], diagnoses: ['vaginismus'], duration: 'under_month' })).product,
  'Twin Cheeks');
check('Central + something_else -> Soother (vague dx does not block)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], diagnoses: ['something_else'], duration: 'under_month' })).product,
  'Simple Soother');

// Duration gates
check('Central, over 2 years -> Twin Cheeks (never Soother)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'over_2yr' })).product,
  'Twin Cheeks');
check('Central, 6mo-2yr, no recovering -> Twin Cheeks',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: '6mo_2yr' })).product,
  'Twin Cheeks');
check('Central, 6mo-2yr, recovering -> Soother (surgery healing)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: '6mo_2yr', diagnoses: ['recovering_surgery_childbirth'] })).product,
  'Simple Soother');

// Space gate — Soother is one size only, so a confident "needs more room"
// bumps to Twin Cheeks even when the pain pattern would otherwise qualify.
check('Central, recent, needs more space -> Twin Cheeks (Soother is one size)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month', needsMoreSpace: 'yes' })).product,
  'Twin Cheeks');
check('Central, recent, needs more space -> gets the 18"',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month', needsMoreSpace: 'yes' })).size,
  '18" (Larger Size)');
check('Central, recent, needs more space -> spaceBumpedFromSoother flagged',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month', needsMoreSpace: 'yes' })).notes.spaceBumpedFromSoother,
  true);
check('Central, recent, not-sure on space -> still Soother (only a confident yes bumps)',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month', needsMoreSpace: 'sometimes' })).product,
  'Simple Soother');
check('Non-central pain, needs more space -> not flagged as bumped (never would have qualified)',
  routeCushion(baseAnswers({ painLocations: ['tailbone'], needsMoreSpace: 'yes' })).notes.spaceBumpedFromSoother,
  false);

// Soother reason
check('Central recent -> temporary framing',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month' })).notes.product,
  'temporary');
check('Central 6mo-2yr + recovering -> temporary framing',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: '6mo_2yr', diagnoses: ['recovering_surgery_childbirth'] })).notes.product,
  'temporary');

// Soother upgrade line always present
check('Soother always includes upgrade line',
  routeCushion(baseAnswers({ painLocations: ['genital_vaginal'], duration: 'under_month' })).notes.sootherUpgradeLine !== null,
  true);

// ===========================================================================
// SOOTHER firmness (Medium <140, Firm 140+, cusp preference tiebreak)
// ===========================================================================
{
  const soother = (weight, pref) => routeCushion(baseAnswers({
    painLocations: ['genital_vaginal'], duration: 'under_month', weight, firmPreference: pref,
  }));
  check('Soother 120-129 -> Medium', soother('120-129', 'not_sure').firmness, 'Medium');
  check('Soother 130-139 default -> Medium', soother('130-139', 'not_sure').firmness, 'Medium');
  check('Soother 130-139 + firm -> Firm (cusp)', soother('130-139', 'firm').firmness, 'Firm');
  check('Soother 140-150 default -> Firm', soother('140-150', 'not_sure').firmness, 'Firm');
  check('Soother 140-150 + soft -> Medium (cusp)', soother('140-150', 'soft').firmness, 'Medium');
  check('Soother 151-169 -> Firm', soother('151-169', 'not_sure').firmness, 'Firm');
  // Fixed specs
  const s = soother('140-150', 'not_sure');
  check('Soother thickness is 3"', s.thickness, '3"');
  check('Soother size is One Size', s.size, 'One Size');
  check('Soother has no thickness notes', s.notes.thickness, []);
  check('Soother has no second cushion', s.secondCushion, null);
}

// ===========================================================================
// FIRMNESS table (Twin Cheeks) — exhaustive weight x preference
// ===========================================================================
const FIRMNESS_TABLE_TESTS = [
  ['under120', 'firm', 'Medium'], ['under120', 'soft', 'Soft'], ['under120', 'not_sure', 'Soft'],
  ['120-129', 'firm', 'Medium'], ['120-129', 'soft', 'Medium'], ['120-129', 'not_sure', 'Medium'],
  ['130-139', 'firm', 'Medium Plus'], ['130-139', 'soft', 'Medium'], ['130-139', 'not_sure', 'Medium'],
  ['140-150', 'firm', 'Medium Plus'], ['140-150', 'soft', 'Medium'], ['140-150', 'not_sure', 'Medium Plus'],
  ['151-169', 'firm', 'Medium Plus'], ['151-169', 'soft', 'Medium Plus'], ['151-169', 'not_sure', 'Medium Plus'],
  ['170-180', 'firm', 'Firm'], ['170-180', 'soft', 'Extra Firm'], ['170-180', 'not_sure', 'Medium Plus'],
  ['181-200', 'firm', 'Firm'], ['181-200', 'soft', 'Extra Firm'], ['181-200', 'not_sure', 'Firm'],
  ['201-220', 'firm', 'Extra Firm'], ['201-220', 'soft', 'Extra Firm'], ['201-220', 'not_sure', 'Firm'],
  ['over220', 'firm', 'Extra Firm'], ['over220', 'soft', 'Extra Firm'], ['over220', 'not_sure', 'Extra Firm'],
];
// NOTE: soft-preference at 181-200 and 201-220 becomes Extra Firm because the
// cushy-preference-at-170+ rule promotes to Extra Cush (Extra Firm base).
FIRMNESS_TABLE_TESTS.forEach(([weight, pref, expected]) => {
  check(`Firmness ${weight} / ${pref} -> ${expected}`,
    routeCushion(baseAnswers({ weight, firmPreference: pref, painLocations: ['tailbone'] })).firmness,
    expected);
});

// ===========================================================================
// EXTRA CUSH — 170+ floor, cushy-primary, firm+hard-surface also-consider
// ===========================================================================

// Cushy + 170+ -> Extra Cush primary (Extra Firm), regardless of pain location
{
  const r = routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'soft', painLocations: ['tailbone'] }));
  check('Cushy 181-200 -> Extra Cush primary', r.thickness, 'Extra Cush 3"');
  check('Extra Cush primary -> Extra Firm', r.firmness, 'Extra Firm');
  check('Extra Cush primary note', thNotes(r).includes('extra_cush_primary'), true);
}
// Cushy at exactly 170-180 -> Extra Cush
check('Cushy 170-180 -> Extra Cush',
  routeCushion(baseAnswers({ weight: '170-180', firmPreference: 'soft', painLocations: ['tailbone'] })).thickness,
  'Extra Cush 3"');
// Cushy UNDER 170 -> no Extra Cush (Regular)
check('Cushy 151-169 -> Regular (under 170 floor)',
  routeCushion(baseAnswers({ weight: '151-169', firmPreference: 'soft', painLocations: ['tailbone'] })).thickness,
  'Regular 2"');

// Firm + hard-surface pain + 170+ -> Regular + also-consider note
{
  const r = routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'firm', painLocations: ['hips'] }));
  check('Firm + hip pain 181-200 -> Regular', r.thickness, 'Regular 2"');
  check('Firm + hip pain -> extra_cush_also_consider_firm note', thNotes(r).includes('extra_cush_also_consider_firm'), true);
}
// Firm + NO hard-surface pain + 170+ -> Regular, NO extra cush note (even with PN)
{
  const r = routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'firm', painLocations: ['tailbone'], diagnoses: ['pudendal_neuralgia'] }));
  check('Firm + PN + no hard-surface -> Regular', r.thickness, 'Regular 2"');
  check('Firm + PN + no hard-surface -> NO extra cush note',
    thNotes(r).some((n) => n.startsWith('extra_cush')), false);
}
// Not sure + 170+ -> Regular + offer-both note
{
  const r = routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'not_sure', painLocations: ['tailbone'] }));
  check('Not sure 181-200 -> Regular', r.thickness, 'Regular 2"');
  check('Not sure 181-200 -> extra_cush_also_consider_unsure note', thNotes(r).includes('extra_cush_also_consider_unsure'), true);
}
// Extra Cush primary + car -> car caveat
check('Extra Cush + car -> car caveat note',
  thNotes(routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'soft', painLocations: ['tailbone'], useCase: ['car_truck'] }))).includes('extra_cush_car_caveat'),
  true);
// Extra Cush primary + travel -> travel caveat
check('Extra Cush + travel -> travel caveat note',
  thNotes(routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'soft', painLocations: ['tailbone'], useCase: ['traveling'] }))).includes('extra_cush_travel_caveat'),
  true);
// Extra Cush + 18" is a valid combo (18" comes in Extra Cush)
{
  const r = routeCushion(baseAnswers({ weight: '181-200', firmPreference: 'soft', painLocations: ['tailbone'], needsMoreSpace: 'yes' }));
  check('Extra Cush + 18" -> thickness Extra Cush', r.thickness, 'Extra Cush 3"');
  check('Extra Cush + 18" -> size 18"', r.size, '18" (Larger Size)');
}

// ===========================================================================
// LOW PROFILE — <=200, firmness bump, travel-only primary vs companion
// ===========================================================================

// Travel-only + eligible -> LP primary, bumped firmness
{
  const r = routeCushion(baseAnswers({ weight: '151-169', painLocations: ['tailbone'], useCase: ['traveling'] }));
  check('Travel-only 151-169 -> Low Profile', r.thickness, 'Low Profile 1.5"');
  check('LP 151-169 -> firmness bumped Medium Plus -> Firm', r.firmness, 'Firm');
  check('LP primary note', thNotes(r).includes('low_profile_primary'), true);
}
// Under 120 travel -> LP Medium (Soft bumped to Medium)
check('Travel-only under120 -> LP Medium (bump from Soft)',
  routeCushion(baseAnswers({ weight: 'under120', painLocations: ['tailbone'], useCase: ['traveling'] })).firmness,
  'Medium');
// Over 200 travel -> NO LP (Regular + note)
{
  const r = routeCushion(baseAnswers({ weight: '201-220', firmPreference: 'firm', painLocations: ['tailbone'], useCase: ['traveling'] }));
  check('Travel 201-220 -> Regular (over 200, no LP)', r.thickness, 'Regular 2"');
  check('Travel 201-220 -> low_profile_over200 note', thNotes(r).includes('low_profile_over200'), true);
}
// Travel + hard-surface pain -> NO LP (not supportive enough), Regular
{
  const r = routeCushion(baseAnswers({ weight: '151-169', painLocations: ['hips'], useCase: ['traveling'] }));
  check('Travel + hip pain -> Regular (LP not eligible)', r.thickness, 'Regular 2"');
  check('Travel + hip pain -> no LP note', thNotes(r).some((n) => n.startsWith('low_profile')), false);
  check('Travel + hip pain -> no LP companion', r.secondCushion, null);
}
// Travel + stationary use -> Regular primary + LP companion
{
  const r = routeCushion(baseAnswers({ weight: '151-169', painLocations: ['tailbone'], useCase: ['office_desk', 'traveling'] }));
  check('Travel + desk -> Regular primary', r.thickness, 'Regular 2"');
  check('Travel + desk -> LP companion suggested', r.secondCushion && r.secondCushion.suggestion.thickness, 'Low Profile 1.5"');
  check('LP companion firmness bumped', r.secondCushion.suggestion.firmnessRange, 'Firm');
  check('LP companion trigger', r.secondCushion.trigger, 'low_profile_companion');
}
// Tall + car (no travel) -> Regular + LP companion for driving
{
  const r = routeCushion(baseAnswers({ height: 'tall', weight: '151-169', painLocations: ['tailbone'], useCase: ['car_truck'] }));
  check('Tall + car -> Regular primary', r.thickness, 'Regular 2"');
  check('Tall + car -> LP companion for driving', r.secondCushion && r.secondCushion.trigger, 'low_profile_companion');
}

// ===========================================================================
// SIZE / 18"
// ===========================================================================
check('needsMoreSpace yes -> 18"',
  routeCushion(baseAnswers({ needsMoreSpace: 'yes' })).size, '18" (Larger Size)');
check('needsMoreSpace no -> 16"',
  routeCushion(baseAnswers({ needsMoreSpace: 'no' })).size, '16" (Regular Size)');

// "Not sure" nudge — a supporting signal (heavier weight, or thigh pain)
// surfaces a gentle note; a plain "not sure" with neither stays silent.
check('Not sure + heavier weight -> 16" with a nudge note',
  routeCushion(baseAnswers({ weight: '181-200', needsMoreSpace: 'sometimes' })).notes.size.includes('consider_18in_not_sure'),
  true);
check('Not sure + thigh pain -> 16" with a nudge note',
  routeCushion(baseAnswers({ painLocations: ['thighs_hamstrings'], needsMoreSpace: 'sometimes' })).notes.size.includes('consider_18in_not_sure'),
  true);
check('Not sure + light weight + no thigh pain -> no nudge',
  routeCushion(baseAnswers({ weight: '120-129', needsMoreSpace: 'sometimes' })).notes.size.includes('consider_18in_not_sure'),
  false);
check('Confident "no" + heavier weight -> no nudge (never second-guessed)',
  routeCushion(baseAnswers({ weight: '181-200', needsMoreSpace: 'no' })).notes.size.includes('consider_18in_not_sure'),
  false);

// 18" + travel + eligible -> LP 16" companion (bumped)
{
  const r = routeCushion(baseAnswers({ weight: '151-169', painLocations: ['tailbone'], needsMoreSpace: 'yes', useCase: ['traveling'] }));
  check('18" + travel -> size 18"', r.size, '18" (Larger Size)');
  check('18" + travel -> thickness Regular (18" never LP)', r.thickness, 'Regular 2"');
  check('18" + travel -> LP 16" companion', r.secondCushion && r.secondCushion.suggestion.thickness, 'Low Profile 1.5"');
  check('18" + travel companion trigger', r.secondCushion.trigger, 'eighteen_plus_travel_lp');
}
// 18" + travel + over 200 -> tradeoff note, no LP
{
  const r = routeCushion(baseAnswers({ weight: 'over220', firmPreference: 'firm', painLocations: ['tailbone'], needsMoreSpace: 'yes', useCase: ['traveling'] }));
  check('18" + travel + over220 -> no LP suggestion', r.secondCushion && r.secondCushion.suggestion, null);
  check('18" + travel + over220 -> tradeoff trigger', r.secondCushion.trigger, 'eighteen_plus_travel_tradeoff');
}
// 18" + travel + wheelchair -> wheelchair note
check('18" + travel + wheelchair -> wheelchair note trigger',
  routeCushion(baseAnswers({ painLocations: ['tailbone'], needsMoreSpace: 'yes', useCase: ['wheelchair', 'traveling'] })).secondCushion.trigger,
  'wheelchair_travels_with_them');

// ===========================================================================
// ALWAYS-INCLUDE
// ===========================================================================
{
  const r = routeCushion(baseAnswers());
  check('break-in note present', typeof r.alwaysInclude.breakIn, 'string');
  check('break-in note mentions getting used to', /getting used to/.test(r.alwaysInclude.breakIn), true);
  check('return policy present', typeof r.alwaysInclude.returnPolicy, 'string');
  check('no waitlistNote field (removed)', r.alwaysInclude.waitlistNote, undefined);
  check('16" has no 18in explanation', r.alwaysInclude.eighteenInchExplanation, null);
}
check('18" has an 18in explanation',
  typeof routeCushion(baseAnswers({ needsMoreSpace: 'yes' })).alwaysInclude.eighteenInchExplanation, 'string');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
