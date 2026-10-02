module Arkham.Homebrew.EpicLabyrinth.Assets.RotDiagram (rotDiagram) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Cards
import Arkham.Asset.Import.Lifted
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Matcher qualified as Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection

newtype RotDiagram = RotDiagram AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

rotDiagram :: AssetCard RotDiagram
rotDiagram = asset RotDiagram Cards.rotDiagramEpicMultiplayer

instance HasAbilities RotDiagram where
  getAbilities (RotDiagram attrs) =
    [ controlled attrs 1 (exists $ not_ You) $ forced $ Matcher.InvestigatorDefeated #when ByAny You
    , restricted (proxied (locationIs Locations.chamberOfDecay) attrs) 2
        (Here <> exists (at_ (locationIs Locations.chamberOfDecay) <> HasMatchingAsset (be attrs))) actionAbility
    ]

instance RunMessage RotDiagram where
  runMessage msg card@(RotDiagram attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      others <- select $ UneliminatedInvestigator <> not_ (InvestigatorWithId iid)
      chooseOrRunOneM iid $ targets others (`takeControlOfAsset` attrs.id)
      pure card
    UseThisAbility iid (isProxySource attrs -> True) 2 -> do
      chamber <- selectJust $ locationIs Locations.chamberOfDecay
      placeTokens (attrs.ability 2) chamber #doom 1
      clues <- field InvestigatorClues iid
      chooseOneM iid $ for_ [0 .. clues] \amount ->
        i18nKeyLabeled ("Turn " <> tshow amount <> " of your clues into additional doom in Chamber of Decay") do
          removeTokens (attrs.ability 2) iid #clue amount
          placeTokens (attrs.ability 2) chamber #doom amount
      pure card
    _ -> RotDiagram <$> liftRunMessage msg attrs
