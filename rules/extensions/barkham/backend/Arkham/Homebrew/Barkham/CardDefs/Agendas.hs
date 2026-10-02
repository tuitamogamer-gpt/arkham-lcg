module Arkham.Homebrew.Barkham.CardDefs.Agendas where

import Arkham.Agenda.CardDefs.Import
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits

ofCatsAndDogs :: CardDef
ofCatsAndDogs =
  agenda ":barkham:023" "Of Cats and Dogs" 1 Set.TheMeddlingOfMeowlathotep

meowlathotepsScheme :: CardDef
meowlathotepsScheme =
  agenda ":barkham:024" "Meowlathotep's Scheme" 2 Set.TheMeddlingOfMeowlathotep
