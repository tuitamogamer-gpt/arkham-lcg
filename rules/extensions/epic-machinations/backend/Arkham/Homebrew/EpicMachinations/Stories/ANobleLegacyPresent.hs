module Arkham.Homebrew.EpicMachinations.Stories.ANobleLegacyPresent (aNobleLegacyPresent) where

import Arkham.Ability
import Arkham.Card (cbCardBuilder)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Stories.Shared
import Arkham.Homebrew.EpicMachinations.Types (MachinationsOperation (Announce))
import Arkham.GameValue
import Arkham.Matcher
import Arkham.ScenarioLogKey
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.ANobleLegacyPresent qualified as Native
import Arkham.Story.Import.Lifted

newtype ANobleLegacyPresent = ANobleLegacyPresent StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

aNobleLegacyPresent :: StoryCard ANobleLegacyPresent
aNobleLegacyPresent = story ANobleLegacyPresent Cards.aNobleLegacyPresent & persistStory

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.aNobleLegacyPresent attrs.cardId (Nothing, attrs.id)

instance HasAbilities ANobleLegacyPresent where
  getAbilities (ANobleLegacyPresent attrs) = map printedCost $ getAbilities $ native attrs
   where
    printedCost :: Ability -> Ability
    printedCost ability
      | isJust (storyReplica attrs) && ability.index == 2 =
          ability {abilityType = actionAbilityWithCost $ GroupClueCost (PerPlayer 4) Anywhere}
      | otherwise = ability

instance RunMessage ANobleLegacyPresent where
  runMessage message card@(ANobleLegacyPresent attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    case message of
      _ | epic, Just updated <- syncStoryReplica attrs message -> pure $ ANobleLegacyPresent updated
      UseThisAbility _ (isSource attrs -> True) 3 | epic -> do
        -- The Future group owns its physical Corrigan Industries copy. Its
        -- authoritative announcement delivery performs the remote placement.
        emitMachinations $ Announce CorriganIndustriesHasBeenFounded
        pure card
      _ -> ANobleLegacyPresent . toAttrs <$> liftRunMessage message (native attrs)
