module Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets where

import Arkham.Asset.Types (Asset)
import Arkham.Classes.HasGame
import Arkham.Card (Card, CardId)
import Arkham.Enemy.Types (Enemy)
import Arkham.Id
import Arkham.Prelude
import Arkham.Target

getNativeAsset :: (HasCallStack, HasGame m) => AssetId -> m Asset
getNativeEnemy :: (HasCallStack, HasGame m) => EnemyId -> m Enemy
getNativeCard :: HasGame m => CardId -> m (Maybe Card)
getNativeAttachments :: HasGame m => Target -> m [(CardId, Value)]
