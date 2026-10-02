module Arkham.Homebrew.EpicMachinations.Helpers where

import Arkham.Classes.HasGame
import Arkham.Classes.HasQueue (push)
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Types (OperationId (..))
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Message
import Arkham.Message.Lifted.Queue
import Arkham.Prelude

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
