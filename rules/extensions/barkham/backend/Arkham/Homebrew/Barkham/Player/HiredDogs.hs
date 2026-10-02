module Arkham.Homebrew.Barkham.Player.HiredDogs (hiredDogs) where

import Arkham.Ability
import Arkham.Actions (orActions)
import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Capability
import Arkham.Fight
import Arkham.Helpers.CombatTarget
import Arkham.Helpers.Investigator (getJustLocation, getMaybeLocation)
import Arkham.Investigate
import Arkham.Investigate.Types (Investigate (..))
import Arkham.Matcher hiding (DuringTurn)
import Arkham.Message.Lifted.Choose
import Arkham.Modifier

newtype HiredDogs = HiredDogs AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

hiredDogs :: AssetCard HiredDogs
hiredDogs = ally HiredDogs Cards.hiredDogs (2, 2)

instance HasAbilities HiredDogs where
  getAbilities (HiredDogs a) =
    [ delayAdditionalCosts $ controlled a 1 (not_ DuringAction <> DuringTurn You)
        $ FastAbility' (exhaust a) (orActions [#fight, #investigate]) ]

instance RunMessage HiredDogs where
  runMessage msg a@(HiredDogs attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      sid <- getRandom
      canFight <- hasFightTargets (attrs.ability 1) iid
      canInvestigate <- maybe (pure False) (`matches` InvestigatableLocation) =<< getMaybeLocation iid
      chooseOneM iid do
        when canFight $ i18nKeyLabeled "Attack with base combat 4" do
          skillTestModifier sid (attrs.ability 1) iid (BaseSkillOf #combat 4)
          chooseFightEnemyEdit sid iid (attrs.ability 1) $ \fight -> fight {chooseFightIsAction = True, chooseFightPayCost = False}
        when canInvestigate $ i18nKeyLabeled "Investigate with base intellect 4" do
          lid <- getJustLocation iid
          skillTestModifier sid (attrs.ability 1) iid (BaseSkillOf #intellect 4)
          investigation <- mkInvestigateLocation sid iid (attrs.ability 1) lid
          push $ CheckAdditionalActionCosts iid (toTarget lid) #investigate
            [toMessage investigation {investigateIsAction = True, investigatePayCost = False}]
      pure a
    SkillTestEnds _ iid (isAbilitySource attrs 1 -> True) -> do
      chooseOneM iid do
        whenM (can.spend.resources iid) $ i18nKeyLabeled "Pay 1 resource in dog food" $ spendResources iid 1
        i18nKeyLabeled "Discard Hired Dogs" $ toDiscardBy iid (attrs.ability 1) attrs
      pure a
    _ -> HiredDogs <$> liftRunMessage msg attrs
