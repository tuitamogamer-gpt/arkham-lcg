{-# LANGUAGE TemplateHaskell #-}
module Arkham.Homebrew.EpicMachinations.Content where

import Arkham.EncounterSet qualified as Sets
import Arkham.Homebrew.EpicMachinations.CardEntries ()
import Arkham.Homebrew.EpicMachinations.Scenario (machinationsThroughTime)
import Arkham.Homebrew.Import

data EpicMachinationsContent

instance IsHomebrewContent EpicMachinationsContent where
  homebrewContent = $(generateHomebrew)
    {scenarios = [("87001", HomebrewScenario Sets.MachinationsThroughTime machinationsThroughTime)]}
