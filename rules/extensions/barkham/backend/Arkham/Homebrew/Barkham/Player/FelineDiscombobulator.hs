module Arkham.Homebrew.Barkham.Player.FelineDiscombobulator (felineDiscombobulator) where

import Arkham.Ability
import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Window (spawnedEnemy)
import Arkham.Matcher

newtype FelineDiscombobulator = FelineDiscombobulator AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

felineDiscombobulator :: AssetCard FelineDiscombobulator
felineDiscombobulator = asset FelineDiscombobulator Cards.felineDiscombobulator

-- The twelve printed encounter enemies are all cats or cat-person hybrids.
-- Dogcatchers is deliberately excluded: it is the human signature weakness.
cats :: EnemyMatcher
cats = oneOf $ map EnemyIs
  [ ":barkham:037", ":barkham:038", ":barkham:039", ":barkham:040"
  , ":barkham:041", ":barkham:042", ":barkham:043", ":barkham:044"
  , ":barkham:045", ":barkham:046", ":barkham:047", ":barkham:048"
  ]

instance HasAbilities FelineDiscombobulator where
  getAbilities (FelineDiscombobulator a) =
    [ controlled a 1 NoRestriction $ triggered
        (EnemySpawns #when (PlacementAt YourLocation) cats) (exhaust a) ]

instance RunMessage FelineDiscombobulator where
  runMessage msg a@(FelineDiscombobulator attrs) = runQueueT $ case msg of
    UseCardAbility iid (isSource attrs -> True) 1 (spawnedEnemy -> eid) _ -> do
      automaticallyEvadeEnemy iid eid
      pure a
    _ -> FelineDiscombobulator <$> liftRunMessage msg attrs
