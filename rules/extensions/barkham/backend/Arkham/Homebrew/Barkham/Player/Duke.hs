module Arkham.Homebrew.Barkham.Player.Duke (duke) where

import Arkham.Ability
import Arkham.Investigator.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Asset.Uses
import Arkham.Matcher

newtype Duke = Duke InvestigatorAttrs
  deriving anyclass (IsInvestigator, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)
  deriving stock Data

duke :: InvestigatorCard Duke
duke = startsWith [Cards.friendlyHuman] $ investigator Duke Cards.duke
  $ Stats {health = 5, sanity = 6, willpower = 2, intellect = 4, combat = 4, agility = 2}

instance HasAbilities Duke where
  getAbilities (Duke a) =
    [ selfAbility a 1 (exists $ assetIs Cards.friendlyHuman <> AssetControlledBy You) $ ActionAbility mempty Nothing (ActionCost 2) ]

instance HasChaosTokenValue Duke where
  getChaosTokenValue iid ElderSign (Duke a) | a `is` iid = pure $ ChaosTokenValue ElderSign (PositiveModifier 2)
  getChaosTokenValue _ token _ = pure $ ChaosTokenValue token mempty

instance RunMessage Duke where
  runMessage msg i@(Duke a) = runQueueT $ case msg of
    UseThisAbility iid (isSource a -> True) 1 -> do
      selectEach (assetIs Cards.friendlyHuman <> assetControlledBy iid) $ \aid -> push $ AddUses (a.ability 1) aid Supply 3
      pure i
    ElderSignEffect iid | a `is` iid -> do
      selectEach (assetIs Cards.friendlyHuman <> assetControlledBy iid) $ \aid -> do
        push $ AddUses (toSource ElderSign) aid Supply 1
      pure $ Duke $ setMetaKey "readyFriendlyHumanAfterTest" True a
    SkillTestEnds _ iid _ | a `is` iid, lookupMetaKeyWithDefault "readyFriendlyHumanAfterTest" False a -> do
      selectEach (assetIs Cards.friendlyHuman <> assetControlledBy iid) ready
      Duke . setMetaKey "readyFriendlyHumanAfterTest" False <$> liftRunMessage msg a
    _ -> Duke <$> liftRunMessage msg a
