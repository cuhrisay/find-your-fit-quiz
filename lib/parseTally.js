/**
 * parseTally.js
 * -------------
 * Converts a raw Tally webhook payload into the normalized `answers` shape that
 * routing.js expects.
 *
 * !! ACTION NEEDED BEFORE THIS WORKS !!
 * The FIELD_MAP below maps Tally's internal field IDs (which look like random
 * strings, e.g. "question_AbC123") to the plain-English keys used everywhere else
 * in this project. Tally assigns these IDs when you build the form — they don't
 * exist until you've actually built it.
 *
 * To get them:
 *   1. Open your Tally form's webhook settings (Integrations -> Webhooks).
 *   2. Send a test submission.
 *   3. Look at the payload Tally sends — each answer includes a "field" object
 *      with an "id" and a "label". Match the label (the question text) to the
 *      right key below and paste in the real id.
 *
 * Everything below is written against the exact screens/options in
 * CYA_Fit_Quiz_Structure_v4.md so the VALUE mapping (Tally option label -> our
 * internal key like 'under120') is already correct — only the FIELD IDs need
 * filling in.
 */

const FIELD_MAP = {
  weight: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 1
  height: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 2
  painLocations: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 3 (multi-select)
  duration: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 4
  oneSided: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 5
  hardSeatPain: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 6 (multi-select)
  firmPreference: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 7
  diagnoses: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 8 (multi-select)
  tried: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 9 (multi-select)
  useCase: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 10 (multi-select)
  needsMoreSpace: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 11
  recentEvents: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 12 (multi-select)
  sex: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 13
  ageRange: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 13
  country: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 14
  state: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 14 (shown when country = USA)
  province: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 14 (shown when country = Canada)
  freeText: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 15
  firstName: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 16
  email: 'REPLACE_WITH_TALLY_FIELD_ID', // Screen 16
};

// Maps Tally's visible option TEXT to our internal keys. If you change wording
// in Tally, update the matching string here too — this match is exact-text based.
const VALUE_MAPS = {
  weight: {
    'Under 120': 'under120',
    '120–140': '120-140',
    '140–180': '140-180',
    '180–220': '180-220',
    'Over 220': 'over220',
    "It's a gift / I don't know their weight": 'gift',
  },
  height: {
    '5\'2" and under (short)': 'short',
    '5\'3"–5\'10" (regular)': 'regular',
    '5\'11" and up (tall)': 'tall',
    'Prefer not to say': 'prefer_not_to_say',
  },
  painLocations: {
    Tailbone: 'tailbone',
    'Sit bones': 'sit_bones',
    Rectal: 'rectal',
    Perineum: 'perineum',
    'Genital/vaginal': 'genital_vaginal',
    'Bladder/urethra': 'bladder_urethra',
    Prostate: 'prostate',
    Hips: 'hips',
    Buttocks: 'buttocks',
    Groin: 'groin',
    'Not sure, or it changes': 'not_sure',
  },
  duration: {
    'Under a month': 'under_month',
    '1–6 months': '1_6_months',
    '6 months–2 years': '6mo_2yr',
    'Over 2 years': 'over_2yr',
  },
  oneSided: {
    Yes: 'yes',
    No: 'no',
  },
  hardSeatPain: {
    Buttocks: 'buttocks',
    Hips: 'hips',
    'Backs of my thighs / hamstrings': 'thighs_hamstrings',
    'No, none of that': 'none',
  },
  firmPreference: {
    'Firm and supportive': 'firm',
    'Soft and cushy': 'soft',
    'Both — depends': 'both',
    "I'm not sure": 'not_sure',
  },
  diagnoses: {
    'Coccydynia / Tailbone pain': 'coccydynia',
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
    'Recliner or couch': 'recliner_couch',
    Wheelchair: 'wheelchair',
    'Car / Truck': 'car_truck',
    'While traveling': 'traveling',
    'Public places': 'public_places',
  },
  needsMoreSpace: {
    Yes: 'yes',
    Sometimes: 'sometimes',
    No: 'no',
  },
  recentEvents: {
    'Surgery or medical procedure': 'surgery_procedure',
    'Childbirth or abortion': 'childbirth_abortion',
    'Accident or injury': 'accident_injury',
    'None of the above': 'none',
  },
};

/** Looks up a raw Tally field by our internal key, returns its raw value(s). */
function getField(payload, key) {
  const fieldId = FIELD_MAP[key];
  const field = (payload.data && payload.data.fields ? payload.data.fields : []).find(
    (f) => f.key === fieldId || f.id === fieldId
  );
  return field ? field.value : null;
}

/** Maps a single raw Tally option label to our internal key, via VALUE_MAPS. */
function mapValue(key, rawValue) {
  const map = VALUE_MAPS[key];
  if (!map) return rawValue;
  return map[rawValue] !== undefined ? map[rawValue] : rawValue;
}

/** Maps an array of raw Tally option labels (multi-select) to internal keys. */
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
    weight: mapValue('weight', getField(payload, 'weight')),
    height: mapValue('height', getField(payload, 'height')),
    painLocations: mapMultiValue('painLocations', getField(payload, 'painLocations')) || [],
    duration: mapValue('duration', getField(payload, 'duration')),
    oneSided: mapValue('oneSided', getField(payload, 'oneSided')),
    hardSeatPain: mapMultiValue('hardSeatPain', getField(payload, 'hardSeatPain')) || [],
    firmPreference: mapValue('firmPreference', getField(payload, 'firmPreference')),
    diagnoses: mapMultiValue('diagnoses', getField(payload, 'diagnoses')) || [],
    tried: getField(payload, 'tried') || [], // kept as raw Tally labels - data only, no routing use
    useCase: mapMultiValue('useCase', getField(payload, 'useCase')) || [],
    needsMoreSpace: mapValue('needsMoreSpace', getField(payload, 'needsMoreSpace')),
    recentEvents: mapMultiValue('recentEvents', getField(payload, 'recentEvents')) || [],
    sex: getField(payload, 'sex'), // data only, no routing use
    ageRange: getField(payload, 'ageRange'), // data only, no routing use
    country: getField(payload, 'country'), // data only, no routing use
    // Form shows either a State (USA) or Province (Canada) question depending on
    // the country answer - only one will ever be filled in per submission, so
    // this merges them into the single field the rest of the code expects.
    state: getField(payload, 'state') || getField(payload, 'province'), // data only, no routing use
    freeText: getField(payload, 'freeText') || '',
    firstName: getField(payload, 'firstName') || '',
    email: getField(payload, 'email'),
  };
}

module.exports = { parseTallyPayload, FIELD_MAP, VALUE_MAPS };
