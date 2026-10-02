module Arkham.Homebrew.EpicLabyrinth.Gate (gateMessage) where

import Arkham.Classes.Entity
import Arkham.Game.Base
import Arkham.Message
import Arkham.Phase (Phase (MythosPhase))
import Arkham.Homebrew.EpicLabyrinth.ReturnBridge (gateOwnerReturn)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Prelude
import Arkham.Scenario.Types
import Data.Map.Strict qualified as Map
import Data.These

-- Called once after popping a message, before any entity sees it. Scenario
-- handlers cannot gate a message that has already reached Game/Act/Agenda.
gateMessage :: Game -> Message -> Message
gateMessage game original = fromMaybe message do
  scenario <- case game.gameMode of
    That s -> Just s
    These _ s -> Just s
    _ -> Nothing
  let attrs = toAttrs scenario
  guard $ getMetaKeyDefault "epicMultiplayer" False attrs && attrs.id == "70001"
  let roundNumber = getMetaKeyDefault "epicLabyrinthRound" 1 attrs
      stages = getMetaKeyDefault "epicLabyrinthBarriers" mempty attrs :: Map BarrierKey Barrier
      currentStage = getMetaKeyDefault "epicLabyrinthStage" 1 attrs
      hasOpened key = maybe False barrierOpened $ Map.lookup key stages
      hasReleased key = maybe False barrierReleased $ Map.lookup key stages
      wait kind key continuation = ScenarioSpecific kind $ toJSON (key, continuation)
  case message of
    Begin MythosPhase | getMetaKeyDefault "epicLabyrinthTimeExpired" False attrs ->
      Just $ ScenarioSpecific "epicLabyrinth.advanceAtMythos" $ toJSON message
    EndRoundWindow | not $ hasOpened (RoundBarrier roundNumber) ->
      Just $ wait "epicLabyrinth.arrive" (RoundBarrier roundNumber) message
    EndRound | not $ hasReleased (RoundBarrier roundNumber) ->
      Just $ wait "epicLabyrinth.finish" (RoundBarrier roundNumber) message
    AdvanceAgendaBy {} | currentStage < 3 && not (hasReleased $ StageBarrier currentStage) ->
      Just $ wait "epicLabyrinth.arrive" (StageBarrier currentStage) message
    _ -> Nothing
 where
  message = gateOwnerReturn game original
