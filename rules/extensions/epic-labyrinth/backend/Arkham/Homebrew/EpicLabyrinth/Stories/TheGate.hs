module Arkham.Homebrew.EpicLabyrinth.Stories.TheGate (theGate) where

import Arkham.Ability
import Arkham.Helpers.Query (getSetAsideCard)
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Message.Lifted.Move (moveTo)
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))

newtype TheGate = TheGate StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theGate :: StoryCard TheGate
theGate = story TheGate Cards.theGate & persistStory

instance HasAbilities TheGate where
  getAbilities (TheGate a) = [restricted a 1 OnSameLocation $ actionAbilityWithCost $ clueCost 1]

instance RunMessage TheGate where
  runMessage msg s@(TheGate a) = runQueueT $ case msg of
    _ | Just iid <- readInvestigator a msg -> attachToDistortion iid a True >> pure s
    _ | Just (PlaceStoryAt placement) <- commandFor a msg -> pure $ TheGate a {storyPlacement = placement}
    UseThisAbility iid (isSource a -> True) 1 -> do
      group <- getEpicGroup
      let chamber = case group of
            GroupA -> Locations.chamberOfRot
            GroupB -> Locations.chamberOfHunger
            GroupC -> Locations.chamberOfDecay
      enemies <- select $ enemyEngagedWith iid
      for_ enemies $ disengageEnemy iid
      lid <- placeLocation =<< getSetAsideCard chamber
      push $ ScenarioSpecific "epicLabyrinth.gateIsolation" (toJSON lid)
      moveTo a iid lid
      removeStory a
      pure s
    _ -> TheGate <$> liftRunMessage msg a
