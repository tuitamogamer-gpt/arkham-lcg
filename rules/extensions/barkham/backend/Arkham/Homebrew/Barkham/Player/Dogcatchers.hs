module Arkham.Homebrew.Barkham.Player.Dogcatchers (dogcatchers) where

import Arkham.Ability
import Arkham.Enemy.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Matcher
import Arkham.Modifier

newtype Dogcatchers = Dogcatchers EnemyAttrs
  deriving anyclass (IsEnemy, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

dogcatchers :: EnemyCard Dogcatchers
dogcatchers = enemy Dogcatchers Cards.dogcatchers & setPreyIsOnlyBearer

instance HasAbilities Dogcatchers where
  getAbilities (Dogcatchers a) = case enemyBearer a of
    Nothing -> getAbilities a
    Just iid -> extend a
      [ restricted a 1 NoRestriction $ forced $ Enters #after (InvestigatorWithId iid) (locationWithEnemy a)
      , restricted a 2 NoRestriction $ forced $ EnemyEnters #after (locationWithInvestigator iid) (be a)
      ]

instance RunMessage Dogcatchers where
  runMessage msg e@(Dogcatchers a) = runQueueT $ case msg of
    UseThisAbility _ (isSource a -> True) n | n `elem` [1, 2] -> do
      for_ (enemyBearer a) \iid -> roundModifier a iid CannotMove
      pure e
    _ -> Dogcatchers <$> liftRunMessage msg a
