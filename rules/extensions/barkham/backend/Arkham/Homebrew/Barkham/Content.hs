{-# LANGUAGE TemplateHaskell #-}
module Arkham.Homebrew.Barkham.Content where

import Arkham.Homebrew.Barkham.CardEntries ()
import Arkham.Homebrew.Barkham.Scenarios.TheMeddlingOfMeowlathotep (theMeddlingOfMeowlathotep)
import Arkham.Homebrew.Barkham.Sets
import Arkham.Homebrew.Import

data BarkhamContent

instance IsHomebrewContent BarkhamContent where
  homebrewContent = $(generateHomebrew)
    { scenarios = [(":barkham:022", HomebrewScenario TheMeddlingOfMeowlathotep theMeddlingOfMeowlathotep)] }
