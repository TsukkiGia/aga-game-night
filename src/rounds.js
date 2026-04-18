import charades        from './rounds/charades.js'
import beforeTheyWereFamous from './rounds/beforeTheyWereFamous.js'
import capitalCities from './rounds/capitalCities.js'
import guessTheLanguage from './rounds/guessTheLanguage.js'
import guessTheSong    from './rounds/guessTheSong.js'
import flagTriviaDescriptions from './rounds/flagTriviaDescriptions.js'
import flagsByImage from './rounds/flagsByImage.js'
import slangBee         from './rounds/slangBee.js'
import thesisTranslator from './rounds/thesisTranslator.js'

const rounds = [
  guessTheLanguage,
  charades,
  slangBee,
  thesisTranslator,
  guessTheSong,
  beforeTheyWereFamous,
  capitalCities,
  flagsByImage,
  flagTriviaDescriptions,
]

export default rounds.map((r, i) => ({
  ...r,
  id: String(r.id || r.type || `round-${i + 1}`),
  label: `Round ${i + 1}`,
}))
