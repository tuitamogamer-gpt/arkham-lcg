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
import Arkham.Homebrew.ScenarioFixes.ApiaryTenderSpec qualified as ApiaryTender
import Arkham.Homebrew.ScenarioFixes.EncounterSearchSpec qualified as EncounterSearch
import Arkham.Homebrew.ScenarioFixes.KeyedEncounterSearchSpec qualified as KeyedEncounterSearch
import Arkham.Homebrew.ScenarioFixes.DoomTimingSpec qualified as DoomTiming
import Arkham.Homebrew.ScenarioFixes.DrownedEnemyTimingSpec qualified as DrownedEnemyTiming
import Arkham.Homebrew.ScenarioFixes.CoreEncounterActionsSpec qualified as CoreEncounterActions
import Arkham.Homebrew.ScenarioFixes.RaisingSuspicionsSpec qualified as RaisingSuspicions
import Arkham.Homebrew.ScenarioFixes.CalcificationSpec qualified as Calcification
import Arkham.Homebrew.ScenarioFixes.WrithingAppendageSpec qualified as WrithingAppendage
import Arkham.Homebrew.ScenarioFixes.FortuneOrFateSpec qualified as FortuneOrFate
import Arkham.Homebrew.ScenarioFixes.ActDoomReceiptSpec qualified as ActDoomReceipt
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
  ApiaryTender.spec
  EncounterSearch.spec
  KeyedEncounterSearch.spec
  DoomTiming.spec
  DrownedEnemyTiming.spec
  CoreEncounterActions.spec
  RaisingSuspicions.spec
  Calcification.spec
  WrithingAppendage.spec
  FortuneOrFate.spec
  ActDoomReceipt.spec
