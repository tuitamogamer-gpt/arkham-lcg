module Arkham.Homebrew.EpicLabyrinth.Assets.DecayDiagram (decayDiagram) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Cards
import Arkham.Asset.Import.Lifted
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.GameValue
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Matcher qualified as Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Placement

newtype DecayDiagram = DecayDiagram AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

decayDiagram :: AssetCard DecayDiagram
decayDiagram = asset DecayDiagram Cards.decayDiagramEpicMultiplayer

instance HasAbilities DecayDiagram where
  getAbilities (DecayDiagram attrs) =
    [ controlled attrs 1 (exists $ not_ You) $ forced $ Matcher.InvestigatorDefeated #when ByAny You
    , restricted (proxied (locationIs Locations.chamberOfHunger) attrs) 2
        (Here <> exists (at_ (locationIs Locations.chamberOfHunger) <> HasMatchingAsset (be attrs))
          <> exists (enemyIs Enemies.eixodolonsPetEpicMultiplayer <> EnemyWithPlacement Global))
        $ actionAbilityWithCost $ ClueCost $ Static 1
    ]

instance RunMessage DecayDiagram where
  runMessage msg card@(DecayDiagram attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      others <- select $ UneliminatedInvestigator <> not_ (InvestigatorWithId iid)
      chooseOrRunOneM iid $ targets others (`takeControlOfAsset` attrs.id)
      pure card
    UseThisAbility _ source@(isProxySource attrs -> True) 2 -> do
      pet <- selectJust $ enemyIs Enemies.eixodolonsPetEpicMultiplayer <> EnemyWithPlacement Global
      nonAttackEnemyDamage_ Nothing source 4 pet
      pure card
    _ -> DecayDiagram <$> liftRunMessage msg attrs
