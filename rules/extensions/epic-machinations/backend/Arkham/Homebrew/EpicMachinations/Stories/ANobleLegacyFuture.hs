module Arkham.Homebrew.EpicMachinations.Stories.ANobleLegacyFuture (aNobleLegacyFuture) where

import Arkham.Card (cbCardBuilder)
import Arkham.Helpers.GameValue (perPlayer)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Stories.Shared
import Arkham.Homebrew.EpicMachinations.Types (MachinationsOperation (Announce))
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Matcher
import Arkham.ScenarioLogKey
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.ANobleLegacyFuture qualified as Native
import Arkham.Story.Import.Lifted

newtype ANobleLegacyFuture = ANobleLegacyFuture StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

aNobleLegacyFuture :: StoryCard ANobleLegacyFuture
aNobleLegacyFuture = story ANobleLegacyFuture Cards.aNobleLegacyFuture & persistStory

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.aNobleLegacyFuture attrs.cardId (Nothing, attrs.id)

instance HasAbilities ANobleLegacyFuture where
  getAbilities (ANobleLegacyFuture attrs) = getAbilities $ native attrs

instance RunMessage ANobleLegacyFuture where
  runMessage message card@(ANobleLegacyFuture attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    case message of
      _ | epic, Just updated <- syncStoryReplica attrs message -> pure $ ANobleLegacyFuture updated
      PassedThisSkillTest _ (isAbilitySource attrs 2 -> True) | epic -> do
        -- This printed Epic multiplier counts this group's investigators;
        -- the three-era player total is used only where a card specifies X.
        required <- perPlayer 8
        donors <- selectWithField InvestigatorClues UneliminatedInvestigator
        when (sum (map snd donors) >= required) do
          spendCluesAsAGroup (map fst donors) required
          emitMachinations $ Announce ThomasAndMaryHaveMadeAHistoricDiscovery
        pure card
      _ -> ANobleLegacyFuture . toAttrs <$> liftRunMessage message (native attrs)
