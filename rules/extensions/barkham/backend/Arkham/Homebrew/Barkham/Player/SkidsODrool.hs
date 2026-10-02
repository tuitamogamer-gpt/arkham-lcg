module Arkham.Homebrew.Barkham.Player.SkidsODrool (skidsODrool) where

import Arkham.Ability
import Arkham.Investigator.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Location
import Arkham.ForMovement (ForMovement (ForMovement))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Message.Lifted.Move
import Arkham.Modifier
import Arkham.Movement

newtype SkidsODrool = SkidsODrool InvestigatorAttrs
  deriving anyclass (IsInvestigator, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)
  deriving stock Data

skidsODrool :: InvestigatorCard SkidsODrool
skidsODrool = investigator SkidsODrool Cards.skidsODrool
  $ Stats {health = 8, sanity = 6, willpower = 2, intellect = 3, combat = 3, agility = 4}

instance HasAbilities SkidsODrool where
  getAbilities (SkidsODrool a) =
    [ playerLimit PerRound $ selfAbility a 1
        (exists $ CanMoveToLocation You (a.ability 1) $ ConnectedFrom ForMovement YourLocation)
        $ ActionAbility #move Nothing (ActionCost 1 <> ResourceCost 1)
    , selfAbility a 2 (Self <> exists (EnemyAt YourLocation) <> if lookupMetaKeyWithDefault "driveByDamage" False a then NoRestriction else Never)
        $ forced $ Enters #after You Anywhere
    , selfAbility a 3 (Self <> SelfHasModifier (InvestigatorModifier "barkhamTakeTheWheel") <> exists (EnemyAt YourLocation))
        $ forced $ Enters #after You Anywhere
    ]

instance HasChaosTokenValue SkidsODrool where
  getChaosTokenValue iid ElderSign (SkidsODrool a) | a `is` iid = pure $ ChaosTokenValue ElderSign (PositiveModifier 2)
  getChaosTokenValue _ token _ = pure $ ChaosTokenValue token mempty

instance RunMessage SkidsODrool where
  runMessage msg i@(SkidsODrool a) = runQueueT $ case msg of
    UseThisAbility _ (isSource a -> True) 1 -> do
      doStep 3 msg
      pure i
    DoStep n message@(UseThisAbility iid (isSource a -> True) 1) | n > 0 -> do
      locations <- getAccessibleLocations iid (a.ability 1)
      chooseOneM iid do
        i18nKeyLabeled "Finish the car ride" nothing
        targets locations \lid -> do
          moveToEdit (a.ability 1) iid lid $ \movement -> movement {moveSkipEngagement = True}
          when (n > 1) $ doStep (n - 1) message
      pure i
    ElderSignEffect iid | a `is` iid -> pure $ SkidsODrool $ setMetaKey "driveByDamage" True a
    UseThisAbility iid (isSource a -> True) 2 -> do
      chooseSelectM iid (EnemyAt YourLocation) $ nonAttackEnemyDamage (Just iid) ElderSign 1
      pure $ SkidsODrool $ setMetaKey "driveByDamage" False a
    UseThisAbility iid (isSource a -> True) 3 -> do
      chooseSelectM iid (EnemyAt YourLocation) $ nonAttackEnemyDamage (Just iid) (a.ability 3) 3
      pure i
    EndRound -> SkidsODrool . setMetaKey "driveByDamage" False <$> liftRunMessage msg a
    _ -> SkidsODrool <$> liftRunMessage msg a
