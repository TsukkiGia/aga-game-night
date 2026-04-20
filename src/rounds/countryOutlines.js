// Country outline images from mapsicon (https://github.com/djaiss/mapsicon)
// URL pattern: https://cdn.jsdelivr.net/gh/djaiss/mapsicon/africa/{iso2}/512.png
const AFRICAN_OUTLINES = [
  { country: 'Algeria',                          code: 'dz' },
  { country: 'Angola',                           code: 'ao' },
  { country: 'Botswana',                         code: 'bw' },
  { country: 'Burkina Faso',                     code: 'bf' },
  { country: 'Cameroon',                         code: 'cm' },
  { country: 'Chad',                             code: 'td' },
  { country: 'Democratic Republic of the Congo', code: 'cd' },
  { country: 'Egypt',                            code: 'eg' },
  { country: 'Ethiopia',                         code: 'et' },
  { country: 'Ghana',                            code: 'gh' },
  { country: 'Ivory Coast',                      code: 'ci' },
  { country: 'Kenya',                            code: 'ke' },
  { country: 'Libya',                            code: 'ly' },
  { country: 'Madagascar',                       code: 'mg' },
  { country: 'Malawi',                           code: 'mw' },
  { country: 'Mali',                             code: 'ml' },
  { country: 'Mauritania',                       code: 'mr' },
  { country: 'Morocco',                          code: 'ma' },
  { country: 'Mozambique',                       code: 'mz' },
  { country: 'Namibia',                          code: 'na' },
  { country: 'Niger',                            code: 'ne' },
  { country: 'Nigeria',                          code: 'ng' },
  { country: 'Senegal',                          code: 'sn' },
  { country: 'Somalia',                          code: 'so' },
  { country: 'South Africa',                     code: 'za' },
  { country: 'South Sudan',                      code: 'ss' },
  { country: 'Sudan',                            code: 'sd' },
  { country: 'Tanzania',                         code: 'tz' },
  { country: 'Uganda',                           code: 'ug' },
  { country: 'Zambia',                           code: 'zm' },
  { country: 'Zimbabwe',                         code: 'zw' },
]

function seededShuffle(items, seed = 0xB04DE12) {
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

const SHUFFLED = seededShuffle(AFRICAN_OUTLINES)

const OUTLINE_QUESTIONS = SHUFFLED.map((entry, index) => ({
  id: `outline-${String(index + 1).padStart(2, '0')}`,
  promptType: 'image',
  promptText: 'Which African country has this outline?',
  mediaUrl: `https://cdn.jsdelivr.net/gh/djaiss/mapsicon@master/africa/${entry.code}/512.png`,
  answer: entry.country,
  explanation: `The outline shows ${entry.country}.`,
}))

export default {
  id: 'country-outlines',
  name: 'Country Outlines',
  type: 'custom-buzz',
  intro: 'A country silhouette appears on screen — no labels, no borders. Buzz with the country name.',
  rules: [
    'Identify the African country from its outline only',
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
  questions: OUTLINE_QUESTIONS,
}
