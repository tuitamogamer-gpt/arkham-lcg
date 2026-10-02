{-# LANGUAGE TemplateHaskell #-}
module Arkham.Homebrew.EpicMachinations.Defs where

import Arkham.Homebrew.DefsBase
import Arkham.Homebrew.EpicMachinations.CardDefEntries ()
import Arkham.Homebrew.Generate (generateHomebrewCardDefs)

data EpicMachinationsDefs

instance IsHomebrewDefs EpicMachinationsDefs where
  homebrewDefs = discoveredDefs $(generateHomebrewCardDefs)
