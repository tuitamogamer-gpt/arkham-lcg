module Arkham.Homebrew.ScenarioFixes.PolarMirageSpec (spec) where

import Arkham.Ability (abilityActions, abilityIndex)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.EdgeOfTheEarth.LeftBehind qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyDoom))
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Matcher
import Arkham.Placement (Placement (AttachedToLocation))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Token qualified as Token
import Arkham.Treachery.CardDefs.EdgeOfTheEarth.SilenceAndMystery qualified as Treacheries
import Arkham.Treachery.Types (Field (TreacheryPlacement))
import Data.Aeson qualified as Aeson
import TestImport.New

-- The fixtures place the actual printed treachery and enemy, then pay for an
-- offered evade/parley action and resolve the real skill test. No fabricated
-- TakeControlOfClues or UseThisAbility messages stand in for the player path.
spec :: Spec
spec = describe "Polar Mirage and the Left Behind enemies" do
  it "discards non-weakness cards before the last-doom Explorer leaves play"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      mirage <- attachMirage location
      explorer <- testEnemyWithDef Enemies.frenziedExplorer id
      explorer `spawnAt` location
      weakness <- prepareHand self
      duringTurn self do
        evadeWithMargin self explorer 2
        self.remainingActions `shouldReturn` 2
        useReactionOf explorer
        -- The clue exists, but the enemy must remain available to Polar
        -- Mirage's SourceIsEnemy matcher until the forced window resolves.
        self.clues `shouldReturn` 1
        assertAny $ EnemyWithId explorer.id
        field EnemyDoom explorer.id `shouldReturn` 0
        assertAny $ TreacheryWithId mirage
        self.hand `shouldSatisfyM` ((== 3) . length)
        roundTripPendingGame
        useForcedAbility
        -- DiscardAll opens the native order-of-discard choice. The printed
        -- treachery and the enemy remain in play until both cards resolve.
        assertAny $ TreacheryWithId mirage
        assertAny $ EnemyWithId explorer.id
        roundTripPendingGame
        chooseMirageDiscards self
        self.hand `shouldReturn` [weakness]
        asDefs self.discard `shouldMatchListM` [Assets.flashlight, Assets.knife]
        assertNone $ TreacheryWithId mirage
        assertNone $ EnemyWithId explorer.id
        self.clues `shouldReturn` 1

  it "keeps an Explorer that still has doom after the clue-control trigger"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      mirage <- attachMirage location
      explorer <- testEnemyWithDef Enemies.frenziedExplorer id
      explorer `spawnAt` location
      run $ PlaceTokens GameSource (toTarget explorer) Token.Doom 1
      weakness <- prepareHand self
      duringTurn self do
        evadeWithMargin self explorer 3
        useReactionOf explorer
        useForcedAbility
        chooseMirageDiscards self
        self.hand `shouldReturn` [weakness]
        self.clues `shouldReturn` 1
        field EnemyDoom explorer.id `shouldReturn` 1
        assertAny $ EnemyWithId explorer.id
        assertNone $ TreacheryWithId mirage

  it "does not trigger a Mirage attached to another location"
    . gameTest $ \self -> do
      location <- testLocation
      remote <- testLocation
      self `moveTo` location
      mirage <- attachMirage remote
      explorer <- testEnemyWithDef Enemies.frenziedExplorer id
      explorer `spawnAt` location
      void $ prepareHand self
      before <- self.hand
      duringTurn self do
        evadeWithMargin self explorer 2
        useReactionOf explorer
        self.clues `shouldReturn` 1
        self.hand `shouldReturn` before
        assertAny $ TreacheryWithId mirage
        field TreacheryPlacement mirage `shouldReturn` AttachedToLocation remote.id
        assertNone $ EnemyWithId explorer.id

  it "does not take a clue or trigger Mirage when the Explorer reaction is declined"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      mirage <- attachMirage location
      explorer <- testEnemyWithDef Enemies.frenziedExplorer id
      explorer `spawnAt` location
      void $ prepareHand self
      before <- self.hand
      duringTurn self do
        evadeWithMargin self explorer 2
        chooseOptionMatching "decline Frenzied Explorer's reaction" \case
          SkipTriggersButton {} -> True
          _ -> False
        self.clues `shouldReturn` 0
        self.hand `shouldReturn` before
        field EnemyDoom explorer.id `shouldReturn` 1
        assertAny $ EnemyWithId explorer.id
        assertAny $ TreacheryWithId mirage

  it "does not offer clue control when the evade succeeds by only one"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      mirage <- attachMirage location
      explorer <- testEnemyWithDef Enemies.frenziedExplorer id
      explorer `spawnAt` location
      void $ prepareHand self
      before <- self.hand
      duringTurn self do
        evadeWithMargin self explorer 1
        assertHasNoReaction
        self.clues `shouldReturn` 0
        self.hand `shouldReturn` before
        field EnemyDoom explorer.id `shouldReturn` 1
        assertAny $ EnemyWithId explorer.id
        assertAny $ TreacheryWithId mirage

  it "preserves Lost Researcher's existing clue-control window after a paid parley"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      mirage <- attachMirage location
      researcher <- testEnemyWithDef Enemies.lostResearcher id
      researcher `spawnAt` location
      weakness <- prepareHand self
      withProp @"intellect" 5 self
      setChaosTokens [Zero]
      duringTurn self do
        [parley] <- filter ((== 2) . abilityIndex) <$> self `getActionsFrom` researcher
        self `useAbility` parley
        chooseSkill #intellect
        startSkillTest
        applyResults
        self.remainingActions `shouldReturn` 2
        self.clues `shouldReturn` 1
        assertAny $ EnemyWithId researcher.id
        useForcedAbility
        chooseMirageDiscards self
        self.hand `shouldReturn` [weakness]
        asDefs self.discard `shouldMatchListM` [Assets.flashlight, Assets.knife]
        assertNone $ EnemyWithId researcher.id
        assertNone $ TreacheryWithId mirage
        self.clues `shouldReturn` 1

attachMirage :: Location -> TestAppT TreacheryId
attachMirage location = do
  card <- genCard Treacheries.polarMirage
  (tid, message) <- Helpers.createTreacheryAt card $ AttachedToLocation location.id
  run message
  pure tid

prepareHand :: Investigator -> TestAppT Card
prepareHand self = do
  flashlight <- genPlayerCard Assets.flashlight
  knife <- genPlayerCard Assets.knife
  weakness <- genPlayerCard Assets.theNecronomiconDrakeTranslation
  withProp @"hand" (map toCard [flashlight, knife, weakness]) self
  pure $ toCard weakness

evadeWithMargin :: Investigator -> Enemy -> Int -> TestAppT ()
evadeWithMargin self explorer margin = do
  withProp @"agility" (2 + margin) self
  setChaosTokens [Zero]
  [evade] <- filter (elem #evade . abilityActions) <$> self `getActionsFrom` explorer
  self `useAbility` evade
  startSkillTest
  applyResults

chooseMirageDiscards :: Investigator -> TestAppT ()
chooseMirageDiscards self = do
  hand <- self.hand
  let eligible = filter (`cardMatch` NonWeakness) hand
  length eligible `shouldBe` 2
  map toCardCode eligible `shouldMatchList` map toCardCode [Assets.flashlight, Assets.knife]
  -- These are exact physical cards from the hand, chosen only through the
  -- actual offered ChooseOneAtATime question. A missing/extra choice fails.
  questionMap <- gameQuestion <$> getGame
  case map (stripQuestionWrappers . snd) (mapToList questionMap) of
    [ChooseOneAtATime choices] -> length choices `shouldBe` 2
    other -> expectationFailure $ "expected the native discard-order choice, got: " <> show other
  for_ eligible chooseTarget

roundTripPendingGame :: TestAppT ()
roundTripPendingGame = do
  game <- getGame
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  case Aeson.eitherDecode (Aeson.encode (game, pending)) of
    Left err -> expectationFailure err
    Right (restored, restoredPending) -> do
      overTest (const restored)
      liftIO $ atomicWriteIORef (queueToRef $ messageQueueRef env) restoredPending
