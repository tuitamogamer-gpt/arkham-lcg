module Arkham.Homebrew.Barkham.Player.JacquelineCanine (jacquelineCanine) where

import Arkham.Ability
import Arkham.Card
import Arkham.Investigator.Import.Lifted
import Arkham.Investigator.Projection ()
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype JacquelineCanine = JacquelineCanine InvestigatorAttrs
  deriving anyclass (IsInvestigator, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)
  deriving stock Data

jacquelineCanine :: InvestigatorCard JacquelineCanine
jacquelineCanine = investigator JacquelineCanine Cards.jacquelineCanine
  $ Stats {health = 6, sanity = 8, willpower = 5, intellect = 3, combat = 2, agility = 2}

instance HasAbilities JacquelineCanine where
  getAbilities (JacquelineCanine a) =
    [ playerLimit PerRound $ selfAbility a 1 (exists $ InHandOf NotForPlay You) $ FastAbility Free
    , selfAbility a 2 (if null a.cardsUnderneath then Never else NoRestriction) actionAbility
    ]

instance HasChaosTokenValue JacquelineCanine where
  getChaosTokenValue iid ElderSign (JacquelineCanine a) | a `is` iid = pure $ ChaosTokenValue ElderSign (PositiveModifier 1)
  getChaosTokenValue _ token _ = pure $ ChaosTokenValue token mempty

instance RunMessage JacquelineCanine where
  runMessage msg i@(JacquelineCanine a) = runQueueT $ case msg of
    UseThisAbility iid (isSource a -> True) 1 -> do
      hand <- iid.hand
      chooseTargetM iid hand \card -> do
        placeUnderneath iid [card]
        drawCards iid (a.ability 1) 1
      pure i
    UseThisAbility iid (isSource a -> True) 2 -> do
      chooseTargetM iid a.cardsUnderneath \card -> do
        push $ AddToHand iid [card]
        doStep 1 msg
      pure i
    DoStep 1 (UseThisAbility iid (isSource a -> True) 2) -> do
      unless (null a.cardsUnderneath) $ chooseOneM iid do
        i18nKeyLabeled "Finish digging" nothing
        targets a.cardsUnderneath $ \card -> push $ AddToHand iid [card]
      pure i
    ElderSignEffect iid | a `is` iid -> do
      unless (null a.cardsUnderneath) $ chooseTargetM iid a.cardsUnderneath $ \card -> push $ AddToHand iid [card]
      pure i
    _ -> JacquelineCanine <$> liftRunMessage msg a
