{-# LANGUAGE TemplateHaskell #-}
module Arkham.Homebrew.EpicLabyrinth.Content where

import Arkham.EncounterSet qualified as Sets
import Arkham.Homebrew.EpicLabyrinth.CardEntries ()
import Arkham.Homebrew.EpicLabyrinth.Scenario (theLabyrinthsOfLunacy)
import Arkham.Homebrew.Import

data EpicLabyrinthContent

instance IsHomebrewContent EpicLabyrinthContent where
  homebrewContent = $(generateHomebrew)
    { scenarios = [("70001", HomebrewScenario Sets.TheLabyrinthsOfLunacy theLabyrinthsOfLunacy)] }
