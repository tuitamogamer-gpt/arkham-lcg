module Arkham.Homebrew.Barkham.Player.BarkHarrigan (barkHarrigan) where

import Arkham.Investigator.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Modifiers
import Arkham.Card
import Arkham.Matcher
import Arkham.Slot
import Arkham.Trait

newtype BarkHarrigan = BarkHarrigan InvestigatorAttrs
  deriving anyclass (IsInvestigator, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)
  deriving stock Data

barkHarrigan :: InvestigatorCard BarkHarrigan
barkHarrigan = investigator BarkHarrigan Cards.barkHarrigan
  $ Stats {health = 9, sanity = 5, willpower = 3, intellect = 2, combat = 5, agility = 2}

instance HasModifiersFor BarkHarrigan where
  getModifiersFor (BarkHarrigan a) =
    let discount = lookupMetaKeyWithDefault "weaponDiscount" (0 :: Int) a
    in modifySelfWhen a (discount > 0) [ReduceCostOf (#asset <> #weapon) discount]

instance HasChaosTokenValue BarkHarrigan where
  getChaosTokenValue iid ElderSign (BarkHarrigan a) | a `is` iid = pure $ ChaosTokenValue ElderSign (PositiveModifier 2)
  getChaosTokenValue _ token _ = pure $ ChaosTokenValue token mempty

instance RunMessage BarkHarrigan where
  runMessage msg i@(BarkHarrigan a) = runQueueT $ case msg of
    SetupInvestigator iid | a `is` iid -> do
      pushAll $ replicate 2 $ AddSlot iid HandSlot (TraitRestrictedSlot (toSource a) Weapon [])
      BarkHarrigan <$> liftRunMessage msg a
    ElderSignEffect iid | a `is` iid -> pure $ BarkHarrigan $ setMetaKey "weaponDiscount"
      (lookupMetaKeyWithDefault "weaponDiscount" (0 :: Int) a + 2) a
    InvestigatorPlayedAsset iid aid | a `is` iid -> do
      isWeapon <- aid `matches` (AssetWithTrait Weapon)
      attrs <- liftRunMessage msg a
      pure $ BarkHarrigan $ if isWeapon then setMetaKey "weaponDiscount" (0 :: Int) attrs else attrs
    EndRound -> BarkHarrigan . setMetaKey "weaponDiscount" (0 :: Int) <$> liftRunMessage msg a
    _ -> BarkHarrigan <$> liftRunMessage msg a
