module Arkham.Homebrew.EpicMachinations.Stories.RedeemAFormerColleague (redeemAFormerColleague) where

import Arkham.Ability
import Arkham.GameT (GameT)
import Arkham.Queue (QueueT)
import Arkham.Card (cbCardBuilder)
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyTokens))
import Arkham.GameValue
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Helpers.SkillTest.Lifted (parley)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Stories.Shared
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection (field)
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.RedeemAFormerColleague qualified as Native
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token qualified as Token
import Data.Map.Strict qualified as Map

newtype RedeemAFormerColleague = RedeemAFormerColleague StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

redeemAFormerColleague :: StoryCard RedeemAFormerColleague
redeemAFormerColleague = storyWith RedeemAFormerColleague Cards.redeemAFormerColleague (flippedL .~ True) & persistStory

edwin = enemyIs Enemies.edwinBennetEnviousRival

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.redeemAFormerColleague attrs.cardId (Nothing, attrs.id)

instance HasAbilities RedeemAFormerColleague where
  getAbilities (RedeemAFormerColleague attrs)
    | isNothing $ storyReplica attrs = getAbilities $ native attrs
    | otherwise =
    [ restricted attrs 1 (if edwinElsewhere eraEdwinEnemy attrs then NoRestriction else exists $ edwin <> notAt_ YourLocation) doubleActionAbility
    , restricted attrs 2 (exists $ edwin <> at_ YourLocation) parleyAction_
    , onlyOnce $ restricted attrs 3 (exists $ edwin <> EnemyWithTokens (Static 3) Token.Redemption
        <> at_ (LocationWithTitle "Miskatonic University" <> LocationWithAsset "Thomas Corrigan" <> LocationWithAsset "Mary Zielinski")) $
        Objective $ forced AnyWindow
    ]

instance RunMessage RedeemAFormerColleague where
  runMessage message card@(RedeemAFormerColleague attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if epic then runEpic message card else RedeemAFormerColleague . toAttrs <$> liftRunMessage message (native attrs)

runEpic :: Message -> RedeemAFormerColleague -> QueueT Message GameT RedeemAFormerColleague
runEpic message card@(RedeemAFormerColleague attrs) = case message of
    _ | Just updated <- syncStoryReplica attrs message -> pure $ RedeemAFormerColleague updated
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      withLocationOf iid $ \lid -> emitMachinations $ BringEdwin iid lid
      pure card
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      withMatch edwin $ \eid -> do
        sid <- getRandom
        chooseOneM iid $ for_ [#willpower, #intellect] $ \skill ->
          i18nKeyLabeled ("Parley with Edwin using " <> tshow skill) $ parley sid iid (attrs.ability 2) eid skill $ Fixed 3
      pure card
    PassedThisSkillTest _ (isAbilitySource attrs 2 -> True) -> do
      cost <- getGlobalPlayerCount
      donors <- selectWithField InvestigatorClues UneliminatedInvestigator
      when (sum (map snd donors) >= cost) do
        spendCluesAsAGroup (map fst donors) cost
        withMatch edwin $ \eid -> placeTokens (attrs.ability 2) eid Token.Redemption 1
      pure card
    UseThisAbility iid (isSource attrs -> True) 3 -> do
      withMatch edwin $ \eid -> do
        tokens <- field EnemyTokens eid
        removeTokens (attrs.ability 3) eid Token.Redemption $ Map.findWithDefault 0 Token.Redemption tokens
        flipOverBy iid (attrs.ability 3) eid
      emitMachinations $ CompleteStory "87034"
      pure card
    _ -> RedeemAFormerColleague <$> liftRunMessage message attrs
