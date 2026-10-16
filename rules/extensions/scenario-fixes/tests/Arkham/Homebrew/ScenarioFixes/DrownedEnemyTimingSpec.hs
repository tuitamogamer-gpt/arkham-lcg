module Arkham.Homebrew.ScenarioFixes.DrownedEnemyTimingSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.TheDrownedCity.CourtOfTheAncients qualified as Court
import Arkham.Enemy.CardDefs.TheDrownedCity.TheGrandVault qualified as Vault
import Arkham.Enemy.CardDefs.TheDrownedCity.UnderseaCreatures qualified as Undersea
import Arkham.Enemy.Types (Enemy)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.CardDefs.TheDrownedCity.TheGrandVault qualified as Locations
import Arkham.Location.FloodLevel (FloodLevel (..))
import Arkham.Location.Grid (Pos (..))
import Arkham.Location.Types (LocationAttrs (..))
import Arkham.Matcher
import Arkham.Phase (Phase (..))
import Arkham.Placement (Placement (AtLocation))
import Arkham.Queue (queueToRef)
import Arkham.Window qualified as Window
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed cards 11733, 11635, and 11605. All triggers run through their
-- actual native phase windows; movement runs through the native path resolver.
spec :: Spec
spec = do
  describe "Voltaic Eel's enemy-phase-only flooded connections" do
    it "crosses disconnected fully flooded locations during enemy-phase movement" . gameTest $ \self -> do
      (eel, _, destination) <- disconnectedEel self FullyFlooded FullyFlooded
      run $ SetPhase EnemyPhase
      moveToward eel destination
      chooseTarget destination
      eel.location `shouldReturn` Just destination.id
      self.engagedEnemies `shouldReturn` [eel.id]
      assertQueueFinished

    for_ [InvestigationPhase, MythosPhase, UpkeepPhase] \phase ->
      it ("cannot use that shortcut during " <> show phase) . gameTest $ \self -> do
        (eel, origin, destination) <- disconnectedEel self FullyFlooded FullyFlooded
        run $ SetPhase phase
        moveToward eel destination
        eel.location `shouldReturn` Just origin.id
        self.engagedEnemies `shouldReturn` []
        assertQueueFinished

    for_ [(PartiallyFlooded, FullyFlooded), (FullyFlooded, PartiallyFlooded)] \(fromFlood, toFlood) ->
      it ("requires both endpoints to be fully flooded: " <> show (fromFlood, toFlood)) . gameTest $ \self -> do
        (eel, origin, destination) <- disconnectedEel self fromFlood toFlood
        run $ SetPhase EnemyPhase
        moveToward eel destination
        eel.location `shouldReturn` Just origin.id
        self.engagedEnemies `shouldReturn` []
        assertQueueFinished

    it "still follows an ordinary connection outside the enemy phase" . gameTest $ \self -> do
      (origin, destination) <- testConnectedLocations id id
      self `moveTo` destination
      eel <- testEnemyWithDef Undersea.voltaicEel id
      eel `spawnAt` origin
      run $ SetPhase InvestigationPhase
      moveToward eel destination
      chooseTarget destination
      eel.location `shouldReturn` Just destination.id
      assertQueueFinished

    it "restores a pending enemy-phase destination without creating a second enemy" . gameTest $ \self -> do
      (eel, origin, destination) <- disconnectedEel self FullyFlooded FullyFlooded
      run $ SetPhase EnemyPhase
      moveToward eel destination
      eel.location `shouldReturn` Just origin.id
      roundTripPendingGame
      chooseTarget destination
      eel.location `shouldReturn` Just destination.id
      select (enemyIs Undersea.voltaicEel) `shouldReturn` [eel.id]
      assertQueueFinished

  describe "Colossal Tyrant's grid-adjacent horror" do
    it "harms an investigator at an adjacent unconnected location" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      adjacent <- gridLocation (Pos 1 0)
      self `moveTo` adjacent
      tyrant <- tyrantAt origin
      triggerTyrant tyrant
      assertHorrorIsDirect
      applyAllHorror
      self.horror `shouldReturn` 1
      assertQueueFinished

    it "harms a sanity-bearing asset at an adjacent unconnected location without any investigator there" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      adjacent <- gridLocation (Pos 0 1)
      remote <- gridLocation (Pos 4 4)
      self `moveTo` remote
      ally <- self `putAssetIntoPlay` Assets.beatCop
      run $ PlaceAsset ally (AtLocation adjacent.id)
      tyrant <- tyrantAt origin
      triggerTyrant tyrant
      ally.horror `shouldReturn` 1
      self.horror `shouldReturn` 0
      assertQueueFinished

    it "does not damage a connected location that is not grid-adjacent" . gameTest $ \self -> do
      (origin, remote) <- testConnectedLocations (atPosition $ Pos 0 0) (atPosition $ Pos 3 0)
      self `moveTo` remote
      tyrant <- tyrantAt origin
      triggerTyrant tyrant
      self.horror `shouldReturn` 0
      assertQueueFinished

    it "excludes diagonal locations" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      diagonal <- gridLocation (Pos 1 1)
      self `moveTo` diagonal
      tyrant <- tyrantAt origin
      triggerTyrant tyrant
      self.horror `shouldReturn` 0
      assertQueueFinished

    it "does not trigger when an investigator shares the Tyrant's location" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      adjacent <- gridLocation (Pos 1 0)
      self `moveTo` origin
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      _ <- tyrantAt origin
      enemyPhaseEnds
      self.horror `shouldReturn` 0
      other.horror `shouldReturn` 0
      assertQueueFinished

    it "damages both the investigator and each sanity-bearing asset without allowing normal soak" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      adjacent <- gridLocation (Pos (-1) 0)
      self `moveTo` adjacent
      ally <- self `putAssetIntoPlay` Assets.beatCop
      item <- self `putAssetIntoPlay` Assets.flashlight
      tyrant <- tyrantAt origin
      triggerTyrant tyrant
      assertHorrorIsDirect
      applyAllHorror
      self.horror `shouldReturn` 1
      ally.horror `shouldReturn` 1
      item.horror `shouldReturn` 0
      assertQueueFinished

    it "restores the pending Forced ability and resolves each adjacent investigator once" . gameTest $ \self -> do
      origin <- gridLocation (Pos 0 0)
      left <- gridLocation (Pos (-1) 0)
      right <- gridLocation (Pos 1 0)
      self `moveTo` left
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` right
      tyrant <- tyrantAt origin
      enemyPhaseEnds
      roundTripPendingGame
      chooseAbility tyrant
      applyAllHorror
      self.horror `shouldReturn` 1
      other.horror `shouldReturn` 1
      select (enemyIs Court.colossalTyrant) `shouldReturn` [tyrant.id]
      assertQueueFinished

  describe "Slitherer in Darkness chooses one lowest-combat investigator" do
    it "attacks only the lower-combat investigator at a connecting location" . gameTest $ \self -> do
      (slitherer, _, adjacent) <- slithererPair self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      withProp @"combat" 2 self
      withProp @"combat" 4 other
      triggerSlitherer slitherer
      chooseTarget slitherer
      assignSlithererDamage self
      self.damage `shouldReturn` 1
      other.damage `shouldReturn` 0
      assertQueueFinished

    for_ [False, True] \pickOther ->
      it ("lets the lead choose exactly one tied investigator, other=" <> show pickOther) . gameTest $ \self -> do
        (slitherer, origin, adjacent) <- slithererPair self
        other <- addInvestigator Investigators.rolandBanks
        other `moveTo` adjacent
        withProp @"combat" 3 self
        withProp @"combat" 3 other
        triggerSlitherer slitherer
        let chosen = if pickOther then other else self
        chooseTarget chosen
        chooseTarget slitherer
        assignSlithererDamage chosen
        self.damage `shouldReturn` if pickOther then 0 else 1
        other.damage `shouldReturn` if pickOther then 1 else 0
        slitherer.location `shouldReturn` Just origin.id
        assertQueueFinished

    it "does not offer its phase ability when its own location is occupied" . gameTest $ \self -> do
      (slitherer, origin, _) <- slithererPair self
      self `moveTo` origin
      enemyPhaseBegins
      self.damage `shouldReturn` 0
      slitherer.location `shouldReturn` Just origin.id
      assertQueueFinished

    it "keeps the no-connecting-investigator fallback to the flooded location nearest the Moving Platform" . gameTest $ \self -> do
      origin <- testLocation
      (platform, nearest) <- testConnectedLocationsWithDef
        (Locations.movingPlatformObservationStation, id)
        (defaultTestLocation, id)
      remote <- testLocation
      self `moveTo` remote
      run $ SetFloodLevel origin.id FullyFlooded
      run $ SetFloodLevel nearest.id FullyFlooded
      -- The printed platform cannot be flooded. The destination is its
      -- neighboring flooded location; the starting flooded location is remote.
      assertNone $ LocationWithId platform.id <> FloodedLocation
      assertAny $ LocationWithId nearest.id <> FullyFloodedLocation
      slitherer <- slithererAt origin
      triggerSlitherer slitherer
      slitherer.location `shouldReturn` Just nearest.id
      self.damage `shouldReturn` 0
      assertQueueFinished

    it "restores the tied target choice and pending attack without hitting both investigators" . gameTest $ \self -> do
      (slitherer, _, adjacent) <- slithererPair self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      withProp @"combat" 2 self
      withProp @"combat" 2 other
      triggerSlitherer slitherer
      roundTripPendingGame
      chooseTarget other
      roundTripPendingGame
      chooseTarget slitherer
      roundTripPendingGame
      assignSlithererDamage other
      self.damage `shouldReturn` 0
      other.damage `shouldReturn` 1
      select (enemyIs Vault.slithererInDarkness) `shouldReturn` [slitherer.id]
      assertQueueFinished

disconnectedEel :: Investigator -> FloodLevel -> FloodLevel -> TestAppT (Enemy, Location, Location)
disconnectedEel self fromFlood toFlood = do
  (origin, destination) <- testUnconnectedLocations id id
  self `moveTo` destination
  run $ SetFloodLevel origin.id fromFlood
  run $ SetFloodLevel destination.id toFlood
  eel <- testEnemyWithDef Undersea.voltaicEel id
  eel `spawnAt` origin
  pure (eel, origin, destination)

moveToward :: Enemy -> Location -> TestAppT ()
moveToward enemy destination = run $ MoveToward (toTarget enemy) (LocationWithId destination.id)

atPosition :: Pos -> LocationAttrs -> LocationAttrs
atPosition position attrs = attrs {locationPosition = Just position}

gridLocation :: Pos -> TestAppT Location
gridLocation = testLocationWith . atPosition

tyrantAt :: Location -> TestAppT Enemy
tyrantAt location = do
  tyrant <- testEnemyWithDef Court.colossalTyrant id
  tyrant `spawnAt` location
  pure tyrant

slithererAt :: Location -> TestAppT Enemy
slithererAt location = do
  slitherer <- testEnemyWithDef Vault.slithererInDarkness id & prop @"healthDamage" 1
  slitherer `spawnAt` location
  pure slitherer

slithererPair :: Investigator -> TestAppT (Enemy, Location, Location)
slithererPair self = do
  (origin, adjacent) <- testConnectedLocations id id
  self `moveTo` adjacent
  run $ SetFloodLevel origin.id FullyFlooded
  slitherer <- slithererAt origin
  pure (slitherer, origin, adjacent)

enemyPhaseBegins :: TestAppT ()
enemyPhaseBegins = do
  run $ SetPhase EnemyPhase
  run $ CheckWindows [Window.mkWhen $ Window.PhaseBegins EnemyPhase]

enemyPhaseEnds :: TestAppT ()
enemyPhaseEnds = do
  run $ SetPhase EnemyPhase
  run $ CheckWindows [Window.mkWhen $ Window.PhaseEnds EnemyPhase]

triggerTyrant :: Enemy -> TestAppT ()
triggerTyrant enemy = enemyPhaseEnds >> chooseAbility enemy

triggerSlitherer :: Enemy -> TestAppT ()
triggerSlitherer enemy = enemyPhaseBegins >> chooseAbility enemy

chooseAbility :: Enemy -> TestAppT ()
chooseAbility enemy = chooseOptionMatching "resolve the actual printed Forced ability" \case
  AbilityLabel {ability} -> abilitySource ability == toSource enemy && abilityIndex ability == 1
  _ -> False

assignSlithererDamage :: Investigator -> TestAppT ()
assignSlithererDamage investigator =
  chooseOptionAcrossQuestions "assign the actual Slitherer attack to its selected investigator" \case
    ComponentLabel (InvestigatorComponent iid DamageToken) _ -> iid == investigator.id
    _ -> False

assertQueueFinished :: TestAppT ()
assertQueueFinished = do
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
