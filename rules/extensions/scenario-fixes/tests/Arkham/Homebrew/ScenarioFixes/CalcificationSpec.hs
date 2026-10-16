module Arkham.Homebrew.ScenarioFixes.CalcificationSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Constants (pattern AbilityMove)
import Arkham.Helpers.History
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Matcher
import Arkham.Movement
import Arkham.Placement
import Arkham.Phase (Phase (UpkeepPhase))
import Arkham.Queue (queueToRef)
import Arkham.Treachery.CardDefs.TheFeastOfHemlockVale.HorrorsInTheRock qualified as Treacheries
import Arkham.Treachery.Types (Field (TreacheryPlacement))
import Arkham.Projection
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed 10723 counts the first move, regardless of whether it costs an action.
spec :: Spec
spec = describe "Calcification counts actual movement across the whole round" do
  it "damages the first basic move and charges exactly its normal action" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    tid <- revealCalcification self
    duringTurn self do
      paidMove self there
      self.location `shouldReturn` Just here.id
      resolveCalcification tid
      self.damage `shouldReturn` 1
      self.location `shouldReturn` Just there.id
      self.remainingActions `shouldReturn` 2
      moved self `shouldReturn` 1

  it "damages a real Pathfinder fast move without spending an action" . gameTest $ \self -> do
    (_, there) <- locationsFor self
    tid <- revealCalcification self
    pathfinder <- self `putAssetIntoPlay` Assets.pathfinder1
    duringTurn self do
      [ability] <- self `getActionsFrom` pathfinder
      self `useAbility` ability
      chooseTarget there
      resolveCalcification tid
      pathfinder.exhausted `shouldReturn` True
      self.damage `shouldReturn` 1
      self.remainingActions `shouldReturn` 3
      self.location `shouldReturn` Just there.id

  it "damages forced movement outside the investigator's turn" . gameTest $ \self -> do
    (_, there) <- locationsFor self
    tid <- revealCalcification self
    movement <- move GameSource self.id there.id
    run $ Move movement {moveForced = True}
    resolveCalcification tid
    self.damage `shouldReturn` 1
    self.remainingActions `shouldReturn` 3
    self.location `shouldReturn` Just there.id
    assertFinished

  it "does not charge damage again for the next basic move after a fast move" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    tid <- revealCalcification self
    pathfinder <- self `putAssetIntoPlay` Assets.pathfinder1
    duringTurn self do
      [ability] <- self `getActionsFrom` pathfinder
      self `useAbility` ability
      chooseTarget there
      resolveCalcification tid
      paidMove self here
      self.damage `shouldReturn` 1
      self.location `shouldReturn` Just here.id
      self.remainingActions `shouldReturn` 2
      moved self `shouldReturn` 2

  it "remembers movement that occurred before the treachery was drawn" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    self `moveTo` there
    tid <- revealCalcification self
    self `moveTo` here
    self.damage `shouldReturn` 0
    field TreacheryPlacement tid `shouldReturn` InThreatArea self.id
    moved self `shouldReturn` 2
    assertFinished

  it "does not treat a different investigator's move as the host's first move" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    helper <- addInvestigator Investigators.rolandBanks
    run $ PlaceInvestigator helper.id (AtLocation here.id)
    tid <- revealCalcification self
    helper `moveTo` there
    helper.damage `shouldReturn` 0
    self.damage `shouldReturn` 0
    self `moveTo` there
    resolveCalcification tid
    self.damage `shouldReturn` 1
    helper.damage `shouldReturn` 0
    assertFinished

  it "keeps the movement damage direct even with a damage-soaking asset" . gameTest $ \self -> do
    (_, there) <- locationsFor self
    coat <- self `putAssetIntoPlay` Assets.leatherCoat
    tid <- revealCalcification self
    self `moveTo` there
    choosePrinted tid 1
    assertDamageIsDirect
    applyAllDamage
    self.damage `shouldReturn` 1
    coat.damage `shouldReturn` 0
    self.location `shouldReturn` Just there.id
    assertFinished

  it "does not punish a canceled move or consume the later first move" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    tid <- revealCalcification self
    canceled <- move GameSource self.id there.id
    run =<< gameModifier GameSource self (CancelMovement canceled.id)
    run $ Move canceled
    self.location `shouldReturn` Just here.id
    self.damage `shouldReturn` 0
    moved self `shouldReturn` 0
    self `moveTo` there
    resolveCalcification tid
    self.damage `shouldReturn` 1
    moved self `shouldReturn` 1
    assertFinished

  it "resets the first-move damage after the native round transition" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    tid <- revealCalcification self
    self `moveTo` there
    resolveCalcification tid
    -- Resolve the real upkeep end: it transfers phase history, then the
    -- round boundary clears it before the next mythos phase.
    overTest $ phaseL .~ UpkeepPhase
    run $ Do EndUpkeep
    moved self `shouldReturn` 0
    self `moveTo` here
    resolveCalcification tid
    self.damage `shouldReturn` 2
    self.location `shouldReturn` Just here.id

  it "restores both the pending trigger and completed-movement history" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    tid <- revealCalcification self
    self `moveTo` there
    roundTripPendingGame
    choosePrinted tid 1
    roundTripPendingGame
    assertDamageIsDirect
    applyAllDamage
    roundTripPendingGame
    self `moveTo` here
    self.damage `shouldReturn` 1
    moved self `shouldReturn` 2
    field TreacheryPlacement tid `shouldReturn` InThreatArea self.id
    assertFinished

  it "leaves the printed removal action available after the host has moved" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    self `moveTo` there
    tid <- revealCalcification self
    withProp @"agility" 5 self
    setChaosTokens [Zero]
    duringTurn self do
      [ability] <- self `getActionsFrom` tid
      abilityIndex ability `shouldBe` 2
      self `useAbility` ability
      clickLabel "$label.skip"
      startSkillTest
      applyResults
      assertNone $ TreacheryWithId tid
      self.damage `shouldReturn` 0
      self.remainingActions `shouldReturn` 2
      self.location `shouldReturn` Just there.id
      assertAny $ LocationWithId here.id

  it "tracks two physical copies independently for their respective hosts" . gameTest $ \self -> do
    (here, there) <- locationsFor self
    helper <- addInvestigator Investigators.rolandBanks
    run $ PlaceInvestigator helper.id (AtLocation here.id)
    first <- revealCalcification self
    second <- revealCalcification helper
    self `moveTo` there
    resolveCalcification first
    helper `moveTo` there
    resolveCalcification second
    self.damage `shouldReturn` 1
    helper.damage `shouldReturn` 1
    field TreacheryPlacement first `shouldReturn` InThreatArea self.id
    field TreacheryPlacement second `shouldReturn` InThreatArea helper.id
    first `shouldNotBe` second
    assertFinished

locationsFor :: Investigator -> TestAppT (Location, Location)
locationsFor self = do
  (here, there) <- testConnectedLocations id id
  -- Initial placement is setup, not an actual move in this round.
  run $ PlaceInvestigator self.id (AtLocation here.id)
  moved self `shouldReturn` 0
  pure (here, there)

revealCalcification :: Investigator -> TestAppT TreacheryId
revealCalcification self = do
  card <- genCard Treacheries.calcification
  (tid, message) <- Helpers.createTreacheryAt card Limbo
  run message
  run $ Revelation self.id (TreacherySource tid)
  field TreacheryPlacement tid `shouldReturn` InThreatArea self.id
  pure tid

paidMove :: Investigator -> Location -> TestAppT ()
paidMove self destination = do
  choices <- self `getActionsFrom` destination
  [ability] <- pure $ filter ((== AbilityMove) . abilityIndex) choices
  self `useAbility` ability

moved :: Investigator -> TestAppT Int
moved self = getHistoryField RoundHistory self.id HistoryMoved

choosePrinted :: TreacheryId -> Int -> TestAppT ()
choosePrinted tid index = chooseOptionMatching "resolve Calcification's printed ability" \case
  AbilityLabel {ability} -> abilitySource ability == TreacherySource tid && abilityIndex ability == index
  _ -> False

resolveCalcification :: TreacheryId -> TestAppT ()
resolveCalcification tid = do
  choosePrinted tid 1
  assertDamageIsDirect
  applyAllDamage

assertFinished :: TestAppT ()
assertFinished = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
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
