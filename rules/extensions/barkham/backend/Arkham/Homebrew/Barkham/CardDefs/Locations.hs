module Arkham.Homebrew.Barkham.CardDefs.Locations where

import Arkham.Location.CardDefs.Import
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits

beasttown :: CardDef
beasttown =
  location ":barkham:027" "Beasttown" [Barkham, Central] Triangle [Diamond, Trefoil, Hourglass, Plus, T, Squiggle] Set.TheMeddlingOfMeowlathotep

tailside :: CardDef
tailside =
  location ":barkham:028" "Tailside" [Barkham, Central] Hourglass [Triangle, Diamond, Square, Plus, T] Set.TheMeddlingOfMeowlathotep

snoutside :: CardDef
snoutside =
  location ":barkham:029" "Snoutside" [Barkham, Central] Plus [Triangle, Square, Hourglass, Star, T, Heart] Set.TheMeddlingOfMeowlathotep

slobbertown :: CardDef
slobbertown =
  location ":barkham:030" "Slobbertown" [Barkham, Central] T [Triangle, Trefoil, Hourglass, Star, Plus] Set.TheMeddlingOfMeowlathotep

barkhamAsylum :: CardDef
barkhamAsylum =
  victory 1 $ location ":barkham:031" "Barkham Asylum" [Barkham] Diamond [Triangle, Trefoil, Hourglass, Squiggle] Set.TheMeddlingOfMeowlathotep

boneyard :: CardDef
boneyard =
  victory 1 $ location ":barkham:032" "Boneyard" [Barkham] Star [Square, Plus, T, Heart] Set.TheMeddlingOfMeowlathotep

muttskatonicUniversity :: CardDef
muttskatonicUniversity =
  victory 1 $ location ":barkham:033" "Muttskatonic University" [Barkham] Square [Hourglass, Star, Plus, Heart] Set.TheMeddlingOfMeowlathotep

barkhamCityPound :: CardDef
barkhamCityPound =
  victory 1 $ location ":barkham:034" "Barkham City Pound" [Barkham] Trefoil [Triangle, Diamond, T, Squiggle] Set.TheMeddlingOfMeowlathotep

stMarysAnimalHospital :: CardDef
stMarysAnimalHospital =
  victory 1 $ location ":barkham:035" "St. Mary's Animal Hospital" [Barkham] Heart [Square, Star, Plus] Set.TheMeddlingOfMeowlathotep

velmasDoghouse :: CardDef
velmasDoghouse =
  victory 1 $ location ":barkham:036" "Velma's Doghouse" [Barkham] Squiggle [Triangle, Diamond, Trefoil] Set.TheMeddlingOfMeowlathotep
