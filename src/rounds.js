// ─────────────────────────────────────────────────────────────
//  Game round / question data
//
//  Round 1 videos: place .mp4 files in public/videos/
//  and name them r1-01.mp4 through r1-08.mp4
//  Fill in the answer and explanation fields below.
// ─────────────────────────────────────────────────────────────

const THESIS_OPTIONS = ['Family-friendly English', 'Slang register', 'Exaggerated academic jargon']

const rounds = [
  {
    label: 'Round 1',
    name: 'Guess the Language',
    type: 'video',
    scoring: [
      { label: 'Correct language', points: 3 },
      { label: 'Correct region',   points: 1 },
      { label: 'Wrong',            points: -1 },
    ],
    questions: [
      { id: 'r1q1', video: 'r1-01.mp4', answer: '', explanation: '' },
      { id: 'r1q2', video: 'r1-02.mp4', answer: '', explanation: '' },
      { id: 'r1q3', video: 'r1-03.mp4', answer: '', explanation: '' },
      { id: 'r1q4', video: 'r1-04.mp4', answer: '', explanation: '' },
      { id: 'r1q5', video: 'r1-05.mp4', answer: '', explanation: '' },
      { id: 'r1q6', video: 'r1-06.mp4', answer: '', explanation: '' },
      { id: 'r1q7', video: 'r1-07.mp4', answer: '', explanation: '' },
      { id: 'r1q8', video: 'r1-08.mp4', answer: '', explanation: '' },
    ],
  },

  {
    label: 'Round 2',
    name: 'Slang Bee',
    type: 'slang',
    scoring: [
      { label: 'Correct meaning',  points: 2 },
      { label: 'Correct sentence', points: 2 },
      { label: 'Funny bonus',      points: 1 },
    ],
    questions: [
      {
        id: 'r2q1',
        term: 'Apa',
        language: 'Yoruba',
        country: 'Nigeria',
        sentence: "Don't mind him, he's just being an apa.",
        meaning: 'An unwise person',
      },
      {
        id: 'r2q2',
        term: 'Chini ya maji',
        language: 'Swahili Slang',
        country: 'East Africa',
        sentence: "Labda wanaskia wivu chini ya maji — Maybe they're jealous chini ya maji.",
        meaning: 'Lowkey / Secretively (literally: under the water)',
      },
      {
        id: 'r2q3',
        term: 'Japa japa',
        language: 'Nigerian Slang',
        country: 'Nigeria',
        sentence: 'The way this economy is looking, everybody must japa o.',
        meaning: 'To run away / flee',
      },
      {
        id: 'r2q4',
        term: 'Tu fiakwa gi',
        language: 'Igbo',
        country: 'Nigeria',
        sentence: 'Me, fail this exam again? Tu fiakwa gi!',
        meaning: 'God forbid! / Not my portion',
      },
      {
        id: 'r2q5',
        term: 'Ŋu tikɔ nam',
        language: 'Ewe',
        country: 'Ghana / Togo',
        sentence: 'This gbevu has been making noise all day — ŋu tikɔ nam.',
        meaning: 'I am tired of this / this is annoying',
      },
      {
        id: 'r2q6',
        term: 'Gbevu',
        language: 'Ewe',
        country: 'Ghana / Togo',
        sentence: 'This gbevu has been making noise all day — ŋu tikɔ nam.',
        meaning: 'Young boy causing trouble',
      },
      {
        id: 'r2q7',
        term: '1+1',
        language: 'Ewe Slang',
        country: 'Ghana / Togo',
        sentence: 'He pulled out his 1+1 like it was still 2005.',
        meaning: 'Very old mobile phones (before smartphones)',
      },
      {
        id: 'r2q8',
        term: 'Foutaise',
        language: 'Nouchi',
        country: "Côte d'Ivoire",
        sentence: "Everything he said was foutaise — c'est dohi.",
        meaning: 'Rubbish / nonsense',
      },
      {
        id: 'r2q9',
        term: "C'est dohi",
        language: 'Nouchi',
        country: "Côte d'Ivoire",
        sentence: "Everything he said was foutaise — c'est dohi.",
        meaning: "It's fake / a lie",
      },
      {
        id: 'r2q10',
        term: 'Babie',
        language: 'Nouchi',
        country: "Côte d'Ivoire",
        sentence: "Je vais te babie — I'm going to hit you. / Elle est babie — she is pretty.",
        meaning: 'To hit someone; also means someone is attractive',
      },
      {
        id: 'r2q11',
        term: 'Gemeh',
        language: 'Cameroon Slang',
        country: 'Cameroon',
        sentence: "Don't mind him — gemeh, gemeh, always making noise and doing nothing.",
        meaning: 'Someone who talks too much but does nothing',
      },
      {
        id: 'r2q12',
        term: "C'est le lait?",
        language: 'Cameroon Slang',
        country: 'Cameroon',
        sentence: "He walked in with a new car like c'est le lait.",
        meaning: "What were you thinking? / Showing off in a self-congratulatory way",
      },
      {
        id: 'r2q13',
        term: 'Ko Jean Claude Vandamme',
        language: 'Congolese Slang',
        country: 'DRC',
        sentence: 'We got to the party late, so I just found one corner and Jean Claude Vandamme there.',
        meaning: 'To sit down (Nazali Jean Claude Vandamme = I am sitting down)',
      },
    ],
  },

  {
    label: 'Round 3',
    name: 'Thesis Translator',
    type: 'thesis',
    scoring: [
      { label: '+1', points: 1 },
      { label: '+2', points: 2 },
      { label: '+3', points: 3 },
    ],
    questions: [
      {
        id: 'r3q1',
        title: 'Eukaryotic Algal Gene Transfers Improve Dating Resolution for Prochlorococcus',
        options: THESIS_OPTIONS,
      },
      {
        id: 'r3q2',
        title: 'The Resilient Factory — Enterprise Asset Management, Cybersecurity, and IT/OT Convergence',
        options: THESIS_OPTIONS,
      },
      {
        id: 'r3q3',
        title: 'Learning What to Ask For: Active Learning for Accurate, Cost-Efficient Interactive Medical Image Segmentation',
        options: THESIS_OPTIONS,
      },
      {
        id: 'r3q4',
        title: 'Mixed Convective Heat Transfer in a Three-Dimensional Corrugated Duct',
        options: THESIS_OPTIONS,
      },
      {
        id: 'r3q5',
        title: 'Impact of Lesion Preparation-Induced Calcified Plaque Defects in Vascular Intervention for Atherosclerotic Disease: In Silico Assessment',
        options: THESIS_OPTIONS,
      },
      {
        id: 'r3q6',
        title: 'A Diffusion Model for Simulation Ready Coronary Anatomy with Morpho-skeletal Control',
        options: THESIS_OPTIONS,
      },
    ],
  },
]

export default rounds
