export default {
  label: 'Round 3',
  name: 'Slang Bee',
  type: 'slang',
  intro: 'The host reads a slang term, an example sentence, and its country of origin. Try and guess the meaning of the word!',
  rules: [
    'Host reads the term, example sentence, and country of origin',
    'Buzz in to give the meaning — correct answer: +3 pts',
    'Bonus +1 if your answer is especially funny (host decides)',
    'One steal allowed after a miss — +2 correct, −1 wrong',
  ],
  scoring: [
    { label: 'Correct meaning', points: 3 },
    { label: 'Funny bonus',     points: 1 },
    { label: 'Correct steal',   points: 2 },
    { label: 'Wrong steal',     points: -1 },
  ],
  questions: [
    {
      id: 'r2q1',
      term: 'Yawa',
      language: 'Ghanaian Slang',
      country: 'Ghana',
      sentence: 'I forgot my wallet at dinner — serious yawa o.',
      meaning: 'Embarrassment, trouble, or a messy situation',
    },
    {
      id: 'r2q2',
      term: 'Ndem',
      language: 'Camfranglais',
      country: 'Cameroon',
      sentence: "If I ndem this exam after all that studying, I'll cry.",
      meaning: 'To fail',
    },
    {
      id: 'r2q3',
      term: 'Ngori',
      language: 'Sheng',
      country: 'Kenya',
      sentence: "Don't go there tonight, kuna ngori.",
      meaning: 'Trouble or difficulty',
    },
  ],
}
