module Arkham.Homebrew.Barkham.Acts.TheCatAndTheMouse (theCatAndTheMouse) where

import Arkham.Ability
import Arkham.Act.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Acts qualified as Cards
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype TheCatAndTheMouse = TheCatAndTheMouse ActAttrs
  deriving anyclass (IsAct, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theCatAndTheMouse :: ActCard TheCatAndTheMouse
theCatAndTheMouse = act (2, A) TheCatAndTheMouse Cards.theCatAndTheMouse Nothing

instance HasAbilities TheCatAndTheMouse where
  getAbilities = actAbilities \a ->
    [ restricted a 1 (exists $ EnemyAt YourLocation) $ actionAbilityWithCost (ClueCost $ Static 1)
    , doesNotProvokeAttacksOfOpportunity $ restricted a 2 (exists $ EnemyAt YourLocation) $ actionAbilityWithCost (ClueCost $ Static 1)
    , mkAbility a 3 $ Objective $ forced $ ifEnemyDefeated Enemies.meowlathotep
    ]

instance RunMessage TheCatAndTheMouse where
  runMessage msg a@(TheCatAndTheMouse attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) n | n `elem` [1, 2] -> do
      enemies <- select $ EnemyAt $ locationWithInvestigator iid
      chooseOrRunOneM iid $ targets enemies \eid -> nonAttackEnemyDamage (Just iid) (attrs.ability n) (if n == 1 then 2 else 1) eid
      pure a
    UseThisAbility _ (isSource attrs -> True) 3 -> a <$ advancedWithOther attrs
    AdvanceAct (isSide B attrs -> True) _ _ -> a <$ push R1
    _ -> TheCatAndTheMouse <$> liftRunMessage msg attrs
