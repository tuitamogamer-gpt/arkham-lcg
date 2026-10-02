{-# LANGUAGE TemplateHaskell #-}
module Arkham.Homebrew.Barkham.Defs where

import Arkham.Homebrew.Barkham.CardDefEntries ()
import Arkham.Homebrew.Barkham.Traits qualified as Traits
import Arkham.Homebrew.DefsBase
import Arkham.Homebrew.Generate (generateHomebrewCardDefs)

data BarkhamDefs

instance IsHomebrewDefs BarkhamDefs where
  homebrewDefs = (discoveredDefs $(generateHomebrewCardDefs)) {hdTraits = Traits.traits}
