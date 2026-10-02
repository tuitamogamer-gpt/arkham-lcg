module Arkham.Homebrew.Barkham.Player.FriendlyHuman (friendlyHuman) where

import Arkham.Ability
import Arkham.Asset.Import.Lifted
import Arkham.Asset.Uses (Token (Supply))
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Capability
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype FriendlyHuman = FriendlyHuman AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

friendlyHuman :: AssetCard FriendlyHuman
friendlyHuman = allyWith FriendlyHuman Cards.friendlyHuman (3, 2) noSlots

instance HasAbilities FriendlyHuman where
  getAbilities (FriendlyHuman a) =
    [ controlled a 1 NoRestriction $ triggered (SkillTestResult #after You AnySkillTest #success) (assetUseCost a Supply 1) ]

instance RunMessage FriendlyHuman where
  runMessage msg a@(FriendlyHuman attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      chooseOneM iid do
        whenM (can.heal.damage (attrs.ability 1) iid) $ i18nKeyLabeled "Heal 1 damage" $ healDamage iid (attrs.ability 1) 1
        whenM (can.heal.horror (attrs.ability 1) iid) $ i18nKeyLabeled "Heal 1 horror" $ healHorror iid (attrs.ability 1) 1
        whenM (can.draw.cards iid) $ i18nKeyLabeled "Draw 1 card" $ drawCards iid (attrs.ability 1) 1
        whenM (can.gain.resources iid) $ i18nKeyLabeled "Gain 1 resource" $ gainResources iid (attrs.ability 1) 1
      pure a
    _ -> FriendlyHuman <$> liftRunMessage msg attrs
