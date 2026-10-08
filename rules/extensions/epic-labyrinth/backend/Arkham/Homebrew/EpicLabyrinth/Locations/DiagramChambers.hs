module Arkham.Homebrew.EpicLabyrinth.Locations.DiagramChambers where

import Arkham.Ability
import Arkham.Asset.Cards qualified as Assets
import Arkham.Card (CardDef, toCardCode)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Location.Import.Lifted
import Arkham.Matcher

-- These shared locations retain their printed attributes in either mode.
-- The set-aside diagram is the corresponding edition of the same reward.
newtype DiagramChamber = DiagramChamber LocationAttrs
  deriving anyclass (IsLocation, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

chamberOfHunger :: LocationCard DiagramChamber
chamberOfHunger = location DiagramChamber Cards.chamberOfHunger 3 (PerPlayer 1)

chamberOfDecay :: LocationCard DiagramChamber
chamberOfDecay = location DiagramChamber Cards.chamberOfDecay 2 (PerPlayer 1)

chamberOfRot :: LocationCard DiagramChamber
chamberOfRot = location DiagramChamber Cards.chamberOfRot 3 (PerPlayer 1)

diagramCards :: LocationAttrs -> (CardDef, CardDef)
diagramCards attrs = case toCardCode attrs of
  "70028" -> (Assets.hungerDiagram, Assets.hungerDiagramEpicMultiplayer)
  "70029" -> (Assets.decayDiagram, Assets.decayDiagramEpicMultiplayer)
  "70030" -> (Assets.rotDiagram, Assets.rotDiagramEpicMultiplayer)
  _ -> error "DiagramChamber requires a printed diagram chamber"

instance HasAbilities DiagramChamber where
  getAbilities (DiagramChamber attrs) =
    let (single, epic) = diagramCards attrs
     in extendRevealed1 attrs $ restricted attrs 1
          (Here <> thisExists attrs LocationWithoutClues
            <> exists (SetAsideCardMatch $ CardWithOneOf [cardIs single, cardIs epic]))
          $ FastAbility Free

instance RunMessage DiagramChamber where
  runMessage message chamber@(DiagramChamber attrs) = runQueueT $ case message of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
      let (single, multiplayer) = diagramCards attrs
      card <- getSetAsideCard $ if epic then multiplayer else single
      takeControlOfSetAsideAsset iid card
      pure chamber
    _ -> DiagramChamber <$> liftRunMessage message attrs
