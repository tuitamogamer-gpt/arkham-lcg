module Main where

import Arkham.Homebrew.Barkham.PlayersSpec qualified as Players
import Arkham.Homebrew.Barkham.ScenarioSpec qualified as Scenario
import Arkham.Homebrew.EpicLabyrinth.CardsSpec qualified as LabyrinthCards
import Arkham.Homebrew.EpicLabyrinth.CoordinatorSpec qualified as LabyrinthCoordinator
import Arkham.Homebrew.EpicLabyrinth.PublicViewSpec qualified as PublicView
import Arkham.Homebrew.EpicLabyrinth.StoriesSpec qualified as LabyrinthStories
import Arkham.Homebrew.EpicLabyrinth.TransferSpec qualified as LabyrinthTransfer
import Arkham.Homebrew.EpicMachinations.CoordinatorSpec qualified as MachinationsCoordinator
import Arkham.Homebrew.EpicMachinations.EntitiesSpec qualified as MachinationsEntities
import Arkham.Homebrew.EpicMachinations.NobleLegacySpec qualified as MachinationsNobleLegacy
import Arkham.Homebrew.EpicMachinations.ScenarioSpec qualified as MachinationsScenario
import Arkham.Homebrew.EpicMachinations.TransactionsSpec qualified as MachinationsTransactions
import Arkham.Homebrew.EpicMachinations.TransportSpec qualified as MachinationsTransport
import Arkham.Homebrew.ScenarioFixes.DrownedCitySpec qualified as DrownedCity
import Arkham.Homebrew.ScenarioFixes.FrenchHillSpec qualified as FrenchHill
import Arkham.Homebrew.ScenarioFixes.QueenOfAshSpec qualified as QueenOfAsh
import Arkham.Homebrew.ScenarioFixes.AGatheringSpec qualified as AGathering
import Arkham.Homebrew.ScenarioFixes.LoathsomeParasitesSpec qualified as LoathsomeParasites
import Arkham.Homebrew.ScenarioFixes.PolarMirageSpec qualified as PolarMirage
import Arkham.Homebrew.ScenarioFixes.StElmosFireSpec qualified as StElmosFire
import Arkham.Homebrew.ScenarioFixes.BlasphemousInvocationSpec qualified as BlasphemousInvocation
import Arkham.Homebrew.ScenarioFixes.SharedThreatAreaSpec qualified as SharedThreatArea
import Prelude (IO)
import Test.Hspec (hspec)

main :: IO ()
main = hspec do
  Players.spec
  Scenario.spec
  LabyrinthCoordinator.spec
  PublicView.spec
  LabyrinthCards.spec
  LabyrinthStories.spec
  LabyrinthTransfer.spec
  MachinationsCoordinator.spec
  MachinationsScenario.spec
  MachinationsEntities.spec
  MachinationsTransport.spec
  MachinationsTransactions.spec
  MachinationsNobleLegacy.spec
  DrownedCity.spec
  LoathsomeParasites.spec
  PolarMirage.spec
  FrenchHill.spec
  QueenOfAsh.spec
  AGathering.spec
  StElmosFire.spec
  BlasphemousInvocation.spec
  SharedThreatArea.spec
