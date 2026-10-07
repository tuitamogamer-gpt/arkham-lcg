module Arkham.Homebrew.EpicLabyrinth.Helpers where

import Arkham.Classes.HasGame
import Arkham.Classes.HasQueue (push)
import Arkham.Classes.Entity (overAttrs)
import Arkham.Game.Base (Game (..))
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Message
import Arkham.Message.Lifted.Queue
import Arkham.Prelude
import Arkham.Question (Question (..), UI (..))
import Arkham.Scenario.Types (Field (ScenarioMeta), setMetaKey)
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Map.Strict qualified as Map

getEpicReplica :: HasGame m => m Replica
getEpicReplica = do
  value <- getScenarioMetaKeyDefault "epicLabyrinthReplica" Null
  pure $ fromJustNote "Epic Labyrinth requires an authoritative event replica" (maybeResult value)

getEpicGroup :: HasGame m => m LabyrinthGroup
getEpicGroup = replicaGroup <$> getEpicReplica

-- The native loop can inspect scenario state before its first queued message
-- runs. Seed the server's locked coordinator pull synchronously, then keep the
-- same messages in the queue so newly installed native entities receive them.
-- Only authoritative replica messages are accepted; ordinary game state and
-- unrelated scenario metadata are preserved.
seedEpicReplicaMessages :: [Message] -> Game -> Game
seedEpicReplicaMessages messages game = foldl' seed game messages
 where
  seed current (ScenarioSpecific "epicLabyrinth.replica" value) = put "epicLabyrinthReplica" value current
  seed current (ScenarioSpecific "epicMachinations.replica" value) = put "epicMachinationsReplica" value current
  seed current _ = current
  put key value current = current {gameMode = fmap (overAttrs $ setMetaKey key value) current.gameMode}

-- A barrier's waiting question is a temporary checkpoint. A round opening or
-- any release resumes native work and its saved tail in that same loop. Stage
-- openings only acknowledge the shared window; their tail waits for release.
-- Other receipts and actual player decisions keep the adapter's usual policy.
resumeBarrierQueue :: Game -> [Message] -> [Message] -> Maybe [Message]
resumeBarrierQueue game savedQueue work = do
  guard $ any resumesNativeWork work
  guard $ not $ Map.null game.gameQuestion
  guard $ all isBarrierWait $ Map.elems game.gameQuestion
  pure $ work <> savedQueue
 where
  resumesNativeWork (ScenarioSpecific "epicLabyrinth.delivery" value) =
    case envelopeBody <$> maybeResult @DeliveryEnvelope value of
      Just (OpenBarrier (RoundBarrier _) _) -> True
      Just (ReleaseBarrier _ _) -> True
      _ -> False
  resumesNativeWork _ = False
  isBarrierWait (QuestionLabel _ _ question) = isBarrierWait question
  isBarrierWait (ChooseOne [Label _ [ScenarioSpecific "epicLabyrinth.wait" _]]) = True
  isBarrierWait _ = False

emitOperation :: ReverseQueue m => Operation -> m ()
emitOperation operation = do
  identifier <- OperationId <$> getId
  group <- getEpicGroup
  push $ ScenarioSpecific "epicLabyrinth.request" $ toJSON $ Request identifier group operation

-- Cards save their own receipts because the scenario and entities receive the
-- same broadcast. Rewards use this before queuing any effect or choice.
deliveryWasApplied :: DeliveryId -> Value -> Bool
deliveryWasApplied did = elem did . appliedDeliveries

appliedDeliveries :: Value -> [DeliveryId]
appliedDeliveries (Object meta) = maybe [] (fromMaybe [] . maybeResult) (KeyMap.lookup "epicLabyrinthApplied" meta)
appliedDeliveries _ = []

markDeliveryApplied :: DeliveryId -> Value -> Value
markDeliveryApplied did value = Object $ KeyMap.insert "epicLabyrinthApplied"
  (toJSON $ nub $ did : appliedDeliveries value) $ case value of
    Object meta -> meta
    _ -> mempty

-- Scope permission choices to the other actual event groups. Target labels do
-- not reveal their play areas or hands.
otherGroups :: HasGame m => m [LabyrinthGroup]
otherGroups = do
  group <- getEpicGroup
  pure $ filter (/= group) allGroups
