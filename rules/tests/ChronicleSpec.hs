module Main where

import Arkham.Homebrew.Barkham.PlayersSpec qualified as Players
import Arkham.Homebrew.Barkham.ScenarioSpec qualified as Scenario
import Arkham.Homebrew.EpicLabyrinth.CardsSpec qualified as EpicCards
import Arkham.Homebrew.EpicLabyrinth.CoordinatorSpec qualified as EpicCoordinator
import Arkham.Homebrew.EpicLabyrinth.PublicViewSpec qualified as PublicView
import Arkham.Homebrew.EpicLabyrinth.StoriesSpec qualified as EpicStories
import Arkham.Homebrew.EpicLabyrinth.TransferSpec qualified as EpicTransfer
import Prelude (IO)
import Test.Hspec (hspec)

main :: IO ()
main = hspec do
  Players.spec
  Scenario.spec
  EpicCoordinator.spec
  PublicView.spec
  EpicCards.spec
  EpicStories.spec
  EpicTransfer.spec
