module Arkham.Homebrew.Barkham.Player.OldShoe (oldShoe) where

import Arkham.Ability
import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Capability
import Arkham.Matcher

newtype OldShoe = OldShoe AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

oldShoe :: AssetCard OldShoe
oldShoe = assetWith OldShoe Cards.oldShoe $ (healthL ?~ 2) . (sanityL ?~ 0)

instance HasAbilities OldShoe where
  getAbilities (OldShoe a) =
    [ controlled a 1 (exists (HealableInvestigator (a.ability 1) #horror You)) $ FastAbility (damageCost a 1) ]

instance RunMessage OldShoe where
  runMessage msg a@(OldShoe attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> healHorror iid (attrs.ability 1) 1 >> pure a
    _ -> OldShoe <$> liftRunMessage msg attrs
