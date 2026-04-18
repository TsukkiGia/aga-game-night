const AFRICAN_FLAGS = [
  { code: 'dz', country: 'Algeria' },
  { code: 'ao', country: 'Angola' },
  { code: 'bj', country: 'Benin' },
  { code: 'bw', country: 'Botswana' },
  { code: 'bf', country: 'Burkina Faso' },
  { code: 'bi', country: 'Burundi' },
  { code: 'cm', country: 'Cameroon' },
  { code: 'cv', country: 'Cape Verde' },
  { code: 'cf', country: 'Central African Republic' },
  { code: 'td', country: 'Chad' },
  { code: 'km', country: 'Comoros' },
  { code: 'cg', country: 'Republic of the Congo' },
  { code: 'cd', country: 'Democratic Republic of the Congo' },
  { code: 'dj', country: 'Djibouti' },
  { code: 'eg', country: 'Egypt' },
  { code: 'gq', country: 'Equatorial Guinea' },
  { code: 'er', country: 'Eritrea' },
  { code: 'sz', country: 'Eswatini' },
  { code: 'et', country: 'Ethiopia' },
  { code: 'ga', country: 'Gabon' },
  { code: 'gm', country: 'Gambia' },
  { code: 'gh', country: 'Ghana' },
  { code: 'gn', country: 'Guinea' },
  { code: 'gw', country: 'Guinea-Bissau' },
  { code: 'ci', country: "Cote d'Ivoire" },
  { code: 'ke', country: 'Kenya' },
  { code: 'ls', country: 'Lesotho' },
  { code: 'lr', country: 'Liberia' },
  { code: 'ly', country: 'Libya' },
  { code: 'mg', country: 'Madagascar' },
  { code: 'mw', country: 'Malawi' },
  { code: 'ml', country: 'Mali' },
  { code: 'mr', country: 'Mauritania' },
  { code: 'mu', country: 'Mauritius' },
  { code: 'ma', country: 'Morocco' },
  { code: 'mz', country: 'Mozambique' },
  { code: 'na', country: 'Namibia' },
  { code: 'ne', country: 'Niger' },
  { code: 'ng', country: 'Nigeria' },
  { code: 'rw', country: 'Rwanda' },
  { code: 'st', country: 'Sao Tome and Principe' },
  { code: 'sn', country: 'Senegal' },
  { code: 'sc', country: 'Seychelles' },
  { code: 'sl', country: 'Sierra Leone' },
  { code: 'so', country: 'Somalia' },
  { code: 'za', country: 'South Africa' },
  { code: 'ss', country: 'South Sudan' },
  { code: 'sd', country: 'Sudan' },
  { code: 'tz', country: 'Tanzania' },
  { code: 'tg', country: 'Togo' },
  { code: 'tn', country: 'Tunisia' },
  { code: 'ug', country: 'Uganda' },
  { code: 'zm', country: 'Zambia' },
  { code: 'zw', country: 'Zimbabwe' },
]

function seededShuffle(items, seed = 0xA51C0DE) {
  const out = [...items]
  let state = seed >>> 0
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const SHUFFLED_AFRICAN_FLAGS = seededShuffle(AFRICAN_FLAGS)

const FLAG_QUESTIONS = SHUFFLED_AFRICAN_FLAGS.map((entry, index) => ({
  id: `flag-img-${String(index + 1).padStart(2, '0')}`,
  promptType: 'image',
  promptText: 'Which country does this flag belong to?',
  mediaUrl: `https://flagcdn.com/w640/${entry.code}.png`,
  answer: entry.country,
  explanation: `National flag of ${entry.country}.`,
}))

export default {
  id: 'flags-by-image',
  name: 'Flags by Image',
  type: 'custom-buzz',
  intro: 'A flag appears on screen. Buzz with the country name.',
  rules: [
    'Identify the country from the flag image',
    'Buzz in with the country name',
    'Correct answer: +3',
    'Wrong answer: -1',
    'After a miss, one steal is available (+2 / 0)',
  ],
  scoring: [
    { label: 'Correct answer', points: 3, phase: 'normal' },
    { label: 'Wrong answer', points: -1, phase: 'normal' },
    { label: 'Correct steal', points: 2, phase: 'steal' },
    { label: 'Wrong steal', points: 0, phase: 'steal' },
  ],
  questions: FLAG_QUESTIONS,
}
