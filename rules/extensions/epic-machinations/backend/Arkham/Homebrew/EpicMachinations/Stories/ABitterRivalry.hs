module Arkham.Homebrew.EpicMachinations.Stories.ABitterRivalry (aBitterRivalry) where

import Arkham.Ability
import Arkham.GameT (GameT)
import Arkham.Queue (QueueT)
import Arkham.Card (cbCardBuilder)
import Arkham.Actions (orActions)
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.GameValue
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Query (getLead)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Stories.Shared
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Matcher
import Arkham.Message.Lifted.Action (narrowTakenActions)
import Arkham.Message.Lifted.Choose
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.ABitterRivalry qualified as Native
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token qualified as Token

newtype ABitterRivalry = ABitterRivalry StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

aBitterRivalry :: StoryCard ABitterRivalry
aBitterRivalry = story ABitterRivalry Cards.aBitterRivalry & persistStory

edwin = enemyIs Enemies.edwinBennetEnviousRival

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.aBitterRivalry attrs.cardId (Nothing, attrs.id)

instance HasAbilities ABitterRivalry where
  getAbilities (ABitterRivalry attrs)
    | isNothing $ storyReplica attrs = getAbilities $ native attrs
    | otherwise = guard attrs.flipped *>
    [ restricted attrs 1 (if edwinElsewhere eraEdwinEnemy attrs then NoRestriction else exists $ edwin <> notAt_ YourLocation) doubleActionAbility
    , groupLimit PerRound $ restricted attrs 2 (exists $ edwin <> at_ YourLocation) $
        ActionAbility (orActions [#fight, #evade]) Nothing $ ActionCost 1
    , onlyOnce $ restricted attrs 3 (exists $ edwin <> at_ (locationIs Locations.tindalosEpic)
        <> EnemyWithTokens (Static 3) Token.Target) $ Objective $ forced AnyWindow
    ]

instance RunMessage ABitterRivalry where
  runMessage message card@(ABitterRivalry attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if epic then runEpic message card else ABitterRivalry . toAttrs <$> liftRunMessage message (native attrs)

runEpic :: Message -> ABitterRivalry -> QueueT Message GameT ABitterRivalry
runEpic message card@(ABitterRivalry attrs) = case message of
    _ | Just updated <- syncStoryReplica attrs message -> pure $ ABitterRivalry updated
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      withLocationOf iid $ \lid -> emitMachinations $ BringEdwin iid lid
      pure card
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      withMatch edwin $ \eid -> do
        sid <- getRandom
        chooseOneM iid do
          i18nKeyLabeled "Fight Edwin Bennet" $ narrowTakenActions [#fight] >> fightEnemy sid iid (attrs.ability 2) eid
          i18nKeyLabeled "Evade Edwin Bennet" $ narrowTakenActions [#evade] >> chooseEvadeEnemyMatch sid iid (attrs.ability 2) (EnemyWithId eid)
      pure card
    PassedThisSkillTest _ (isAbilitySource attrs 2 -> True) -> do
      cost <- getGlobalPlayerCount
      donors <- selectWithField InvestigatorClues UneliminatedInvestigator
      when (sum (map snd donors) >= cost) do
        spendCluesAsAGroup (map fst donors) cost
        withMatch edwin $ \eid -> placeTokens (attrs.ability 2) eid Token.Target 1
      pure card
    UseThisAbility _ (isSource attrs -> True) 3 -> do
      withMatch (edwin <> at_ (locationIs Locations.tindalosEpic) <> EnemyWithTokens (Static 3) Token.Target) removeFromGame
      emitMachinations $ CompleteStory "87033"
      pure card
    Flip _ _ (isTarget attrs -> True) -> do
      era <- getEra
      when (era == PastEra) $ getLead >>= \lead -> withLocationOf lead $ createSetAsideEnemy_ Enemies.edwinBennetEnviousRival
      flippedOver attrs
      pure $ ABitterRivalry attrs {storyFlipped = True}
    _ -> ABitterRivalry <$> liftRunMessage message attrs
