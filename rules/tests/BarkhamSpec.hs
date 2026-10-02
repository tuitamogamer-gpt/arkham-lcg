module Main where

import Arkham.Homebrew.Barkham.PlayersSpec qualified as Players
import Arkham.Homebrew.Barkham.ScenarioSpec qualified as Scenario
import Prelude (IO)
import Test.Hspec (hspec)

main :: IO ()
main = hspec do
  Players.spec
  Scenario.spec
