// Videos: place .mp4 files in public/videos/ named r1-01.mp4 through r1-08.mp4
// Fill in the answer and explanation fields below.

export default {
  label: 'Round 2',
  name: 'Guess the Language',
  type: 'video',
  intro: 'Watch a comedic video in a language, register, or slang variety from African and diasporic communities. Identify what you hear.',
  rules: [
    'Give the language or country',
    'No word-for-word translation needed — capturing the vibe counts',
    'Buzz in to answer — correct language scores 3pts, correct country scores 1pt',
    'A steal is always available after any answer — +2 correct, −1 wrong',
    'Host reveals the answer with a short explanation',
  ],
  scoring: [
    { label: 'Correct language', points: 3 },
    { label: 'Correct country',  points: 1 },
    { label: 'Correct steal',    points: 2 },
    { label: 'Wrong steal',      points: -1 },
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
}
