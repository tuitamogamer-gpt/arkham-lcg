module Arkham.Homebrew.Barkham.CardDefs.Treacheries where

import Arkham.Treachery.CardDefs.Import
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits

squirrel :: CardDef
squirrel =
  (treachery ":barkham:049" "SQUIRREL!" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Squirrel] }

huntedByByakats :: CardDef
huntedByByakats =
  (treachery ":barkham:050" "Hunted by Byakats" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Scheme] }

onYourTail :: CardDef
onYourTail =
  (treachery ":barkham:051" "On Your Tail" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Scheme] }

catsInTheMist :: CardDef
catsInTheMist =
  (treachery ":barkham:052" "Cats in the Mist" Set.TheMeddlingOfMeowlathotep 3)
    { cdCardTraits = setFromList [Terror] }

scratchingPaws :: CardDef
scratchingPaws =
  (treachery ":barkham:053" "Scratching Paws" Set.TheMeddlingOfMeowlathotep 3)
    { cdCardTraits = setFromList [Hazard] }

meowsksOfMeowlathotep :: CardDef
meowsksOfMeowlathotep =
  (treachery ":barkham:054" "Meowsks of Meowlathotep" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Power] }

stubbornCat :: CardDef
stubbornCat =
  (treachery ":barkham:055" "Stubborn Cat" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Hazard] }

mischiefAndChaos :: CardDef
mischiefAndChaos =
  (treachery ":barkham:056" "Mischief and Chaos" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Scheme] }

gazeOfTheCeilingCat :: CardDef
gazeOfTheCeilingCat =
  (treachery ":barkham:057" "Gaze of the Ceiling Cat" Set.TheMeddlingOfMeowlathotep 2)
    { cdCardTraits = setFromList [Terror] }
