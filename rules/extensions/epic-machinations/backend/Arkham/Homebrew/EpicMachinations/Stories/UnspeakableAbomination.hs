module Arkham.Homebrew.EpicMachinations.Stories.UnspeakableAbomination (unspeakableAbomination) where

import Arkham.Card (cbCardBuilder)

import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Enemies
import Arkham.Helpers.Query (getSetAsideCardMaybe)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Matcher
import Arkham.Story.Cards.MachinationsThroughTime.UnspeakableAbomination qualified as Native
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))

newtype UnspeakableAbomination = UnspeakableAbomination StoryAttrs
  deriving anyclass IsStory
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

unspeakableAbomination :: StoryCard UnspeakableAbomination
unspeakableAbomination = UnspeakableAbomination . toAttrs <$> Native.unspeakableAbomination

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.unspeakableAbomination attrs.cardId (Nothing, attrs.id)

instance HasAbilities UnspeakableAbomination where
  getAbilities (UnspeakableAbomination attrs) = getAbilities $ native attrs

instance HasModifiersFor UnspeakableAbomination where
  getModifiersFor (UnspeakableAbomination attrs) = getModifiersFor $ native attrs

instance RunMessage UnspeakableAbomination where
  runMessage message card@(UnspeakableAbomination attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    case message of
      UseThisAbility _ (isSource attrs -> True) 2 | epic -> emitMachinations (CompleteStory "87042") >> pure card
      FlipThis (isTarget attrs -> True) | epic -> do
        withMatch (locationIs Locations.tindalosEpic) $ \lid ->
          whenJustM (getSetAsideCardMaybe Enemies.tyrthrha) $ \enemy -> createEnemyAt_ enemy lid
        flippedOver attrs
        pure $ UnspeakableAbomination attrs {storyFlipped = True}
      _ -> UnspeakableAbomination . toAttrs <$> liftRunMessage message (native attrs)
