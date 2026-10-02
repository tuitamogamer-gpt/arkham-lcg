module Arkham.Homebrew.Barkham.Player.CatlingGun (catlingGun) where

import Arkham.Ability
import Arkham.Asset.Import.Lifted
import Arkham.Asset.Uses (UseType, Token (Ammo))
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Matcher
import Arkham.Modifier

newtype CatlingGun = CatlingGun AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

catlingGun :: AssetCard CatlingGun
catlingGun = asset CatlingGun Cards.catlingGun

instance HasAbilities CatlingGun where
  getAbilities (CatlingGun a) =
    [ withAdditionalCost (ActionCost 1) $ fightAbility a 1 (UseCostUpTo (be a) Ammo 1 3) ControlsThis ]

instance RunMessage CatlingGun where
  runMessage msg a@(CatlingGun attrs) = runQueueT $ case msg of
    UseCardAbility iid (isSource attrs -> True) 1 _ payment -> do
      sid <- getRandom
      let ammo = totalUsesPayment payment
      skillTestModifiers sid (attrs.ability 1) iid [SkillModifier #combat ammo, DamageDealt ammo]
      chooseFightEnemy sid iid (attrs.ability 1)
      pure a
    _ -> CatlingGun <$> liftRunMessage msg attrs
