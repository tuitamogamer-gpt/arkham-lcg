module Arkham.Homebrew.EpicMachinations.Stories.Shared where

import Arkham.Homebrew.EpicLabyrinth.Helpers (deliveryWasApplied, markDeliveryApplied)
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Message
import Arkham.Prelude
import Arkham.Story.Types (StoryAttrs (..))
import Data.Aeson.KeyMap qualified as KeyMap

storyReplica :: StoryAttrs -> Maybe MachinationsReplica
storyReplica attrs = case attrs.meta of
  Object values -> KeyMap.lookup "epicMachinationsReplica" values >>= maybeResult
  _ -> Nothing

syncStoryReplica :: StoryAttrs -> Message -> Maybe StoryAttrs
syncStoryReplica attrs = \case
  ScenarioSpecific "epicMachinations.replica" value -> do
    _ <- maybeResult @MachinationsReplica value
    pure attrs {storyMeta = Object $ KeyMap.insert "epicMachinationsReplica" value $ case attrs.meta of
      Object values -> values
      _ -> mempty}
  _ -> Nothing

newStoryDelivery :: StoryAttrs -> Message -> Maybe (MachinationsDelivery, StoryAttrs)
newStoryDelivery attrs = \case
  ScenarioSpecific "epicMachinations.delivery" value -> do
    envelope <- maybeResult @MachinationsEnvelope value
    guard $ not $ deliveryWasApplied envelope.machinationsDeliveryId attrs.meta
    pure (envelope.machinationsDeliveryBody, attrs {storyMeta = markDeliveryApplied envelope.machinationsDeliveryId attrs.meta})
  _ -> Nothing

edwinElsewhere :: (EraProgress -> Bool) -> StoryAttrs -> Bool
edwinElsewhere predicate attrs = maybe False (\replica -> any
  (\(era, progress) -> era /= replica.currentEra && predicate progress) $ mapToList replica.eraProgress) $ storyReplica attrs

allPlotsFinished :: StoryAttrs -> Bool
allPlotsFinished attrs = maybe False finished $ storyReplica attrs
 where
  -- An empty initial or stale progress report does not mean the selected plot
  -- has finished. Mob and Anomalies enter completedStories only after all
  -- three local copies complete; Abomination completes globally.
  finished replica = maybe False (`elem` replica.completedStories) replica.chosenPlot
    && all (\progress -> all (`notElem` progress.eraStories) ["87038", "87039", "87042"])
      (map snd $ mapToList replica.eraProgress)
