module Arkham.Homebrew.EpicLabyrinth.Enemies.EixodolonsPet (eixodolonsPet) where

import Arkham.Ability
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Enemy.Import.Lifted
import Arkham.Helpers.Modifiers (immuneToPlayerEffects)
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Message.Lifted.Placement (place)
import Arkham.Placement
import Arkham.Zone (OutOfPlayZone (SetAsideZone))

newtype EixodolonsPet = EixodolonsPet EnemyAttrs
  deriving anyclass IsEnemy
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

eixodolonsPet :: EnemyCard EixodolonsPet
eixodolonsPet = enemy EixodolonsPet Cards.eixodolonsPetEpicMultiplayer

instance HasModifiersFor EixodolonsPet where
  getModifiersFor (EixodolonsPet attrs) = when (attrs.placement == Global) $ immuneToPlayerEffects attrs

instance HasAbilities EixodolonsPet where
  getAbilities (EixodolonsPet attrs) = extend attrs
    [ restricted (proxied (locationIs Locations.chamberOfHunger) attrs) 1 Here
        $ actionAbilityWithCost $ GroupClueCost (PerPlayer 1) (locationIs Locations.chamberOfHunger)
    | attrs.placement == Global
    ]

instance RunMessage EixodolonsPet where
  runMessage message card@(EixodolonsPet attrs) = runQueueT $ case message of
    UseThisAbility _ (isProxySource attrs -> True) 1 -> do
      place attrs $ OutOfPlay SetAsideZone
      push $ ScenarioSpecific "epicLabyrinth.petSent" Null
      pure card
    _ -> EixodolonsPet <$> liftRunMessage message attrs
