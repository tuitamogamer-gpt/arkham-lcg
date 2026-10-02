module Arkham.Homebrew.Barkham.CardDefs.Players where

import Arkham.Asset.Cards.Import hiding (signature, investigator, event, skill, weakness)
import Arkham.Card.CardCode (CardCode)
import Arkham.Criteria (Exists (..))
import Arkham.Actions (Actions (..))
import Arkham.Asset.Cards.Base qualified as Asset
import Arkham.Enemy.CardDefs.Base qualified as Enemy
import Arkham.Event.Cards.Base qualified as Event
import Arkham.Skill.CardDefs.Base qualified as Skill
import Arkham.Treachery.CardDefs.Base qualified as Treachery
import Arkham.Homebrew.Barkham.Traits
import Arkham.Id
import Arkham.Keyword qualified as Keyword

investigatorCard :: CardCode -> Name -> ClassSymbol -> [Trait] -> CardDef
investigatorCard code name cls cardTraits = (emptyCardDef code name InvestigatorType)
  { cdClassSymbols = singleton cls, cdCardTraits = setFromList cardTraits, cdUnique = True, cdLevel = Nothing }

barkHarrigan :: CardDef
barkHarrigan = investigatorCard ":barkham:001" ("Bark Harrigan" <:> "The Dog of War") Guardian [Veteran]

catlingGun :: CardDef
catlingGun = (Asset.asset ":barkham:002" "Catling Gun" 5 Neutral)
  { cdSkills = [#willpower, #combat, #wild]
  , cdCardTraits = setFromList [Item, Weapon, Firearm]
  , cdSlots = [#hand, #hand]
  , cdUses = uses Ammo 12
  , cdDeckRestrictions = [Signature ":barkham:001"]
  , cdLevel = Nothing
  }

moreBarkThanBite :: CardDef
moreBarkThanBite = (Treachery.signature ":barkham:001" $ Treachery.weakness ":barkham:003" "More Bark Than Bite")
  { cdCardTraits = singleton Flaw }

kateWinthpup :: CardDef
kateWinthpup = investigatorCard ":barkham:004" ("Kate Winthpup" <:> "The Laboratory Labrador") Seeker [Scholar, Pup]

felineDiscombobulator :: CardDef
felineDiscombobulator = (Asset.asset ":barkham:005" ("Feline Discombobulator" <:> "It Discombobulates Felines") 2 Neutral)
  { cdSkills = [#intellect, #agility, #wild]
  , cdCardTraits = setFromList [Item, Science]
  , cdSlots = [#accessory]
  , cdDeckRestrictions = [Signature ":barkham:004"]
  , cdLevel = Nothing
  }

foulOdor :: CardDef
foulOdor = (Treachery.signature ":barkham:004" $ Treachery.weakness ":barkham:006" "Foul Odor")
  { cdCardTraits = singleton Madness }

skidsODrool :: CardDef
skidsODrool = investigatorCard ":barkham:007" ("\"Skids\" O'Drool" <:> "The Pound Escapee") Rogue [Criminal]

takeTheWheel :: CardDef
takeTheWheel = (Event.signature ":barkham:007" $ Event.event ":barkham:008" "Take the Wheel" 2 Neutral)
  { cdSkills = [#combat, #agility, #wild]
  , cdFastWindow = Just (DuringTurn You)
  }

dogcatchers :: CardDef
dogcatchers = (Enemy.signature ":barkham:007" $ Enemy.weakness ":barkham:009" "Dogcatchers")
  { cdCardTraits = singleton Humanoid
  , cdFight = Enemy.fight 2
  , cdHealth = Enemy.health 3
  , cdEvade = Enemy.evade 3
  , cdHealthDamage = Enemy.healthDamage 1
  , cdSanityDamage = Enemy.sanityDamage 1
  , cdKeywords = singleton Keyword.Hunter
  }

jacquelineCanine :: CardDef
jacquelineCanine = investigatorCard ":barkham:010" ("Jacqueline Canine" <:> "The Paw Reader") Mystic [Clairvoyant]

chewToyOfNightmares :: CardDef
chewToyOfNightmares = (Asset.asset ":barkham:011" ("Chew Toy of Nightmares" <:> "Nightmares, I Tell You") 1 Neutral)
  { cdSkills = [#willpower, #intellect, #wild]
  , cdCardTraits = setFromList [Item, Relic, Cursed]
  , cdSlots = [#hand]
  , cdDeckRestrictions = [Signature ":barkham:010"]
  , cdLevel = Nothing
  }

noSenseOfSpaceOrTime :: CardDef
noSenseOfSpaceOrTime = (Treachery.signature ":barkham:010" $ Treachery.weakness ":barkham:012" "No Sense of Space or Time")
  { cdCardTraits = singleton Flaw }

duke :: CardDef
duke = investigatorCard ":barkham:013" ("Duke" <:> "The Good Boy") Survivor [Drifter]

friendlyHuman :: CardDef
friendlyHuman = (Asset.asset ":barkham:014" ("Friendly Human" <:> "I Guess His Name is \"Pete?\"") 2 Neutral)
  { cdCardTraits = singleton Ally
  , cdUses = uses Supply 5
  , cdDeckRestrictions = [Signature ":barkham:013"]
  , cdLevel = Nothing
  }

outOfDoggieTreats :: CardDef
outOfDoggieTreats = (Treachery.signature ":barkham:013" $ Treachery.weakness ":barkham:015" "Out of Doggie Treats")
  { cdCardTraits = singleton Blunder }

spikedCollar :: CardDef
spikedCollar = (Asset.asset ":barkham:016" "Spiked Collar" 3 Guardian)
  { cdSkills = [#combat], cdCardTraits = setFromList [Item, Armor], cdSlots = [#accessory] }

dogMonocle :: CardDef
dogMonocle = (Asset.asset ":barkham:017" "Dog Monocle" 2 Seeker)
  { cdSkills = [#intellect], cdCardTraits = setFromList [Item, Tool, Classy], cdSlots = [#accessory] }

hiredDogs :: CardDef
hiredDogs = (Asset.asset ":barkham:018" "Hired Dogs" 3 Rogue)
  { cdSkills = [#intellect, #combat], cdCardTraits = setFromList [Ally, Creature, FellowDogs], cdSlots = [#ally] }

howlOfClyhfford :: CardDef
howlOfClyhfford = (Event.event ":barkham:019" "Howl of Clyhf'ford" 5 Mystic)
  { cdSkills = [#willpower, #agility], cdCardTraits = singleton Spell
  , cdActions = AndActions [#evade]
  , cdCriteria = Just $ exists AnyEnemy
  }

oldShoe :: CardDef
oldShoe = (Asset.asset ":barkham:020" "Old Shoe" 1 Survivor)
  { cdSkills = [#willpower], cdCardTraits = setFromList [Item, Footwear] }

hairOfTheDog :: CardDef
hairOfTheDog = (Skill.skill ":barkham:021" "Hair of the Dog" [#wild, #wild, #wild, #wild] Neutral)
  { cdCardTraits = singleton Illicit, cdCommitRestrictions = [MaxOnePerTest] }
