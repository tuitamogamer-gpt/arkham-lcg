module Arkham.Homebrew.Barkham.Player.KateWinthpup (kateWinthpup) where

import Arkham.Ability
import Arkham.ForMovement (ForMovement (NotForMovement))
import Arkham.Investigator.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Modifiers
import Arkham.Helpers.SkillTest (getSkillTest)
import Arkham.Investigator.Types (Field (InvestigatorLocation))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection

newtype KateWinthpup = KateWinthpup InvestigatorAttrs
  deriving anyclass IsInvestigator
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)
  deriving stock Data

kateWinthpup :: InvestigatorCard KateWinthpup
kateWinthpup = investigator KateWinthpup Cards.kateWinthpup
  $ Stats {health = 5, sanity = 9, willpower = 3, intellect = 4, combat = 1, agility = 4}

instance HasAbilities KateWinthpup where
  getAbilities (KateWinthpup a) =
    [noAOO $ selfAbility a 1 (exists (YourLocation <> Anywhere)) actionAbility]

instance HasModifiersFor KateWinthpup where
  getModifiersFor (KateWinthpup a) = do
    here <- field InvestigatorLocation a.id
    let sniffed = lookupMetaKeyWithDefault "sniffedLocations" ([] :: [LocationId]) a
    getSkillTest >>= traverse_ \st -> do
      when (st.investigator == a.id && maybe False (`elem` sniffed) here) $
        modified_ a (SkillTestTarget st.id) [Difficulty (-1)]

instance HasChaosTokenValue KateWinthpup where
  getChaosTokenValue iid ElderSign (KateWinthpup a) | a `is` iid = pure $ ChaosTokenValue ElderSign (PositiveModifier 0)
  getChaosTokenValue _ token _ = pure $ ChaosTokenValue token mempty

instance RunMessage KateWinthpup where
  runMessage msg i@(KateWinthpup a) = runQueueT $ case msg of
    UseThisAbility iid (isSource a -> True) 1 -> do
      chooseSelectM iid (oneOf [YourLocation, ConnectedFrom NotForMovement YourLocation]) $
        \lid -> push $ HandleTargetChoice iid (a.ability 1) (LocationTarget lid)
      pure i
    ElderSignEffect iid | a `is` iid -> do
      chooseSelectM iid (oneOf [YourLocation, ConnectedFrom NotForMovement YourLocation]) $
        \lid -> push $ HandleTargetChoice iid (a.ability 1) (LocationTarget lid)
      pure i
    HandleTargetChoice _ (isAbilitySource a 1 -> True) (LocationTarget lid) -> do
      let sniffed = lookupMetaKeyWithDefault "sniffedLocations" ([] :: [LocationId]) a
      pure $ KateWinthpup $ setMetaKey "sniffedLocations" (ordNub $ lid : sniffed) a
    HandleTargetChoice iid (isSource a -> True) (CardCodeTarget ":barkham:unsniff") | a `is` iid ->
      pure $ KateWinthpup $ setMetaKey "sniffedLocations" ([] :: [LocationId]) a
    _ -> KateWinthpup <$> liftRunMessage msg a
