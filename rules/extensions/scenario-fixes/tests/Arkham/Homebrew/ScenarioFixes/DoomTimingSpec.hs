module Arkham.Homebrew.ScenarioFixes.DoomTimingSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Agenda.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Agendas
import Arkham.Agenda.Types (Field (AgendaDoom))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetDoom, AssetTokens))
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.TheDrownedCity.TheApiary qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyDoom, EnemyTokens))
import Arkham.Event.Cards qualified as Events
import Arkham.Event.Types (Field (EventDoom, EventTokens))
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Investigator.Types (Field (InvestigatorDoom, InvestigatorTokens))
import Arkham.Keyword qualified as Keyword
import Arkham.Location.Types (Field (LocationDoom, LocationTokens))
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Placement (Placement (AttachedToLocation, InThreatArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Timing qualified as Timing
import Arkham.Token qualified as Token
import Arkham.Treachery.CardDefs.TheDrownedCity.Stowaways qualified as Treacheries
import Arkham.Treachery.Types (Field (TreacheryDoom, TreacheryTokens))
import Arkham.Window qualified as Window
import Control.Monad.State (put)
import Data.Aeson qualified as Aeson
import TestImport.New

-- These run each actual entity runner, the Tender's offered Forced ability,
-- its attack and the native damage/horror assignments. The queue and Game are
-- serialized at both the interrupt and assignment prompts.
spec :: Spec
spec = describe "Doom placement resolves When before mutation and After afterwards" do
  for_ ["treachery", "event", "location", "enemy", "asset", "investigator"] \kind -> do
    it ("preserves existing doom and places all three new counters after a saved Tender attack on a " <> kind)
      . gameTest $ \self -> do
        here <- testLocation
        self `moveTo` here
        tender <- printedTender
        (target, doom) <- locatedTarget kind self here tender
        -- No Tender is at the location during this initial placement.
        run $ PlaceDoom GameSource target 2
        doom `shouldReturn` 2
        tender `spawnAt` here
        run $ EnemyEngageInvestigator tender.id self.id
        exhaust tender
        let source = toSource self
        receipts <- watchDoom source target
        run $ PlaceDoom source target 3
        doom `shouldReturn` 2
        receipts `refShouldBe` [(Timing.When, 3)]
        roundTripPendingGame
        chooseAbility tender 1
        doom `shouldReturn` 2
        receipts `refShouldBe` [(Timing.When, 3)]
        roundTripPendingGame
        assignAttack self
        doom `shouldReturn` 5
        self.damage `shouldReturn` 1
        self.horror `shouldReturn` 1
        receipts `refShouldBe` (if kind == "enemy" then [(Timing.When, 3), (Timing.AtIf, 3), (Timing.After, 3)] else [(Timing.When, 3), (Timing.After, 3)])
        assertQueueFinished

    it ("does not trigger the Tender for zero doom on a " <> kind) . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      tender <- tenderAt here
      exhaust tender
      (target, doom) <- locatedTarget kind self here tender
      run $ PlaceDoom GameSource target 0
      doom `shouldReturn` 0
      assertUntouched self tender
      assertQueueFinished

    it ("preserves other-token handling without a doom trigger on a " <> kind) . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      tender <- tenderAt here
      exhaust tender
      (target, doom) <- locatedTarget kind self here tender
      -- Flashlight accepts its printed Supply uses; the other fixtures accept
      -- resource counters. Assert the native update, not just absent doom.
      let token = if kind == "asset" then Token.Supply else Token.Resource
      before <- tokenCount token target
      run $ PlaceTokens GameSource target token 2
      tokenCount token target `shouldReturn` (before + 2)
      doom `shouldReturn` 0
      assertUntouched self tender
      assertQueueFinished

  it "does not open a placement interrupt when doom on the enemy is prohibited" . gameTest $ \self -> do
    here <- testLocation
    self `moveTo` here
    tender <- tenderAt here
    exhaust tender
    run =<< gameModifier GameSource tender CannotPlaceDoomOnThis
    receipts <- watchDoom GameSource (toTarget tender)
    run $ PlaceDoom GameSource (toTarget tender) 2
    field EnemyDoom tender.id `shouldReturn` 0
    receipts `refShouldBe` []
    assertUntouched self tender
    assertQueueFinished

  it "lets Brethren of Ash replace doom before any Tender interrupt or placement receipt" . scenarioTest "12168" $ \self -> do
    withDeck self [Assets.flashlight]
    here <- testLocation
    self `moveTo` here
    tender <- tenderAt here
    exhaust tender
    runQueueT $ Lifted.setAgendaDeck [Agendas.brethrenOfAsh]
    runMessages
    run SetAgendaDeck
    agenda <- selectJust $ AgendaWithStep 3
    receipts <- watchDoom GameSource (toTarget tender)
    run $ PlaceDoom GameSource (toTarget tender) 3
    receipts `refShouldBe` []
    roundTripPendingGame
    chooseAbility agenda 1
    assertDamageIsDirect
    applyAllDamage
    field EnemyDoom tender.id `shouldReturn` 0
    tender.exhausted `shouldReturn` True
    self.damage `shouldReturn` 1
    self.horror `shouldReturn` 0
    receipts `refShouldBe` []
    assertQueueFinished

  for_ [0, 2] \existing ->
    it ("publishes an agenda's first-doom receipt only after mutation, with " <> show existing <> " existing doom")
      . scenarioTest "12168" $ \self -> do
        withDeck self [Assets.flashlight]
        runQueueT $ Lifted.setAgendaDeck [Agendas.aGathering]
        runMessages
        run SetAgendaDeck
        agenda <- selectJust $ AgendaWithStep 1
        when (existing > 0) $ run $ PlaceDoom GameSource (toTarget agenda) existing
        receipts <- watchAgendaReceipt agenda
        run $ PlaceDoom GameSource (toTarget agenda) 3
        field AgendaDoom agenda `shouldReturn` (existing + 3)
        receipts `refShouldBe` (if existing == 0 then [(3, 3)] else [])
        assertQueueFinished

  it "does not publish an agenda's first-doom receipt for zero counters" . scenarioTest "12168" $ \self -> do
    withDeck self [Assets.flashlight]
    runQueueT $ Lifted.setAgendaDeck [Agendas.aGathering]
    runMessages
    run SetAgendaDeck
    agenda <- selectJust $ AgendaWithStep 1
    receipts <- watchAgendaReceipt agenda
    run $ PlaceDoom GameSource (toTarget agenda) 0
    field AgendaDoom agenda `shouldReturn` 0
    receipts `refShouldBe` []
    assertQueueFinished

  it "finishes both distinct Tenders' attacks before one placement and one receipt" . gameTest $ \self -> do
    here <- testLocation
    self `moveTo` here
    first <- tenderAt here
    second <- tenderAt here
    run $ EnemyEngageInvestigator first.id self.id
    run $ EnemyEngageInvestigator second.id self.id
    exhaust first
    exhaust second
    receipts <- watchDoom GameSource (toTarget here)
    run $ PlaceDoom GameSource (toTarget here) 2
    field LocationDoom here.id `shouldReturn` 0
    chooseAbility first 1
    assignAttack self
    field LocationDoom here.id `shouldReturn` 0
    roundTripPendingGame
    chooseAbility second 1
    assignAttack self
    field LocationDoom here.id `shouldReturn` 2
    self.damage `shouldReturn` 2
    self.horror `shouldReturn` 2
    receipts `refShouldBe` [(Timing.When, 2), (Timing.After, 2)]
    assertQueueFinished

printedTender :: TestAppT Enemy
printedTender = testEnemyWithDef Enemies.apiaryTender id
  & prop @"healthDamage" 1
  & prop @"sanityDamage" 1

tenderAt :: Location -> TestAppT Enemy
tenderAt here = do
  tender <- printedTender
  tender `spawnAt` here
  pure tender

locatedTarget :: String -> Investigator -> Location -> Enemy -> TestAppT (Target, TestAppT Int)
locatedTarget kind self here tender = case kind of
  "treachery" -> do
    card <- genCard Treacheries.infected
    (tid, msg) <- Helpers.createTreacheryAt card $ InThreatArea self.id
    run msg
    pure (toTarget tid, field TreacheryDoom tid)
  "event" -> do
    card <- genMyCard self Events.openGate
    run $ CreateEventAt self.id card (AttachedToLocation here.id)
    eid <- selectJust $ eventIs Events.openGate
    pure (toTarget eid, field EventDoom eid)
  "location" -> pure (toTarget here, field LocationDoom here.id)
  "enemy" -> pure (toTarget tender, field EnemyDoom tender.id)
  "asset" -> do
    aid <- self `putAssetIntoPlay` Assets.flashlight
    pure (toTarget aid, field AssetDoom aid)
  "investigator" -> pure (toTarget self, field InvestigatorDoom self.id)
  _ -> error $ "unsupported doom target fixture: " <> kind

tokenCount :: Token.Token -> Target -> TestAppT Int
tokenCount token = \case
  TreacheryTarget tid -> fieldMap TreacheryTokens (Token.countTokens token) tid
  EventTarget eid -> fieldMap EventTokens (Token.countTokens token) eid
  LocationTarget lid -> fieldMap LocationTokens (Token.countTokens token) lid
  EnemyTarget eid -> fieldMap EnemyTokens (Token.countTokens token) eid
  AssetTarget aid -> fieldMap AssetTokens (Token.countTokens token) aid
  InvestigatorTarget iid -> fieldMap InvestigatorTokens (Token.countTokens token) iid
  _ -> error "unsupported token fixture target"

chooseAbility :: Sourceable source => source -> Int -> TestAppT ()
chooseAbility source index = chooseOptionMatching "resolve the actual printed ability" \case
  AbilityLabel {ability} -> abilitySource ability == toSource source && abilityIndex ability == index
  _ -> False

assignAttack :: Investigator -> TestAppT ()
assignAttack self = do
  chooseOptionAcrossQuestions "assign the Tender's damage" \case
    ComponentLabel (InvestigatorComponent iid DamageToken) _ -> iid == self.id
    _ -> False
  chooseOptionAcrossQuestions "assign the Tender's horror" \case
    ComponentLabel (InvestigatorComponent iid HorrorToken) _ -> iid == self.id
    _ -> False

assertUntouched :: Investigator -> Enemy -> TestAppT ()
assertUntouched self tender = do
  tender.exhausted `shouldReturn` True
  assertAny $ EnemyWithId tender.id <> EnemyWithKeyword Keyword.Aloof
  self.damage `shouldReturn` 0
  self.horror `shouldReturn` 0

watchAgendaReceipt :: AgendaId -> TestAppT (IORef [(Int, Int)])
watchAgendaReceipt agenda = do
  ref <- liftIO $ newIORef []
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      CheckWindows ws -> for_ ws \case
        Window.Window Timing.After (Window.PlacedDoomCounterOnTargetWithNoDoom _ (AgendaTarget aid) n) _ _
          | aid == agenda -> do
              doom <- runTestApp env $ field AgendaDoom agenda
              modifyIORef' ref (<> [(n, doom)])
        _ -> pure ()
      _ -> pure ()}
  pure ref

watchDoom :: Source -> Target -> TestAppT (IORef [(Timing.Timing, Int)])
watchDoom source target = do
  ref <- liftIO $ newIORef []
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      CheckWindows ws -> for_ ws \case
        Window.Window timing (Window.PlacedDoom source' target' n) _ _
          | source == source' && target == target' -> liftIO $ modifyIORef' ref (<> [(timing, n)])
        _ -> pure ()
      _ -> pure ()}
  pure ref

assertQueueFinished :: TestAppT ()
assertQueueFinished = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
  gameWindowDepth <$> getGame `shouldReturn` 0

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
