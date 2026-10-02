module Arkham.Homebrew.EpicMachinations.Stories.UneasyAlliance (uneasyAlliance) where

import Arkham.Ability
import Arkham.GameT (GameT)
import Arkham.Queue (QueueT)
import Arkham.Card (cbCardBuilder)
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Asset.Types (Field (AssetClues))
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Helpers.SkillTest.Lifted (parley)
import Arkham.Helpers.Window (getScenarioEvent)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Stories.Shared
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Projection ()
import Arkham.Id (AssetId)
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Arkham.ScenarioLogKey
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Story.Cards.MachinationsThroughTime.UneasyAlliance qualified as Native
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))

newtype UneasyAlliance = UneasyAlliance StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

uneasyAlliance :: StoryCard UneasyAlliance
uneasyAlliance = story UneasyAlliance Cards.uneasyAlliance & persistStory

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.uneasyAlliance attrs.cardId (Nothing, attrs.id)
edwin = assetIs Assets.edwinBennetEsteemedColleague

instance HasAbilities UneasyAlliance where
  getAbilities (UneasyAlliance attrs)
    | isNothing $ storyReplica attrs = getAbilities $ native attrs
    | otherwise =
      [ restricted attrs 1 (exists $ edwin <> at_ YourLocation <> #ready) parleyAction_
      , restricted attrs 2 (if edwinElsewhere eraEdwinAsset attrs then NoRestriction
          else exists $ edwin <> oneOf [not_ (at_ YourLocation), not_ #ready]) actionAbility
      , mkAbility attrs 3 $ forced $ RoundEnds #when
      , mkAbility attrs 4 $ forced $ ScenarioEvent #when Nothing "edwinWouldBeAbducted"
      , onlyOnce $ restricted attrs 5 (Remembered ThomasAndMaryHaveWonANobelPrize
          <> (if allPlotsFinished attrs then NoRestriction else Never)) $ Objective $ forced AnyWindow
      ]

instance RunMessage UneasyAlliance where
  runMessage message card@(UneasyAlliance attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if epic then runEpic message card else UneasyAlliance . toAttrs <$> liftRunMessage message (native attrs)

runEpic :: Message -> UneasyAlliance -> QueueT Message GameT UneasyAlliance
runEpic message card@(UneasyAlliance attrs) = case message of
  _ | Just updated <- syncStoryReplica attrs message -> pure $ UneasyAlliance updated
  UseThisAbility iid (isSource attrs -> True) 1 -> do
    withMatch edwin $ \aid -> do
      whenM ((> 0) <$> iid.clues) $ moveTokens (attrs.ability 1) iid aid #clue 1
      sid <- getRandom
      chooseOneM iid do
        i18nKeyLabeled "Test intellect (4) to place another clue on Edwin" $ parley sid iid (attrs.ability 1) aid #intellect $ Fixed 4
        i18nKeyLabeled "Finish the parley without a skill test" nothing
    pure card
  PassedThisSkillTest iid (isAbilitySource attrs 1 -> True) -> do
    whenM ((> 0) <$> iid.clues) $ withMatch edwin $ \aid -> moveTokens (attrs.ability 1) iid aid #clue 1
    pure card
  FailedThisSkillTest _ (isAbilitySource attrs 1 -> True) -> withMatch edwin exhaustThis >> pure card
  UseThisAbility iid (isSource attrs -> True) 2 -> do
    withLocationOf iid $ \lid -> emitMachinations $ BringEdwin iid lid
    pure card
  UseThisAbility _ (isSource attrs -> True) 3 -> do
    -- Groups have independent rounds; this forced effect has no cross-era clause.
    selectOne edwin >>= \case
      Just aid -> do
        clues <- field AssetClues aid
        if clues >= 2 then removeTokens (attrs.ability 3) aid #clue 2 else placeDoomOnAgendaAndCheckAdvance 1
      Nothing -> placeDoomOnAgendaAndCheckAdvance 1
    pure card
  UseCardAbility _ (isSource attrs -> True) 4 windows@(getScenarioEvent @AssetId "edwinWouldBeAbducted" -> aid) _ -> do
    cancelWindowBatch windows
    healAllDamageAndHorror (attrs.ability 4) aid
    placeDoomOnAgendaAndCheckAdvance 2
    pure card
  UseThisAbility _ (isSource attrs -> True) 5 -> emitMachinations (CompleteStory "87035") >> pure card
  FlipThis (isTarget attrs -> True) -> flippedOver attrs >> pure (UneasyAlliance attrs {storyFlipped = True})
  _ -> UneasyAlliance <$> liftRunMessage message attrs
