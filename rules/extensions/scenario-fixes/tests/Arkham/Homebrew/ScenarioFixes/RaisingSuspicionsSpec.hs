module Arkham.Homebrew.ScenarioFixes.RaisingSuspicionsSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Agenda.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Agendas
import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.NightOfTheZealot.Rats qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyCard, EnemyDoom))
import Arkham.Helpers.Scenario (getEncounterDeck, getEncounterDiscard)
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (RegularEncounterDeck))
import Arkham.Treachery.CardDefs.BrethrenOfAsh.DeadEnds qualified as Treacheries
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as OtherTreacheries
import Data.Aeson qualified as Aeson
import TestImport.New

-- Draw the physical card so the printed surge fallback runs through Revelation
-- and its real completion, including the agenda that replaces attempted doom.
spec :: Spec
spec = describe "Raising Suspicions checks actual doom placement" do
  it "places doom without surging after an actual placement" . scenarioTest "12168" $ \self -> do
    location <- prepare self
    enemy <- spawnRat location
    (suspicions, followup, tailCard) <- drawSuspicions self
    chooseTarget enemy
    field EnemyDoom enemy.id `shouldReturn` 1
    getEncounterDeck `shouldReturn` Deck [followup, tailCard]
    assertFinished suspicions

  it "surges once when there is no enemy in play" . scenarioTest "12168" $ \self -> do
    void $ prepare self
    (suspicions, followup, tailCard) <- drawSuspicions self
    assertDrawn followup
    getEncounterDeck `shouldReturn` Deck [tailCard]
    assertFinished suspicions

  it "surges when the only enemy already has doom" . scenarioTest "12168" $ \self -> do
    location <- prepare self
    enemy <- spawnRat location
    run $ PlaceDoom GameSource (toTarget enemy) 1
    (suspicions, followup, tailCard) <- drawSuspicions self
    field EnemyDoom enemy.id `shouldReturn` 1
    assertDrawn followup
    getEncounterDeck `shouldReturn` Deck [tailCard]
    assertFinished suspicions

  it "surges when the only doom-free enemy cannot receive doom" . scenarioTest "12168" $ \self -> do
    location <- prepare self
    enemy <- spawnRat location
    run =<< gameModifier GameSource enemy CannotPlaceDoomOnThis
    (suspicions, followup, tailCard) <- drawSuspicions self
    field EnemyDoom enemy.id `shouldReturn` 0
    assertDrawn followup
    getEncounterDeck `shouldReturn` Deck [tailCard]
    assertFinished suspicions

  it "chooses the nearest eligible enemy rather than a nearer enemy with doom" . scenarioTest "12168" $ \self -> do
    withDeck self [Assets.flashlight]
    (here, adjacent) <- testConnectedLocations id id
    self `moveTo` here
    near <- spawnRat here
    far <- spawnRat adjacent
    run $ PlaceDoom GameSource (toTarget near) 1
    (suspicions, followup, tailCard) <- drawSuspicions self
    chooseTarget far
    field EnemyDoom near.id `shouldReturn` 1
    field EnemyDoom far.id `shouldReturn` 1
    getEncounterDeck `shouldReturn` Deck [followup, tailCard]
    assertFinished suspicions

  it "restores the pending target choice and records only its actual placement" . scenarioTest "12168" $ \self -> do
    location <- prepare self
    first <- spawnRat location
    second <- spawnRat location
    (suspicions, followup, tailCard) <- drawSuspicions self
    roundTripPendingGame
    chooseTarget second
    field EnemyDoom first.id `shouldReturn` 0
    field EnemyDoom second.id `shouldReturn` 1
    getEncounterDeck `shouldReturn` Deck [followup, tailCard]
    assertFinished suspicions

  it "surges after Brethren of Ash replaces doom with damage, including after save/resume"
    . scenarioTest "12168" $ \self -> do
      location <- prepare self
      enemy <- spawnRat location
      unrelated <- spawnRat location
      run $ PlaceDoom GameSource (toTarget unrelated) 1
      runQueueT $ Lifted.setAgendaDeck [Agendas.brethrenOfAsh]
      runMessages
      run SetAgendaDeck
      (suspicions, followup, tailCard) <- drawSuspicions self
      chooseTarget enemy
      roundTripPendingGame
      agenda <- selectJust $ AgendaWithStep 3
      chooseOptionMatching "Brethren of Ash replaces the actual pending doom placement" \case
        AbilityLabel {ability} -> abilitySource ability == toSource agenda && abilityIndex ability == 1
        _ -> False
      assertDamageIsDirect
      applyAllDamage
      self.damage `shouldReturn` 1
      field EnemyDoom enemy.id `shouldReturn` 0
      field EnemyDoom unrelated.id `shouldReturn` 1
      assertDrawn followup
      getEncounterDeck `shouldReturn` Deck [tailCard]
      assertFinished suspicions

prepare :: Investigator -> TestAppT Location
prepare self = do
  withDeck self [Assets.flashlight]
  location <- testLocation
  self `moveTo` location
  pure location

spawnRat :: Location -> TestAppT Enemy
spawnRat location = do
  enemy <- testEnemyWithDef Enemies.swarmOfRats id
  enemy `spawnAt` location
  pure enemy

drawSuspicions :: Investigator -> TestAppT (EncounterCard, EncounterCard, EncounterCard)
drawSuspicions self = do
  suspicions <- genEncounterCard Treacheries.raisingSuspicions
  followup <- genEncounterCard Enemies.swarmOfRats
  tailCard <- genEncounterCard OtherTreacheries.cryptChill
  run $ SetEncounterDeck $ Deck [suspicions, followup, tailCard]
  run $ drawEncounterCard self.id GameSource
  pure (suspicions, followup, tailCard)

assertDrawn :: EncounterCard -> TestAppT ()
assertDrawn card = do
  cards <- selectField EnemyCard AnyEnemy
  count ((== toCardId card) . toCardId) cards `shouldBe` 1
  Deck deck <- getEncounterDeck
  map toCardId deck `shouldNotSatisfy` elem (toCardId card)
  discarded <- getEncounterDiscard RegularEncounterDeck
  map toCardId discarded `shouldNotSatisfy` elem (toCardId card)

assertFinished :: EncounterCard -> TestAppT ()
assertFinished card = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
  discarded <- getEncounterDiscard RegularEncounterDeck
  count ((== toCardId card) . toCardId) discarded `shouldBe` 1

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
