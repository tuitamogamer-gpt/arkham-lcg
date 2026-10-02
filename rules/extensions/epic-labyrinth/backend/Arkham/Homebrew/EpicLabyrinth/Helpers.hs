module Arkham.Homebrew.EpicLabyrinth.Helpers where

import Arkham.Classes.HasGame
import Arkham.Classes.HasQueue (push)
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Message
import Arkham.Message.Lifted.Queue
import Arkham.Prelude
import Arkham.Scenario.Types (Field (ScenarioMeta))
import Data.Aeson.KeyMap qualified as KeyMap

getEpicReplica :: HasGame m => m Replica
getEpicReplica = do
  value <- getScenarioMetaKeyDefault "epicLabyrinthReplica" Null
  pure $ fromJustNote "Epic Labyrinth requires an authoritative event replica" (maybeResult value)

getEpicGroup :: HasGame m => m LabyrinthGroup
getEpicGroup = replicaGroup <$> getEpicReplica

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
