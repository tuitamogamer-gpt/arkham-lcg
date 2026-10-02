module Arkham.Homebrew.Barkham.Player.SpikedCollar (spikedCollar) where

import Arkham.Ability
import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Window (getDamageSourceEnemy)
import Arkham.Matcher

newtype SpikedCollar = SpikedCollar AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

spikedCollar :: AssetCard SpikedCollar
spikedCollar = asset SpikedCollar Cards.spikedCollar

instance HasAbilities SpikedCollar where
  getAbilities (SpikedCollar a) =
    [ controlled a 1 CanDealDamage $ triggered
        (DealtDamage #when (SourceIsEnemyAttack $ EnemyCanBeDamagedBySource (a.ability 1)) You)
        (exhaust a) ]

instance RunMessage SpikedCollar where
  runMessage msg a@(SpikedCollar attrs) = runQueueT $ case msg of
    UseCardAbility iid (isSource attrs -> True) 1 (getDamageSourceEnemy -> eid) _ -> do
      nonAttackEnemyDamage (Just iid) (attrs.ability 1) 1 eid
      pure a
    _ -> SpikedCollar <$> liftRunMessage msg attrs
