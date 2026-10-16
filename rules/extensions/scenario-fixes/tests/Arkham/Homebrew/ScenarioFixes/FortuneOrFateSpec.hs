module Arkham.Homebrew.ScenarioFixes.FortuneOrFateSpec (spec) where

import Arkham.Act (lookupAct)
import Arkham.Act.CardDefs.NightOfTheZealot.TheGathering qualified as Acts
import Arkham.Act.Types (Field (ActTokens))
import Arkham.Agenda.Types (Field (AgendaDoom))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetDoom))
import Arkham.Classes.HasGame (getGame)
import Arkham.Entities qualified as Entities
import Arkham.Enemy.Types (Field (EnemyDoom))
import Arkham.Event.Cards qualified as Events
import Arkham.Event.Types (Field (EventDoom))
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Helpers.Window qualified as Windows
import Arkham.Investigator.Types (Field (InvestigatorDoom))
import Arkham.Location.Types (Field (LocationDoom))
import Arkham.Matcher
import Arkham.Placement (Placement (AttachedToLocation, InThreatArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Timing qualified as Timing
import Arkham.Token qualified as Token
import Arkham.Treachery.CardDefs.TheDrownedCity.Stowaways qualified as Treacheries
import Arkham.Treachery.Types (Field (TreacheryDoom))
import Arkham.Window qualified as Window
import Data.Aeson qualified as Aeson
import TestImport.New

-- Play the physical fast event from the actual doom interrupt. The assertions
-- distinguish prevention from removing pre-existing doom and observe the real
-- post-mutation windows, including agenda's prebuilt receipt and enemy batches.
spec :: Spec
spec = describe "Fortune or Fate prevents exactly one impending doom and exiles" do
  for_ ["act", "agenda", "enemy", "location", "treachery"] \kind -> do
    it ("prevents the first doom on a " <> kind <> " after restoring its paid choice") . gameTest $ \self -> do
      (target, doom) <- doomTarget kind self
      fortune <- prepareFortune self
      exiled <- watchExile fortune
      receipt <- watchDoomReceipt GameSource target Nothing
      firstDoom <- watchFirstDoomReceipt GameSource target
      actions <- self.remainingActions
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 0
      roundTripPendingGame
      chooseTarget fortune
      doom `shouldReturn` 0
      liftIO (readIORef receipt) `shouldReturn` False
      liftIO (readIORef firstDoom) `shouldReturn` False
      assertPaidAndExiled self fortune exiled actions
      assertFinished

    it ("reduces a three-doom placement on a " <> kind <> " to two and publishes the actual amount") . gameTest $ \self -> do
      (target, doom) <- doomTarget kind self
      run $ PlaceDoom GameSource target 2
      fortune <- prepareFortune self
      exiled <- watchExile fortune
      correctReceipt <- watchDoomReceipt GameSource target (Just 2)
      originalReceipt <- watchDoomReceipt GameSource target (Just 3)
      firstDoom <- watchFirstDoomReceipt GameSource target
      actions <- self.remainingActions
      run $ PlaceDoom GameSource target 3
      doom `shouldReturn` 2
      roundTripPendingGame
      chooseTarget fortune
      doom `shouldReturn` 4
      liftIO (readIORef correctReceipt) `shouldReturn` True
      liftIO (readIORef originalReceipt) `shouldReturn` False
      liftIO (readIORef firstDoom) `shouldReturn` False
      assertPaidAndExiled self fortune exiled actions
      assertFinished

    it ("preserves existing doom when canceling the next single doom on a " <> kind) . gameTest $ \self -> do
      (target, doom) <- doomTarget kind self
      run $ PlaceDoom GameSource target 2
      fortune <- prepareFortune self
      exiled <- watchExile fortune
      receipt <- watchDoomReceipt GameSource target Nothing
      actions <- self.remainingActions
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 2
      chooseTarget fortune
      doom `shouldReturn` 2
      liftIO (readIORef receipt) `shouldReturn` False
      assertPaidAndExiled self fortune exiled actions
      assertFinished

  for_ ["asset", "event", "investigator"] \kind ->
    it ("does not offer Fortune for doom on a player " <> kind) . gameTest $ \self -> do
      (target, doom) <- doomTarget kind self
      fortune <- prepareFortune self
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 1
      self.hand `shouldReturn` [fortune]
      self.resources `shouldReturn` 5
      assertFinished

  for_ ["agenda", "enemy"] \kind ->
    it ("keeps later same-source and different-source doom on the " <> kind <> " and enforces max once per game") . gameTest $ \self -> do
      (target, doom) <- doomTarget kind self
      fortune <- prepareFortune self
      secondCopy <- genMyCard self Events.fortuneOrFate2
      withProp @"hand" [fortune, secondCopy] self
      exiled <- watchExile fortune
      unrelatedReceipt <- watchDoomReceipt (toSource self) target (Just 3)
      sameSourceReceipt <- watchDoomReceipt GameSource target (Just 2)
      actions <- self.remainingActions
      if kind == "agenda"
        then do
          -- These future placements are already framed in separate Would
          -- batches, including a later placement with the same source/target.
          -- They must not be rewritten by the current window's cancellation.
          for_ [(toSource self, 3), (GameSource, 2)] \(source, amount) ->
            Windows.wouldDo
              (PlaceDoom source target amount)
              (Window.WouldPlaceDoom source target amount)
              (Window.PlacedDoom source target amount)
          run $ PlaceDoom GameSource target 1
        else runAll
          [ PlaceDoom GameSource target 1
          , PlaceDoom GameSource target 2
          , PlaceDoom (toSource self) target 3
          ]
      roundTripPendingGame
      chooseTarget fortune
      doom `shouldReturn` 5
      liftIO (readIORef unrelatedReceipt) `shouldReturn` True
      liftIO (readIORef sameSourceReceipt) `shouldReturn` True
      self.hand `shouldReturn` [secondCopy]
      assertPaidAndExiled self fortune exiled actions
      assertFinished

  it "can prevent doom on an encounter asset in an investigator's play area" . gameTest $ \self -> do
    aid <- self `putAssetIntoPlay` Assets.theCaptives
    fortune <- prepareFortune self
    exiled <- watchExile fortune
    actions <- self.remainingActions
    run $ PlaceDoom GameSource (toTarget aid) 1
    field AssetDoom aid `shouldReturn` 0
    chooseTarget fortune
    field AssetDoom aid `shouldReturn` 0
    assertPaidAndExiled self fortune exiled actions
    assertFinished

  it "does not offer cancellation for doom paid as a card cost" . gameTest $ \self -> do
    (target, doom) <- doomTarget "agenda" self
    fortune <- prepareFortune self
    costCard <- genMyCard self Assets.arcaneInitiate
    run $ PlaceDoom (CardCostSource $ toCardId costCard) target 1
    doom `shouldReturn` 1
    self.hand `shouldReturn` [fortune]
    self.resources `shouldReturn` 5
    assertFinished

  it "requires the printed two resources before offering the event" . gameTest $ \self -> do
    (target, doom) <- doomTarget "agenda" self
    fortune <- prepareFortune self
    withProp @"resources" 1 self
    run $ PlaceDoom GameSource target 1
    doom `shouldReturn` 1
    self.hand `shouldReturn` [fortune]
    self.resources `shouldReturn` 1
    assertFinished

prepareFortune :: Investigator -> TestAppT Card
prepareFortune self = do
  fortune <- genMyCard self Events.fortuneOrFate2
  withProp @"hand" [fortune] self
  withProp @"resources" 5 self
  pure fortune

doomTarget :: String -> Investigator -> TestAppT (Target, TestAppT Int)
doomTarget kind self = do
  location <- testLocation
  self `moveTo` location
  case kind of
    "act" -> do
      card <- genCard Acts.trapped
      let
        aid = ActId $ toCardCode card
        act = either (error . show) id $ lookupAct aid 1 (toCardId card)
      overTest $ entitiesL . Entities.actsL %~ insertEntity act
      pure (toTarget aid, fieldMap ActTokens (Token.countTokens Token.Doom) aid)
    "agenda" -> do
      agenda <- testAgenda "01105" id
      pure (toTarget agenda, field AgendaDoom agenda.id)
    "enemy" -> do
      enemy <- testEnemy
      enemy `spawnAt` location
      pure (toTarget enemy, field EnemyDoom enemy.id)
    "location" -> pure (toTarget location, field LocationDoom location.id)
    "treachery" -> do
      card <- genCard Treacheries.infected
      (tid, message) <- Helpers.createTreacheryAt card $ InThreatArea self.id
      run message
      pure (toTarget tid, field TreacheryDoom tid)
    "asset" -> do
      aid <- self `putAssetIntoPlay` Assets.flashlight
      pure (toTarget aid, field AssetDoom aid)
    "event" -> do
      card <- genMyCard self Events.openGate
      run $ CreateEventAt self.id card (AttachedToLocation location.id)
      eid <- selectJust $ eventIs Events.openGate
      pure (toTarget eid, field EventDoom eid)
    "investigator" -> pure (toTarget self, field InvestigatorDoom self.id)
    _ -> error $ "unsupported Fortune fixture: " <> kind

watchExile :: Card -> TestAppT (IORef Bool)
watchExile fortune = createMessageChecker \case
  Exiled _ card -> toCardId card == toCardId fortune
  _ -> False

watchDoomReceipt :: Source -> Target -> Maybe Int -> TestAppT (IORef Bool)
watchDoomReceipt source target amount = createMessageChecker \case
  CheckWindows ws -> any matches ws
  _ -> False
 where
  matches (Window.Window Timing.After (Window.PlacedDoom s t n) _ _) =
    s == source && t == target && n > 0 && maybe True (== n) amount
  matches _ = False

watchFirstDoomReceipt :: Source -> Target -> TestAppT (IORef Bool)
watchFirstDoomReceipt source target = createMessageChecker \case
  CheckWindows ws -> any matches ws
  _ -> False
 where
  matches (Window.Window Timing.After (Window.PlacedDoomCounterOnTargetWithNoDoom s t n) _ _) =
    s == source && t == target && n > 0
  matches _ = False

assertPaidAndExiled :: Investigator -> Card -> IORef Bool -> Int -> TestAppT ()
assertPaidAndExiled self fortune exiled actions = do
  self.resources `shouldReturn` 3
  self.remainingActions `shouldReturn` actions
  liftIO (readIORef exiled) `shouldReturn` True
  (map toCardId <$> self.hand) `shouldSatisfyM` notElem (toCardId fortune)
  (map toCardId <$> self.discard) `shouldSatisfyM` notElem (toCardId fortune)
  (map toCardId <$> self.deck) `shouldSatisfyM` notElem (toCardId fortune)
  assertNone $ eventIs Events.fortuneOrFate2

assertFinished :: TestAppT ()
assertFinished = do
  env <- get
  queued <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  queued `shouldBe` []
  gameWindowDepth <$> getGame `shouldReturn` 0

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
