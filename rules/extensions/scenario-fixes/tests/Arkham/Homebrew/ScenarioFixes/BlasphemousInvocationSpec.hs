module Arkham.Homebrew.ScenarioFixes.BlasphemousInvocationSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource, abilityType)
import Arkham.Ability.Type (AbilityType (ForcedAbility))
import Arkham.Agenda.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Agendas
import Arkham.Agenda.Types (Field (AgendaCard))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetDamage))
import Arkham.Asset.Types qualified as Asset
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.BrethrenOfAsh.AshenPilgrims qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyCard, EnemyDoom))
import Arkham.GameEnv (getJustSkillTest)
import Arkham.Helpers.Scenario (getEncounterDeck, getEncounterDiscard)
import Arkham.Helpers.SkillTest (getModifiedSkillTestDifficulty)
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Placement (Placement (InPlayArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (RegularEncounterDeck))
import Arkham.Treachery.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Treacheries
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as OtherTreacheries
import Control.Monad.State (put)
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed 12190 checks whether doom WAS placed, after attempting one placement
-- per failed point. Agenda 12171 replaces those placements with direct damage.
-- Every example draws the physical treachery and resolves its real willpower
-- test; replacement examples also resolve the agenda's native forced window.
spec :: Spec
spec = describe "Blasphemous Invocation: actual doom and the fallback search" do
  it "does nothing after a successful willpower test" . scenarioTest "12168" $ \self -> do
    location <- prepare self 3
    cultist <- spawnCultist location
    (invocation, fallback, tailCard, searches) <- drawInvocation self
    startSkillTest
    applyResults
    field EnemyDoom cultist.id `shouldReturn` 0
    searches `refShouldBe` 0
    getEncounterDeck `shouldReturn` Deck [fallback, tailCard]
    assertFinished invocation

  it "places one doom and does not draw another cultist when any doom was placed"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self 2
      cultist <- spawnCultist location
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      startSkillTest
      applyResults
      chooseTarget cultist
      field EnemyDoom cultist.id `shouldReturn` 1
      searches `refShouldBe` 0
      getEncounterDeck `shouldReturn` Deck [fallback, tailCard]
      assertFinished invocation

  it "recomputes legal cultists per point and preserves an actual placement across save/resume"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self 1
      first <- spawnCultist location
      second <- spawnCultist location
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      startSkillTest
      applyResults
      chooseTarget first
      field EnemyDoom first.id `shouldReturn` 1
      field EnemyDoom second.id `shouldReturn` 0
      roundTripPendingGame
      chooseTarget second
      field EnemyDoom first.id `shouldReturn` 1
      field EnemyDoom second.id `shouldReturn` 1
      searches `refShouldBe` 0
      getEncounterDeck `shouldReturn` Deck [fallback, tailCard]
      assertFinished invocation

  it "finishes when legal cultists run out after a partial placement, without a fallback"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self 0
      cultist <- spawnCultist location
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      startSkillTest
      applyResults
      chooseTarget cultist
      field EnemyDoom cultist.id `shouldReturn` 1
      searches `refShouldBe` 0
      getEncounterDeck `shouldReturn` Deck [fallback, tailCard]
      assertFinished invocation

  it "searches and draws the exact physical cultist from the deck when no cultist is in play"
    . scenarioTest "12168" $ \self -> do
      void $ prepare self 2
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      startSkillTest
      applyResults
      searches `refShouldBe` 1
      roundTripPendingGame
      chooseTarget $ toCardId fallback
      assertDrawn fallback
      getEncounterDeck `shouldReturn` Deck [tailCard]
      assertFinished invocation

  it "searches the discard when the only cultist in play already has doom"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self 2
      cultist <- spawnCultist location
      run $ PlaceDoom GameSource (toTarget cultist) 1
      discarded <- genEncounterCard Enemies.cantorOfFlame
      run $ AddToEncounterDiscard discarded
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      startSkillTest
      applyResults
      searches `refShouldBe` 1
      chooseTarget $ toCardId discarded
      assertDrawn discarded
      field EnemyDoom cultist.id `shouldReturn` 1
      Deck remaining <- getEncounterDeck
      remaining `shouldMatchList` [fallback, tailCard]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [invocation]
      assertFinished invocation

  it "still searches after an automatic failure at difficulty zero"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self 5
      cultist <- spawnCultist location
      -- A native modifier reduces the actual printed test to zero; AutoFail
      -- still fails it, with zero failed points. No synthetic failure message.
      run =<< gameModifier GameSource self (Difficulty (-3))
      setChaosTokens [AutoFail]
      (invocation, fallback, tailCard, searches) <- drawInvocation self
      (getJustSkillTest >>= getModifiedSkillTestDifficulty) `shouldReturn` 0
      startSkillTest
      applyResults
      field EnemyDoom cultist.id `shouldReturn` 0
      searches `refShouldBe` 1
      chooseTarget $ toCardId fallback
      assertDrawn fallback
      getEncounterDeck `shouldReturn` Deck [tailCard]
      assertFinished invocation

  for_ [1, 2] \failedPoints ->
    it ("searches exactly once after Brethren of Ash replaces " <> show failedPoints <> " placements")
      . scenarioTest "12168" $ \self -> do
        location <- prepare self (3 - failedPoints)
        cultist <- spawnCultist location
        unrelated <- spawnCultist location
        run $ PlaceDoom GameSource (toTarget unrelated) 1
        coat <- testAssetWithDef Assets.leatherCoat
          ((Asset.controllerL ?~ self.id) . (Asset.placementL .~ InPlayArea self.id)) self
        installBrethren
        (invocation, fallback, tailCard, searches) <- drawInvocation self
        startSkillTest
        applyResults
        for_ [1 .. failedPoints] \attempt -> do
          -- The same physical enemy remains eligible when its earlier doom
          -- was replaced. The replacement still consumes one failed point.
          chooseTarget cultist
          when (attempt == 1) roundTripPendingGame
          resolveBrethren
          assertDamageIsDirect
          applyAllDamage
          self.damage `shouldReturn` attempt
          field AssetDamage coat.id `shouldReturn` 0
          field EnemyDoom cultist.id `shouldReturn` 0
          field EnemyDoom unrelated.id `shouldReturn` 1
          searches `refShouldBe` (if attempt == failedPoints then 1 else 0)
        roundTripPendingGame
        chooseTarget $ toCardId fallback
        assertDrawn fallback
        searches `refShouldBe` 1
        getEncounterDeck `shouldReturn` Deck [tailCard]
        assertFinished invocation

prepare :: Investigator -> Int -> TestAppT Location
prepare self willpower = do
  -- A loaded player deck keeps the native physical-card cache populated.
  withDeck self [Assets.flashlight]
  location <- testLocation
  self `moveTo` location
  withProp @"willpower" willpower self
  setChaosTokens [Zero]
  pure location

spawnCultist :: Location -> TestAppT Enemy
spawnCultist location = do
  cultist <- testEnemyWithDef Enemies.cantorOfFlame id
  cultist `spawnAt` location
  pure cultist

drawInvocation :: Investigator -> TestAppT (EncounterCard, EncounterCard, EncounterCard, IORef Int)
drawInvocation self = do
  invocation <- genEncounterCard Treacheries.blasphemousInvocation
  fallback <- genEncounterCard Enemies.cantorOfFlame
  tailCard <- genEncounterCard OtherTreacheries.cryptChill
  run $ SetEncounterDeck $ Deck [invocation, fallback, tailCard]
  searches <- countSearches
  run $ drawEncounterCard self.id GameSource
  pure (invocation, fallback, tailCard, searches)

installBrethren :: TestAppT ()
installBrethren = do
  runQueueT $ Lifted.setAgendaDeck [Agendas.brethrenOfAsh]
  runMessages
  run SetAgendaDeck

resolveBrethren :: TestAppT ()
resolveBrethren = do
  agenda <- selectJust $ AgendaWithStep 3
  fieldMap AgendaCard toCardCode agenda `shouldReturn` toCardCode Agendas.brethrenOfAsh
  chooseOptionMatching "replace doom with Brethren of Ash's direct damage" \case
    AbilityLabel {ability}
      | ForcedAbility {} <- abilityType ability ->
          abilityIndex ability == 1 && abilitySource ability == toSource agenda
    _ -> False

assertDrawn :: EncounterCard -> TestAppT ()
assertDrawn card = do
  physicalIds <- map toCardId <$> selectField EnemyCard AnyEnemy
  count (== toCardId card) physicalIds `shouldBe` 1
  Deck deck <- getEncounterDeck
  map toCardId deck `shouldNotSatisfy` elem (toCardId card)
  discarded <- getEncounterDiscard RegularEncounterDeck
  map toCardId discarded `shouldNotSatisfy` elem (toCardId card)

assertFinished :: EncounterCard -> TestAppT ()
assertFinished invocation = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
  gameSkillTest <$> getGame `shouldReturn` Nothing
  discarded <- getEncounterDiscard RegularEncounterDeck
  count ((== toCardId invocation) . toCardId) discarded `shouldBe` 1

countSearches :: TestAppT (IORef Int)
countSearches = do
  ref <- liftIO $ newIORef 0
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      -- Scenario.Runner calls its WithDeckKey handler directly, so the native
      -- queue/logger observes this outer message exactly once per search.
      FindAndDrawEncounterCard {} -> liftIO $ modifyIORef' ref (+ 1)
      _ -> pure ()}
  pure ref

roundTripPendingGame :: TestAppT ()
roundTripPendingGame = do
  current <- getGame
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  case Aeson.eitherDecode (Aeson.encode (current, pending)) of
    Left err -> expectationFailure err
    Right (restored, restoredPending) -> do
      overTest (const restored)
      liftIO $ atomicWriteIORef (queueToRef $ messageQueueRef env) restoredPending
