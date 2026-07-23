/**
 * parseTally.js
 * -------------
 * Converts a raw Tally webhook payload into the normalized `answers` shape that
 * routing.js expects.
 *
 * Field IDs below were captured from a real test submission (see git history for
 * the capture process). Tally sends each choice/checkbox/dropdown answer as the
 * selected option's internal ID (a UUID), NOT its visible text - the visible text
 * only exists in that field's own `options` array. getResolvedValue() below
 * resolves ID -> text before anything else touches it. Plain text/email fields
 * (freeText, email, firstName) are already plain strings in the payload.
 *
 * Weight is a multiple-choice bracket dropdown (not a raw numeric field - a
 * numeric field was considered and rejected since the firmness table is
 * bucketed either way, a dropdown can't be entered wrong, and it keeps the
 * "gift / don't know their weight" option). The bracket wording was updated to
 * match Chrisie's new firmness table - re-verify question_D5J175's field key
 * and the exact option text below once the new brackets are live in Tally.
 */

const FIELD_MAP = {
  weight: 'question_D5J175', // Screen 1 - re-verify once the new brackets are live
  height: 'question_2vaqBL', // Screen 2
  painLocations: 'question_xyMkjy', // Screen 3 (multi-select)
  duration: 'question_YrMO4d', // Screen 4
  oneSided: 'question_RYMXdJ', // Screen 5
  hardSeatPain: 'question_oderDV', // Screen 6 (multi-select)
  firmPreference: 'question_RRJ4DJ', // Screen 7
  diagnoses: 'question_GD9NKo', // Screen 8 (multi-select)
  tried: 'question_OY4pl8', // Screen 9 (multi-select)
  useCase: 'question_VYQRjv', // Screen 10 (multi-select)
  needsMoreSpace: 'question_PY1MDb', // Screen 11
  recentEvents: 'question_EDdj5N', // Screen 12 (multi-select)
  sex: 'question_rLaNBv', // Screen 13
  ageRange: 'question_4vJWBO', // Screen 13
  country: 'question_jW6dbE', // Screen 14
  state: 'question_xyMkjo', // Screen 14 (shown when country = USA)
  province: 'question_2vaqBV', // Screen 14 (shown when country = Canada)
  freeText: 'question_ZYE4oy', // Screen 15
  firstName: 'question_qWDxa7', // Screen 16
  email: 'question_NYlKDQ', // Screen 16
};

// Maps Tally's visible option TEXT (captured verbatim from a real submission,
// including exact punctuation/whitespace) to our internal keys. If wording in
// Tally ever changes, update the matching string here too - this match is
// exact-text based.
const VALUE_MAPS = {
  weight: {
    'Under 120 lbs': 'under120',
    '120 to 129 lbs': '120-129',
    '130 to 139 lbs': '130-139',
    '140 to 150 lbs': '140-150',
    '151 to 169 lbs': '151-169',
    '170 to 180 lbs': '170-180',
    '181 to 200 lbs': '181-200',
    '201 to 220 lbs': '201-220',
    'Over 220 lbs': 'over220',
    "It's a gift / I don't know their weight": 'gift',
  },
  height: {
    '5\'2" or shorter': 'short',
    '5\'3" to 5\'10"': 'regular',
    '5\'11" and taller': 'tall',
  },
  painLocations: {
    Tailbone: 'tailbone',
    'Sit bones': 'sit_bones',
    Rectal: 'rectal',
    Perineum: 'perineum',
    Genitals: 'genital_vaginal',
    'Bladder/Urethra': 'bladder_urethra',
    Prostate: 'prostate',
    Hips: 'hips',
    Buttocks: 'buttocks',
    Groin: 'groin',
    'Not sure/it changes': 'not_sure',
  },
  duration: {
    'Less than a month': 'under_month',
    '1-6 months': '1_6_months',
    '6 months - 2 years': '6mo_2yr',
    'More than 2 years': 'over_2yr',
  },
  oneSided: {
    Yes: 'yes',
    No: 'no',
  },
  hardSeatPain: {
    Buttocks: 'buttocks',
    Hips: 'hips',
    'Backs of my thighs / hamstrings': 'thighs_hamstrings',
    'None of these': 'none',
  },
  firmPreference: {
    'Firm and supportive': 'firm',
    'Soft and cushy': 'soft',
    'Both—depends ': 'both',
    "I'm not sure.": 'not_sure',
  },
  diagnoses: {
    'Coccydynia / tailbone pain': 'coccydynia',
    'Pudendal neuralgia': 'pudendal_neuralgia',
    'Pelvic floor dysfunction': 'pelvic_floor_dysfunction',
    'Interstitial cystitis': 'interstitial_cystitis',
    'Prostatitis / Chronic Pelvic Pain Syndrome (CPPS)': 'prostatitis_cpps',
    Endometriosis: 'endometriosis',
    Vulvodynia: 'vulvodynia',
    Vaginismus: 'vaginismus',
    'Pelvic girdle pain': 'pelvic_girdle_pain',
    'Recovering from surgery or childbirth': 'recovering_surgery_childbirth',
    'Something else': 'something_else',
    "I don't have a diagnosis": 'no_diagnosis',
  },
  useCase: {
    'One chair most of the day': 'one_chair',
    'Office/desk': 'office_desk',
    'Recliner/couch': 'recliner_couch',
    Wheelchair: 'wheelchair',
    'While driving': 'car_truck', // relabeled from "Car / Truck"
    'I travel often and need something compact': 'traveling', // relabeled from "While traveling"
    'Public places': 'public_places',
  },
  needsMoreSpace: {
    Yes: 'yes',
    Sometimes: 'sometimes',
    No: 'no',
    'Not sure': 'not_sure',
  },
  recentEvents: {
    'Surgery or medical procedure': 'surgery_procedure',
    'Childbirth or abortion': 'childbirth_abortion',
    'Accident or injury': 'accident_injury',
    'None of the above': 'none',
  },
};

/** Finds the raw Tally field object (not just its value) by our internal key. */
function findField(payload, key) {
  const fieldId = FIELD_MAP[key];
  const fields = (payload.data && payload.data.fields) || [];
  return fields.find((f) => f.key === fieldId) || null;
}

/** Resolves a single Tally option ID to its visible text via the field's own options list. */
function resolveOptionText(field, optionId) {
  if (!field || !Array.isArray(field.options)) return optionId;
  const opt = field.options.find((o) => o.id === optionId);
  return opt ? opt.text : optionId;
}

/**
 * Gets the resolved value(s) for a field by our internal key.
 * Choice/checkbox/dropdown fields store selected option ID(s) as an array -
 * this resolves each ID to its visible text via that field's own `options` list.
 * Plain text/email/textarea fields are already plain strings - returned as-is.
 * Returns null if the field wasn't found or wasn't answered (e.g. a conditional
 * question that didn't apply, like Province when country = USA).
 */
function getResolvedValue(payload, key) {
  const field = findField(payload, key);
  if (!field || field.value === null || field.value === undefined) return null;
  if (Array.isArray(field.value)) {
    return field.value.map((id) => resolveOptionText(field, id));
  }
  return field.value;
}

/** Single-select fields: takes the first (only) resolved value, or null. */
function getSingleValue(payload, key) {
  const resolved = getResolvedValue(payload, key);
  return Array.isArray(resolved) ? resolved[0] || null : resolved;
}

/** Multi-select fields: always returns an array (empty if unanswered). */
function getMultiValue(payload, key) {
  const resolved = getResolvedValue(payload, key);
  return Array.isArray(resolved) ? resolved : [];
}

/** Maps a single resolved option TEXT to our internal key, via VALUE_MAPS. */
function mapValue(key, rawValue) {
  const map = VALUE_MAPS[key];
  if (!map || rawValue === null || rawValue === undefined) return rawValue;
  return map[rawValue] !== undefined ? map[rawValue] : rawValue;
}

/** Maps an array of resolved option TEXTs (multi-select) to internal keys. */
function mapMultiValue(key, rawValues) {
  if (!Array.isArray(rawValues)) return [];
  return rawValues.map((v) => mapValue(key, v));
}

/**
 * Converts a raw Tally webhook payload into the normalized answers object.
 * Multi-select fields always return arrays (empty array if unanswered, not null),
 * so routing.js can safely call .includes()/.filter() without null checks.
 */
function parseTallyPayload(payload) {
  return {
    weight: mapValue('weight', getSingleValue(payload, 'weight')),
    height: mapValue('height', getSingleValue(payload, 'height')),
    painLocations: mapMultiValue('painLocations', getMultiValue(payload, 'painLocations')),
    duration: mapValue('duration', getSingleValue(payload, 'duration')),
    oneSided: mapValue('oneSided', getSingleValue(payload, 'oneSided')),
    hardSeatPain: mapMultiValue('hardSeatPain', getMultiValue(payload, 'hardSeatPain')),
    firmPreference: mapValue('firmPreference', getSingleValue(payload, 'firmPreference')),
    diagnoses: mapMultiValue('diagnoses', getMultiValue(payload, 'diagnoses')),
    tried: getMultiValue(payload, 'tried'), // kept as raw Tally labels - data only, no routing use
    useCase: mapMultiValue('useCase', getMultiValue(payload, 'useCase')),
    needsMoreSpace: mapValue('needsMoreSpace', getSingleValue(payload, 'needsMoreSpace')),
    recentEvents: mapMultiValue('recentEvents', getMultiValue(payload, 'recentEvents')),
    sex: getSingleValue(payload, 'sex'), // data only, no routing use
    ageRange: getSingleValue(payload, 'ageRange'), // data only, no routing use
    country: getSingleValue(payload, 'country'), // data only, no routing use
    // Form shows either a State (USA) or Province (Canada) question depending on
    // the country answer - only one will ever be filled in per submission, so
    // this merges them into the single field the rest of the code expects.
    state: getSingleValue(payload, 'state') || getSingleValue(payload, 'province'), // data only, no routing use
    freeText: getSingleValue(payload, 'freeText') || '',
    firstName: getSingleValue(payload, 'firstName') || '',
    email: getSingleValue(payload, 'email'),
  };
}

module.exports = { parseTallyPayload, FIELD_MAP, VALUE_MAPS };
