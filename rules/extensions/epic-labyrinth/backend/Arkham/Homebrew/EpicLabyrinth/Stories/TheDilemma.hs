module Arkham.Homebrew.EpicLabyrinth.Stories.TheDilemma (theDilemma) where

import Arkham.Ability
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Matcher
import Arkham.Placement
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))

newtype TheDilemma = TheDilemma StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theDilemma :: StoryCard TheDilemma
theDilemma = story TheDilemma Cards.theDilemma & persistStory

instance HasAbilities TheDilemma where
  getAbilities (TheDilemma a) = [mkAbility a 1 $ ReactionAbility (RoundEnds #when) Free mempty]

instance RunMessage TheDilemma where
  runMessage msg s@(TheDilemma a) = runQueueT $ case msg of
    _ | Just _ <- readInvestigator a msg -> pure $ TheDilemma a {storyPlacement = NextToAct}
    UseThisAbility iid (isSource a -> True) 1 -> emitOperation (ResolveDilemma iid) >> pure s
    _ | Just (RemoveSharedStory "70036", updated) <- newDelivery a msg -> removeStory updated >> pure (TheDilemma updated)
    _ -> TheDilemma <$> liftRunMessage msg a
