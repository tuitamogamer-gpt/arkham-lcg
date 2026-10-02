module Arkham.Homebrew.EpicLabyrinth.Assets.HungerDiagram (hungerDiagram) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Cards
import Arkham.Asset.Import.Lifted
import Arkham.Helpers.Query
import Arkham.Helpers.SkillTest.Lifted (investigateEdit_)
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Matcher qualified as Matcher
import Arkham.Message.Lifted.Choose

newtype HungerDiagram = HungerDiagram AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

hungerDiagram :: AssetCard HungerDiagram
hungerDiagram = asset HungerDiagram Cards.hungerDiagramEpicMultiplayer

instance HasAbilities HungerDiagram where
  getAbilities (HungerDiagram attrs) =
    [ controlled attrs 1 (exists $ not_ You) $ forced $ Matcher.InvestigatorDefeated #when ByAny You
    , investigateAbility (proxied (locationIs Locations.chamberOfRot) attrs) 2 mempty
        (Here <> exists (at_ (locationIs Locations.chamberOfRot) <> HasMatchingAsset (be attrs))
          <> exists (SetAsideCardMatch $ cardIs Cards.mysteriousSyringe))
    ]

instance RunMessage HungerDiagram where
  runMessage msg card@(HungerDiagram attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      others <- select $ UneliminatedInvestigator <> not_ (InvestigatorWithId iid)
      chooseOrRunOneM iid $ targets others (`takeControlOfAsset` attrs.id)
      pure card
    UseThisAbility iid (isProxySource attrs -> True) 2 -> do
      sid <- getRandom
      investigateEdit_ sid iid (attrs.ability 2) (setTarget attrs)
      pure card
    SuccessfulInvestigationWith iid (isTarget attrs -> True) -> do
      withSetAsideCard Cards.mysteriousSyringe $ takeControlOfSetAsideAsset iid
      pure card
    _ -> HungerDiagram <$> liftRunMessage msg attrs
