module Arkham.Homebrew.Barkham.CardDefs.Enemies where

import Arkham.Enemy.CardDefs.Import
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits
import Arkham.Keyword qualified as Keyword

meowlathotep :: CardDef
meowlathotep =
  unique $ (enemy ":barkham:037" "Meowlathotep" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 2
    , cdSanityDamage = sanityDamage 2
    , cdFight = fight 3
    , cdEvade = evade 3
    , cdHealth = healthPerInvestigator 4
    , cdCardTraits = setFromList [AncientOne, Elite]
    , cdKeywords = setFromList [Keyword.Hunter]
    , cdVictoryPoints = Just 3
    }

theHisserInTheDark :: CardDef
theHisserInTheDark =
  unique $ (enemy ":barkham:038" "The Hisser in the Dark" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 3
    , cdEvade = evade 3
    , cdHealth = health 4
    , cdCardTraits = setFromList [Monster, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter, Keyword.Alert]
    , cdVictoryPoints = Just 1
    }

catOfTindalos :: CardDef
catOfTindalos =
  unique $ (enemy ":barkham:039" "Cat of Tindalos" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 2
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 2
    , cdEvade = evade 3
    , cdHealth = health 3
    , cdCardTraits = setFromList [Monster, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter, Keyword.Retaliate]
    , cdVictoryPoints = Just 1
    }

theDwellerInTheDeep :: CardDef
theDwellerInTheDeep =
  unique $ (enemy ":barkham:040" "The Dweller in the Deep" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 2
    , cdFight = fight 3
    , cdEvade = evade 2
    , cdHealth = health 3
    , cdCardTraits = setFromList [Monster, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter, Keyword.Alert]
    , cdVictoryPoints = Just 1
    }

theMewlingHunger :: CardDef
theMewlingHunger =
  unique $ (enemy ":barkham:041" "The Mewling Hunger" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 2
    , cdEvade = evade 2
    , cdHealth = health 5
    , cdCardTraits = setFromList [Humanoid, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter]
    , cdVictoryPoints = Just 1
    }

ghostCat :: CardDef
ghostCat =
  unique $ (enemy ":barkham:042" "GHOST CAT!" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 0
    , cdSanityDamage = sanityDamage 2
    , cdFight = fight 2
    , cdEvade = evade 4
    , cdHealth = health 2
    , cdCardTraits = setFromList [Creature, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter, Keyword.Alert]
    , cdVictoryPoints = Just 1
    }

catRidingOnAByakat :: CardDef
catRidingOnAByakat =
  unique $ (enemy ":barkham:043" "Cat Riding on a Byakat" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 2
    , cdEvade = evade 3
    , cdHealth = health 4
    , cdCardTraits = setFromList [Monster, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter]
    , cdVictoryPoints = Just 1
    }

pouncerInTheNight :: CardDef
pouncerInTheNight =
  unique $ (enemy ":barkham:044" "Pouncer in the Night" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 2
    , cdSanityDamage = sanityDamage 0
    , cdFight = fight 4
    , cdEvade = evade 2
    , cdHealth = health 2
    , cdCardTraits = setFromList [Humanoid, Meowsk, Elite]
    , cdKeywords = setFromList [Keyword.Hunter, Keyword.Retaliate]
    , cdVictoryPoints = Just 1
    }

estrangedCat :: CardDef
estrangedCat =
  (enemy ":barkham:045" "Estranged Cat" Set.TheMeddlingOfMeowlathotep 3)
    { cdHealthDamage = healthDamage 0
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 3
    , cdEvade = evade 2
    , cdHealth = health 1
    , cdCardTraits = setFromList [Creature]
    , cdKeywords = setFromList []
    }

rodentKiller :: CardDef
rodentKiller =
  (enemy ":barkham:046" "Rodent-Killer" Set.TheMeddlingOfMeowlathotep 2)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 3
    , cdEvade = evade 3
    , cdHealth = health 3
    , cdCardTraits = setFromList [Humanoid, Cultist]
    , cdKeywords = setFromList [Keyword.Hunter]
    }

orderCultist :: CardDef
orderCultist =
  (enemy ":barkham:047" "Order Cultist" Set.TheMeddlingOfMeowlathotep 1)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 0
    , cdFight = fight 4
    , cdEvade = evade 1
    , cdHealth = health 2
    , cdCardTraits = setFromList [Humanoid, Cultist]
    , cdKeywords = setFromList [Keyword.Retaliate]
    }

servantOfDogSothoth :: CardDef
servantOfDogSothoth =
  (enemy ":barkham:048" "Servant of Dog-Sothoth" Set.TheMeddlingOfMeowlathotep 2)
    { cdHealthDamage = healthDamage 1
    , cdSanityDamage = sanityDamage 1
    , cdFight = fight 2
    , cdEvade = evade 2
    , cdHealth = health 4
    , cdCardTraits = setFromList [Monster, Catbomination]
    , cdKeywords = setFromList [Keyword.Retaliate, Keyword.Alert]
    }
