module Arkham.Homebrew.EpicMachinations.NativeEntities where

import Arkham.Card
import Arkham.Classes.HasGame
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Placement
import Arkham.Prelude
import Arkham.Target

nativeAttachmentSnapshots :: Game -> Target -> [(CardId, Value)]
nativeAttachmentSnapshots game target = collect mempty target
 where
  entities = gameEntities game
  allEntities = [(toCardId a, toTarget a, a.placement, "asset", toJSON a) | a <- toList $ entitiesAssets entities]
    <> [(toCardId e, toTarget e, e.placement, "enemy", toJSON e) | e <- toList $ entitiesEnemies entities]
    <> [(toCardId e, toTarget e, e.placement, "event", toJSON e) | e <- toList $ entitiesEvents entities]
    <> [(toCardId t, toTarget t, t.placement, "treachery", toJSON t) | t <- toList $ entitiesTreacheries entities]
  collect :: Set CardId -> Target -> [(CardId, Value)]
  collect seen parent = concatMap (include seen) $ filter (\(_, _, placement, _, _) -> placementToAttached placement == Just parent) allEntities
  include :: Set CardId -> (CardId, Target, Placement, Text, Value) -> [(CardId, Value)]
  include seen (cid, childTarget, _, kind, native)
    | cid `elem` seen = []
    | otherwise = (cid, object ["kind" .= (kind :: Text), "cardId" .= cid, "native" .= native])
        : collect (insertSet cid seen) childTarget

getDirectAttachmentTargets :: HasGame m => Target -> m [Target]
getDirectAttachmentTargets target = do
  entities <- gameEntities <$> getGame
  pure $ [toTarget a | a <- toList $ entitiesAssets entities, placementToAttached a.placement == Just target]
    <> [toTarget e | e <- toList $ entitiesEnemies entities, placementToAttached e.placement == Just target]
    <> [toTarget e | e <- toList $ entitiesEvents entities, placementToAttached e.placement == Just target]
    <> [toTarget t | t <- toList $ entitiesTreacheries entities, placementToAttached t.placement == Just target]
