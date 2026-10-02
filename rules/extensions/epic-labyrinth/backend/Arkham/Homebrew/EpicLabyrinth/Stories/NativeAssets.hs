module Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets where

import Arkham.Asset.Types (Asset)
import Arkham.Card
import Arkham.Classes.HasGame
import Arkham.Enemy.Types (Enemy)
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Game.Utils qualified as Native
import Arkham.Id
import Arkham.Placement
import Arkham.Prelude
import Arkham.Target
import Data.Map.Strict qualified as Map

-- The source import in the story runners breaks the registry/entity dependency
-- cycle while retaining the engine's original complete native asset instance.
getNativeAsset :: (HasCallStack, HasGame m) => AssetId -> m Asset
getNativeAsset = Native.getAsset

getNativeEnemy :: (HasCallStack, HasGame m) => EnemyId -> m Enemy
getNativeEnemy = Native.getEnemy

getNativeCard :: HasGame m => CardId -> m (Maybe Card)
getNativeCard cid = Map.lookup cid . gameCards <$> getGame

-- Include the whole attachment graph, using each original entity's native
-- encoding. The recipient keeps IDs, attachment targets and card state.
getNativeAttachments :: HasGame m => Target -> m [(CardId, Value)]
getNativeAttachments target = do
  entities <- gameEntities <$> getGame
  let assets = [(toCardId a, toTarget a, a.placement, "asset", toJSON a) | a <- toList $ entitiesAssets entities]
      enemies = [(toCardId e, toTarget e, e.placement, "enemy", toJSON e) | e <- toList $ entitiesEnemies entities]
      treacheries = [(toCardId t, toTarget t, t.placement, "treachery", toJSON t) | t <- toList $ entitiesTreacheries entities]
      events = [(toCardId e, toTarget e, e.placement, "event", toJSON e) | e <- toList $ entitiesEvents entities]
      allEntities = assets <> enemies <> treacheries <> events
      gather :: Set CardId -> Target -> [(CardId, Value)]
      gather seen parent = concatMap (include seen) $ filter (\(_, _, placement, _, _) -> placementToAttached placement == Just parent) allEntities
      include :: Set CardId -> (CardId, Target, Placement, Text, Value) -> [(CardId, Value)]
      include seen (cid, entityTarget, _, kind, native)
        | cid `elem` seen = []
        | otherwise = (cid, object ["kind" .= (kind :: Text), "cardId" .= cid, "native" .= native]) : gather (insertSet cid seen) entityTarget
  pure $ gather mempty target
