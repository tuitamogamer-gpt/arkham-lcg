module Arkham.Homebrew.Barkham.CardDefs.Acts where

import Arkham.Act.CardDefs.Import
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits

nineLives :: CardDef
nineLives =
  act ":barkham:025" "Nine Lives" 1 Set.TheMeddlingOfMeowlathotep

theCatAndTheMouse :: CardDef
theCatAndTheMouse =
  act ":barkham:026" "The Cat and the Mouse" 2 Set.TheMeddlingOfMeowlathotep
