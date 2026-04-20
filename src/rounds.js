import charades        from './rounds/charades.js'
import beforeTheyWereFamous from './rounds/beforeTheyWereFamous.js'
import capitalCities from './rounds/capitalCities.js'
import guessTheLanguage from './rounds/guessTheLanguage.js'
import guessTheSong    from './rounds/guessTheSong.js'
import flagTriviaDescriptions from './rounds/flagTriviaDescriptions.js'
import flagsByImage from './rounds/flagsByImage.js'
import countryOutlines from './rounds/countryOutlines.js'
import africanDishes from './rounds/africanDishes.js'
import africanSkylines from './rounds/africanSkylines.js'
import beforeAndAfter from './rounds/beforeAndAfter.js'
import africanHistory from './rounds/africanHistory.js'
import whoAmI from './rounds/whoAmI.js'
import nameTheCountry from './rounds/nameTheCountry.js'
import slangBee         from './rounds/slangBee.js'
import thesisTranslator from './rounds/thesisTranslator.js'

const rounds = [
  guessTheLanguage,
  capitalCities,
  flagsByImage,
  countryOutlines,
  africanDishes,
  africanSkylines,
  beforeAndAfter,
  africanHistory,
  whoAmI,
  nameTheCountry,
  flagTriviaDescriptions,
  charades,
  slangBee,
  thesisTranslator,
  guessTheSong,
  beforeTheyWereFamous,
]

export default rounds.map((r, i) => ({
  ...r,
  id: String(r.id || r.type || `round-${i + 1}`),
  label: `Round ${i + 1}`,
}))
