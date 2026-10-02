module Arkham.Homebrew.EpicMachinations.Stories.AnomaliesInSpacetime (anomaliesInSpacetime) where

import Arkham.Ability
import Arkham.GameT (GameT)
import Arkham.Queue (QueueT)
import Arkham.Card (cbCardBuilder)
import Arkham.Agenda.Sequence
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Modifiers (ModifierType (..), modifySelect)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Location.Types (Field (LocationHorror, LocationName))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Name (toTitle)
import Arkham.Projection
import Arkham.ScenarioLogKey
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.AnomaliesInSpacetime qualified as Native
import Arkham.Story.Import.Lifted

newtype AnomaliesInSpacetime = AnomaliesInSpacetime StoryAttrs
  deriving anyclass IsStory
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

anomaliesInSpacetime :: StoryCard AnomaliesInSpacetime
anomaliesInSpacetime = storyWith AnomaliesInSpacetime Cards.anomaliesInSpacetime (flippedL .~ True) & persistStory

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.anomaliesInSpacetime attrs.cardId (Nothing, attrs.id)

instance HasModifiersFor AnomaliesInSpacetime where
  getModifiersFor (AnomaliesInSpacetime attrs) = modifySelect attrs Anyone
    [CannotTriggerAbilityMatching $ AbilityOnLocation LocationWithAnyHorror <> not_ BasicAbility]

instance HasAbilities AnomaliesInSpacetime where
  getAbilities (AnomaliesInSpacetime attrs) = getAbilities $ native attrs

instance RunMessage AnomaliesInSpacetime where
  runMessage message card@(AnomaliesInSpacetime attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if epic then runEpic message card else AnomaliesInSpacetime . toAttrs <$> liftRunMessage message (native attrs)

runEpic :: Message -> AnomaliesInSpacetime -> QueueT Message GameT AnomaliesInSpacetime
runEpic message card@(AnomaliesInSpacetime attrs) = case message of
  UseCardAbility iid (isSource attrs -> True) 1 _ (totalCluePayment -> count) -> do
    sid <- getRandom
    when (count > 0) $ modifyAnySkill sid (attrs.ability 1) iid $ 3 * count
    chooseBeginSkillTest sid iid (attrs.ability 1) iid [#willpower, #agility] $ Fixed 3
    pure card
  PassedThisSkillTestBy iid (isAbilitySource attrs 1 -> True) margin -> do
    withLocationOf iid $ \lid -> do
      horror <- field LocationHorror lid
      let removed = min horror $ if margin >= 3 then 2 else 1
      removeTokens (attrs.ability 1) lid #horror removed
      replica <- getMachinationsReplica
      when (margin >= 4 && CorriganIndustriesHasBeenFounded `elem` replica.announcements) do
        title <- fieldMap LocationName toTitle lid
        matches <- select $ LocationWithTitle title <> LocationWithAnyHorror
        local <- filterM (\other -> (> (if other == lid then removed else 0)) <$> field LocationHorror other) matches
        let matchingEras = if title `elem` ["Miskatonic University", "River Docks"] then allEras
              else if title `elem` ["Arkham Advertiser", "Tick-Tock Club"] then [PresentEra, FutureEra] else []
            remote = filter (/= replica.currentEra) matchingEras
        unless (null local && null remote) $ chooseOrRunOneM iid do
          targets local $ \other -> removeTokens (attrs.ability 1) other #horror 1
          for_ remote $ \era -> i18nKeyLabeled ("Remove an anomaly at " <> title <> " in " <> tshow era) $
            emitMachinations $ RemoveRemoteAnomaly era title
    pure card
  UseThisAbility _ (isSource attrs -> True) 2 -> emitMachinations (CompleteStory "87038") >> pure card
  _ -> AnomaliesInSpacetime <$> liftRunMessage message attrs
