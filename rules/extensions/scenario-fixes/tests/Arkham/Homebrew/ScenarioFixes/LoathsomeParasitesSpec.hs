module Arkham.Homebrew.ScenarioFixes.LoathsomeParasitesSpec (spec) where

import Arkham.Agenda.CardDefs.TheDrownedCity.TheApiary qualified as Agendas
import Arkham.Agenda.Types (Agenda, Field (AgendaDoom))
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.NightOfTheZealot.Ghouls qualified as Enemies
import Arkham.Enemy.CardDefs.NightOfTheZealot.TheGathering qualified as Enemies
import Arkham.Enemy.CardDefs.TheCircleUndone.AnettesCoven qualified as Coven
import Arkham.Enemy.Types (Field (EnemyCard, EnemyLocation))
import Arkham.Entities qualified as Entities
import Arkham.Helpers.Scenario (getEncounterDeck, getEncounterDiscard)
import Arkham.Investigator.Types (Field (InvestigatorUsedAbilities))
import Arkham.Matcher
import Arkham.Projection
import Arkham.Queue qualified as Queue
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (RegularEncounterDeck))
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as Treacheries
import Data.Aeson qualified as Aeson
import System.Random (mkStdGen)
import TestImport.New

spec :: Spec
spec = describe "Loathsome Parasites encounter reveal" do
  it "returns only revealed non-enemies above the untouched remainder and spawns the physical first enemy"
    . gameTest $ \self -> do
      (agenda', empty) <- prepare self
      revealed <- replicateM 2 $ genEncounterCard Treacheries.cryptChill
      enemy <- genEncounterCard Enemies.ghoulMinion
      tailCards <- traverse genEncounterCard [Treacheries.obscuringFog, Enemies.ravenousGhoul]
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck (revealed <> [enemy] <> tailCards)
      run $ AddToEncounterDiscard discarded
      trigger agenda'
      Deck actual <- getEncounterDeck
      take 2 actual `shouldMatchList` revealed
      drop 2 actual `shouldBe` tailCards
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertSpawn enemy (toId empty)

  it "shuffles the fully revealed deck without searching for an enemy in the discard"
    . gameTest $ \self -> do
      (agenda', _) <- prepare self
      revealed <- replicateM 8 $ genEncounterCard Treacheries.cryptChill
      enemy <- genEncounterCard Enemies.ghoulMinion
      run $ SetEncounterDeck $ Deck revealed
      run $ AddToEncounterDiscard enemy
      env <- get
      liftIO $ writeIORef (gen env) (mkStdGen 5489)
      trigger agenda'
      Deck actual <- getEncounterDeck
      actual `shouldMatchList` revealed
      actual `shouldNotBe` revealed
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [enemy]
      selectCount AnyEnemy `shouldReturn` 0
      assertRevealFinished self

  it "refills an initially empty deck and finishes with each unspawned card exactly once"
    . gameTest $ \self -> do
      (agenda', empty) <- prepare self
      enemy <- genEncounterCard Enemies.ghoulMinion
      other <- genEncounterCard Treacheries.cryptChill
      run $ SetEncounterDeck $ Deck []
      runAll $ map AddToEncounterDiscard [enemy, other]
      trigger agenda'
      getEncounterDeck `shouldReturn` Deck [other]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` []
      assertSpawn enemy (toId empty)

  it "leaves the discard untouched when revealing the deck finds no enemy"
    . gameTest $ \self -> do
      (agenda', _) <- prepare self
      first <- genEncounterCard Treacheries.cryptChill
      second <- genEncounterCard Treacheries.cryptChill
      run $ SetEncounterDeck $ Deck [first]
      run $ AddToEncounterDiscard second
      trigger agenda'
      Deck actual <- getEncounterDeck
      actual `shouldBe` [first]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [second]
      selectCount AnyEnemy `shouldReturn` 0
      assertRevealFinished self

  it "terminates when both piles are empty"
    . gameTest $ \self -> do
      (agenda', _) <- prepare self
      run $ SetEncounterDeck $ Deck []
      trigger agenda'
      getEncounterDeck `shouldReturn` Deck []
      selectCount AnyEnemy `shouldReturn` 0
      assertRevealFinished self

  it "does not empty the deck when the last revealed enemy is preceded by other cards"
    . gameTest $ \self -> do
      (agenda', empty) <- prepare self
      before <- genEncounterCard Treacheries.cryptChill
      enemy <- genEncounterCard Enemies.ghoulMinion
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck [before, enemy]
      run $ AddToEncounterDiscard discarded
      trigger agenda'
      getEncounterDeck `shouldReturn` Deck [before]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertSpawn enemy (toId empty)

  it "refills after spawning when revealing a lone enemy leaves the completed deck empty"
    . gameTest $ \self -> do
      (agenda', empty) <- prepare self
      enemy <- genEncounterCard Enemies.ghoulMinion
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck [enemy]
      run $ AddToEncounterDiscard discarded
      trigger agenda'
      getEncounterDeck `shouldReturn` Deck [discarded]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` []
      assertSpawn enemy (toId empty)

  it "does not trigger while a non-Elite enemy is in play"
    . gameTest $ \self -> do
      (agenda', empty) <- prepare self
      existing <- testEnemyWithDef Enemies.ghoulMinion id
      existing `spawnAt` empty
      enemy <- genEncounterCard Enemies.ravenousGhoul
      run $ SetEncounterDeck $ Deck [enemy]
      run $ PlaceDoom GameSource (toTarget agenda') 1
      field AgendaDoom (toId agenda') `shouldReturn` 1
      getEncounterDeck `shouldReturn` Deck [enemy]
      selectCount AnyEnemy `shouldReturn` 1
      gameQuestion <$> getGame `shouldReturn` mempty

  it "still triggers with an Elite enemy in play and prefers the remaining empty location"
    . gameTest $ \self -> do
      (agenda', eliteLocation) <- prepare self
      existing <- testEnemyWithDef Enemies.ghoulPriest id
      existing `spawnAt` eliteLocation
      empty <- testLocation
      enemy <- genEncounterCard Enemies.ghoulMinion
      run $ SetEncounterDeck $ Deck [enemy]
      trigger agenda'
      assertSpawn enemy (toId empty)
      selectCount AnyEnemy `shouldReturn` 2

  it "offers the live empty-location choice when several locations are empty"
    . gameTest $ \self -> do
      (agenda', _) <- prepare self
      chosen <- testLocation
      enemy <- genEncounterCard Enemies.ghoulMinion
      run $ SetEncounterDeck $ Deck [enemy]
      trigger agenda'
      chooseTarget chosen
      assertSpawn enemy (toId chosen)

  it "falls back to an occupied location when no empty location exists"
    . gameTest $ \self -> do
      agenda' <- realAgenda
      occupied <- testLocation
      self `moveTo` occupied
      enemy <- genEncounterCard Enemies.ghoulMinion
      run $ SetEncounterDeck $ Deck [enemy]
      trigger agenda'
      assertSpawn enemy (toId occupied)
      assertAny $ enemyEngagedWith (toId self)

  it "preserves the native exhaustion window after spawning and resumes from a saved checkpoint"
    . gameTest $ \self -> do
      (agenda', priestessLocation) <- prepare self
      priestess <- testEnemyWithDef Coven.priestessOfTheCoven id
      priestess `spawnAt` priestessLocation
      exhaust priestess
      empty <- testLocation
      enemy <- genEncounterCard Enemies.ghoulMinion
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck [enemy]
      run $ AddToEncounterDiscard discarded
      -- Invoke the real handler directly: Priestess observes the window, but
      -- the printed no-non-Elite trigger is exercised in separate cases above.
      run $ UseCardAbility (toId self) (toSource agenda') 1 [] NoPayment
      getEncounterDeck `shouldReturn` Deck []
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertSpawn enemy (toId empty)
      assertAny $ EnemyWithId (toId priestess) <> ExhaustedEnemy
      game <- getGame
      let restoredGame = Aeson.eitherDecode (Aeson.encode game) :: Either String Game
      saved <- either (error . ("native game reload: " <>)) pure restoredGame
      overTest $ const saved
      env <- get
      queued <- liftIO $ readIORef $ Queue.queueToRef $ messageQueueRef env
      let restoredQueue = Aeson.eitherDecode (Aeson.encode queued) :: Either String [Message]
      savedQueue <- either (error . ("native queue reload: " <>)) pure restoredQueue
      liftIO $ writeIORef (Queue.queueToRef $ messageQueueRef env) savedQueue
      useForcedAbility
      assertNone $ EnemyWithId (toId priestess) <> ExhaustedEnemy
      getEncounterDeck `shouldReturn` Deck [discarded]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` []
      assertSpawn enemy (toId empty)

  it "does not emit an exhaustion window merely by revealing the whole deck"
    . gameTest $ \self -> do
      (agenda', priestessLocation) <- prepare self
      priestess <- testEnemyWithDef Coven.priestessOfTheCoven id
      priestess `spawnAt` priestessLocation
      exhaust priestess
      revealed <- genEncounterCard Treacheries.cryptChill
      enemy <- genEncounterCard Enemies.ghoulMinion
      run $ SetEncounterDeck $ Deck [revealed]
      run $ AddToEncounterDiscard enemy
      run $ UseCardAbility (toId self) (toSource agenda') 1 [] NoPayment
      getEncounterDeck `shouldReturn` Deck [revealed]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [enemy]
      assertAny $ EnemyWithId (toId priestess) <> ExhaustedEnemy
      selectCount (enemyIs Enemies.ghoulMinion) `shouldReturn` 0
      gameQuestion <$> getGame `shouldReturn` mempty

  it "does not emit an exhaustion window for an already empty starting deck"
    . gameTest $ \self -> do
      (agenda', priestessLocation) <- prepare self
      priestess <- testEnemyWithDef Coven.priestessOfTheCoven id
      priestess `spawnAt` priestessLocation
      exhaust priestess
      other <- genEncounterCard Treacheries.cryptChill
      run $ SetEncounterDeck $ Deck []
      run $ AddToEncounterDiscard other
      run $ UseCardAbility (toId self) (toSource agenda') 1 [] NoPayment
      getEncounterDeck `shouldReturn` Deck [other]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` []
      assertAny $ EnemyWithId (toId priestess) <> ExhaustedEnemy
      gameQuestion <$> getGame `shouldReturn` mempty

realAgenda :: TestAppT Agenda
realAgenda = do
  card <- genCard Agendas.loathsomeParasites
  let agenda' = lookupAgenda (AgendaId $ toCardCode card) 1 (toCardId card)
  overTest $ entitiesL . Entities.agendasL %~ insertEntity agenda'
  pure agenda'

prepare :: Investigator -> TestAppT (Agenda, Location)
prepare self = do
  agenda' <- realAgenda
  occupied <- testLocation
  self `moveTo` occupied
  empty <- testLocation
  pure (agenda', empty)

trigger :: Agenda -> TestAppT ()
trigger agenda' = do
  run $ PlaceDoom GameSource (toTarget agenda') 1
  useForcedAbility

assertSpawn :: EncounterCard -> LocationId -> TestAppT ()
assertSpawn card location = do
  eid <- selectJust $ enemyIs $ toCardDef card
  fieldMap EnemyCard toCardId eid `shouldReturn` toCardId card
  field EnemyLocation eid `shouldReturn` Just location

assertRevealFinished :: Investigator -> TestAppT ()
assertRevealFinished self = do
  -- TestImport's answer helper pushes the selected messages but retains the
  -- consumed question. A genuine re-offer would leave an open window and its
  -- continuation queued, so assert the engine actually finished that window.
  env <- get
  queued <- liftIO $ readIORef $ Queue.queueToRef $ messageQueueRef env
  queued `shouldBe` []
  gameWindowDepth <$> getGame `shouldReturn` 0
  gameWindowStack <$> getGame `shouldReturn` Nothing
  field InvestigatorUsedAbilities (toId self) `shouldReturn` []
