module Arkham.Homebrew.EpicMachinations.Helpers where

import Arkham.Classes.HasGame
import Arkham.Classes.HasQueue (push)
import Arkham.Game.Base (Game (..))
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Types (OperationId (..))
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Message
import Arkham.Message.Lifted.Queue
import Arkham.Prelude
import Arkham.Question (Question (..), UI (..))
import Data.List qualified as List
import Data.Map.Strict qualified as Map

-- Shared choices can arrive while a table is still resolving ordinary setup.
-- Once it reaches the printed shared-setup checkpoint, promote those already
-- queued receipts exactly once and retire the obsolete waiting ask.
resumeSharedSetupQueue :: Game -> [Message] -> [Message] -> Maybe [Message]
resumeSharedSetupQueue game savedQueue work = do
  guard game.gameInSetup
  guard $ not $ Map.null game.gameQuestion
  guard $ all isSetupWait $ Map.elems game.gameQuestion
  let (deferred, remainder) = List.partition isInstallation savedQueue
  guard $ not (null deferred) || any isInstallation work
  pure $ deferred <> work <> remainder
 where
  isSetupWait (QuestionLabel _ _ question) = isSetupWait question
  isSetupWait (ChooseOne [Label _ [ScenarioSpecific "epicMachinations.wait" _]]) = True
  isSetupWait _ = False
  isInstallation (ScenarioSpecific "epicMachinations.delivery" value) =
    case machinationsDeliveryBody <$> maybeResult @MachinationsEnvelope value of
      Just (InstallSharedStory _) -> True
      _ -> False
  isInstallation _ = False

getMachinationsReplica :: HasGame m => m MachinationsReplica
getMachinationsReplica = do
  value <- getScenarioMetaKeyDefault "epicMachinationsReplica" Null
  pure $ fromJustNote "Epic Machinations requires its authoritative three-era event replica" $ maybeResult value

getEra :: HasGame m => m Era
getEra = currentEra <$> getMachinationsReplica

getGlobalPlayerCount :: HasGame m => m Int
getGlobalPlayerCount = globalPlayers <$> getMachinationsReplica

emitMachinations :: ReverseQueue m => MachinationsOperation -> m ()
emitMachinations operation = do
  identifier <- OperationId <$> getId
  era <- getEra
  push $ ScenarioSpecific "epicMachinations.request" $ toJSON $ MachinationsRequest identifier era operation
