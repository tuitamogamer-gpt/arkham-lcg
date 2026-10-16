module Arkham.Homebrew.ScenarioFixes.CoreEncounterActionsSpec (spec) where

import Arkham.Ability (Ability, abilityActions, abilityIndex, abilitySource)
import Arkham.Action qualified as Action
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyDoom))
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.CardDefs.BrethrenOfAsh.SpreadingFlames qualified as Locations
import Arkham.Location.Types (connectedMatchersL, revealedConnectedMatchersL, revealedL, revealedSymbolL, symbolL)
import Arkham.LocationSymbol (LocationSymbol (Square, Triangle))
import Arkham.Matcher
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed 12189 does not exclude Dark Magician itself. Printed 12113 is an
-- Engage action and does not restrict the chosen neighboring enemy to one that
-- is unengaged. Use real round-end windows and paid location actions throughout.
spec :: Spec
spec = do
  describe "Dark Magician's nearest doom-free enemy" do
    it "places doom on itself when it is the only enemy" . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      magician <- spawnMagician location
      triggerMagician magician
      offeredTargets `shouldReturn` [toTarget magician]
      chooseTarget magician
      field EnemyDoom magician.id `shouldReturn` 1

    it "prefers itself to a doom-free enemy at a connecting location" . gameTest $ \self -> do
      (here, adjacent) <- testConnectedLocations id id
      self `moveTo` here
      magician <- spawnMagician here
      distant <- testEnemy
      distant `spawnAt` adjacent
      triggerMagician magician
      offeredTargets `shouldReturn` [toTarget magician]
      chooseTarget magician
      field EnemyDoom magician.id `shouldReturn` 1
      field EnemyDoom distant.id `shouldReturn` 0

    it "offers itself and every other eligible enemy at its location" . gameTest $ \self -> do
      (here, adjacent) <- testConnectedLocations id id
      self `moveTo` here
      magician <- spawnMagician here
      neighbor <- testEnemy
      neighbor `spawnAt` here
      distant <- testEnemy
      distant `spawnAt` adjacent
      triggerMagician magician
      offeredTargets `shouldMatchListM` map toTarget [magician, neighbor]
      chooseTarget neighbor
      field EnemyDoom magician.id `shouldReturn` 0
      field EnemyDoom neighbor.id `shouldReturn` 1
      field EnemyDoom distant.id `shouldReturn` 0

    it "looks farther away when it already has doom" . gameTest $ \self -> do
      (here, adjacent) <- testConnectedLocations id id
      self `moveTo` here
      magician <- spawnMagician here
      distant <- testEnemy
      distant `spawnAt` adjacent
      run $ PlaceDoom GameSource (toTarget magician) 1
      triggerMagician magician
      offeredTargets `shouldReturn` [toTarget distant]
      chooseTarget distant
      field EnemyDoom magician.id `shouldReturn` 1
      field EnemyDoom distant.id `shouldReturn` 1

    it "does not trigger if every enemy already has doom" . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      magician <- spawnMagician here
      run $ PlaceDoom GameSource (toTarget magician) 1
      run EndRoundWindow
      assertQueueEmpty
      field EnemyDoom magician.id `shouldReturn` 1

    it "still places doom on an exhausted Dark Magician" . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      magician <- spawnMagician here
      exhaust magician
      triggerMagician magician
      chooseTarget magician
      field EnemyDoom magician.id `shouldReturn` 1
      magician.exhausted `shouldReturn` True

    it "excludes itself if a native modifier prohibits doom on it" . gameTest $ \self -> do
      (here, adjacent) <- testConnectedLocations id id
      self `moveTo` here
      magician <- spawnMagician here
      distant <- testEnemy
      distant `spawnAt` adjacent
      run =<< gameModifier GameSource magician CannotPlaceDoomOnThis
      triggerMagician magician
      offeredTargets `shouldReturn` [toTarget distant]
      chooseTarget distant
      field EnemyDoom magician.id `shouldReturn` 0
      field EnemyDoom distant.id `shouldReturn` 1

    it "restores the pending nearest-target choice without placing extra doom" . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      magician <- spawnMagician here
      neighbor <- testEnemy
      neighbor `spawnAt` here
      triggerMagician magician
      roundTripPendingGame
      offeredTargets `shouldMatchListM` map toTarget [magician, neighbor]
      chooseTarget magician
      field EnemyDoom magician.id `shouldReturn` 1
      field EnemyDoom neighbor.id `shouldReturn` 0
      assertQueueEmpty

  describe "Your Friend's Room's printed Engage action" do
    it "pulls an enemy engaged with a teammate and pays exactly one action" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      other.engagedEnemies `shouldReturn` [enemy.id]
      duringTurn self do
        [ability] <- roomActions self room
        -- Printed card actions retain native Activate classification as well.
        abilityActions ability `shouldBe` [Action.Activate, Action.Engage]
        self `useAbility` ability
        offeredTargets `shouldReturn` [toTarget enemy]
        chooseTarget enemy
        self.remainingActions `shouldReturn` 2
        enemy.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` [enemy.id]
        other.engagedEnemies `shouldReturn` []
        other.location `shouldReturn` Just adjacent.id

    it "also moves and engages an unengaged neighboring enemy" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        chooseTarget enemy
        enemy.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` [enemy.id]
        self.remainingActions `shouldReturn` 2

    it "does not expose the action to an investigator outside the room" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      self `moveTo` adjacent
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      duringTurn self $ roomActions self room `shouldReturn` []

    it "requires an enemy at a connecting location" . gameTest $ \self -> do
      (room, _) <- friendsRoomFor self
      isolated <- testLocation
      enemy <- testEnemy
      enemy `spawnAt` isolated
      duringTurn self $ roomActions self room `shouldReturn` []

    it "offers both engaged and unengaged neighboring enemies and no remote enemy" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      engaged <- testEnemy
      engaged `spawnAt` adjacent
      unengaged <- testEnemy
      unengaged `spawnAt` adjacent
      exhaust unengaged
      run $ DisengageEnemy other.id unengaged.id
      isolated <- testLocation
      distant <- testEnemy
      distant `spawnAt` isolated
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        offeredTargets `shouldMatchListM` map toTarget [engaged, unengaged]
        chooseTarget engaged
        unengaged.location `shouldReturn` Just adjacent.id
        distant.location `shouldReturn` Just isolated.id
        self.engagedEnemies `shouldReturn` [engaged.id]

    it "does not provoke attacks of opportunity from another engaged enemy" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      threat <- testEnemy & prop @"healthDamage" 1 & prop @"sanityDamage" 1
      threat `spawnAt` room
      neighbor <- testEnemy
      neighbor `spawnAt` adjacent
      attacked <- createMessageChecker \case
        EnemyWillAttack _ -> True
        _ -> False
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        chooseTarget neighbor
        self.remainingActions `shouldReturn` 2
        self.damage `shouldReturn` 0
        self.horror `shouldReturn` 0
        liftIO (readIORef attacked) `shouldReturn` False
        self.engagedEnemies `shouldMatchListM` [threat.id, neighbor.id]

    it "still moves an enemy that cannot be engaged, without engaging it" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      run =<< gameModifier GameSource enemy CannotBeEngaged
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        chooseTarget enemy
        enemy.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` []
        self.remainingActions `shouldReturn` 2

    it "resolves movement without engaging an investigator who cannot be engaged" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      run =<< gameModifier GameSource self CannotBeEngaged
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        roundTripPendingGame
        chooseTarget enemy
        enemy.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` []
        self.remainingActions `shouldReturn` 2

    for_ ["enemy cannot move", "enemy cannot enter this room", "room bars this enemy"] \restriction ->
      it ("does not offer a futile action when " <> restriction) . gameTest $ \self -> do
        (room, adjacent) <- friendsRoomFor self
        enemy <- testEnemy
        enemy `spawnAt` adjacent
        case restriction of
          "enemy cannot move" -> run =<< gameModifier GameSource enemy CannotMove
          "enemy cannot enter this room" -> run =<< gameModifier GameSource enemy (CannotEnter room.id)
          _ -> run =<< gameModifier GameSource room (CannotBeEnteredBy $ EnemyWithId enemy.id)
        duringTurn self do
          roomActions self room `shouldReturn` []
          self.remainingActions `shouldReturn` 3
          enemy.location `shouldReturn` Just adjacent.id

    it "offers the movable neighboring enemy while excluding a destination-blocked neighbor" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      blocked <- testEnemy
      blocked `spawnAt` adjacent
      allowed <- testEnemy
      allowed `spawnAt` adjacent
      run =<< gameModifier GameSource room (CannotBeEnteredBy $ EnemyWithId blocked.id)
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        offeredTargets `shouldReturn` [toTarget allowed]
        chooseTarget allowed
        blocked.location `shouldReturn` Just adjacent.id
        allowed.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` [allowed.id]
        self.remainingActions `shouldReturn` 2

    it "restores an already-paid target choice without a second action payment" . gameTest $ \self -> do
      (room, adjacent) <- friendsRoomFor self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` adjacent
      enemy <- testEnemy
      enemy `spawnAt` adjacent
      duringTurn self do
        [ability] <- roomActions self room
        self `useAbility` ability
        self.remainingActions `shouldReturn` 2
        roundTripPendingGame
        offeredTargets `shouldReturn` [toTarget enemy]
        chooseTarget enemy
        self.remainingActions `shouldReturn` 2
        enemy.location `shouldReturn` Just room.id
        self.engagedEnemies `shouldReturn` [enemy.id]
        other.engagedEnemies `shouldReturn` []

spawnMagician :: Location -> TestAppT Enemy
spawnMagician location = do
  enemy <- testEnemyWithDef Enemies.darkMagician id
  enemy `spawnAt` location
  pure enemy

triggerMagician :: Enemy -> TestAppT ()
triggerMagician magician = do
  run EndRoundWindow
  chooseOptionMatching "Dark Magician's real round-end Forced ability" \case
    AbilityLabel {ability} -> abilitySource ability == toSource magician && abilityIndex ability == 1
    _ -> False

friendsRoomFor :: Investigator -> TestAppT (Location, Location)
friendsRoomFor self = do
  room <- testLocationWithDef Locations.yourFriendsRoom
    ((revealedL .~ True) . (symbolL .~ Square) . (revealedSymbolL .~ Square)
      . (connectedMatchersL .~ [LocationWithSymbol Triangle])
      . (revealedConnectedMatchersL .~ [LocationWithSymbol Triangle]))
  adjacent <- testLocationWith
    ((symbolL .~ Triangle) . (revealedSymbolL .~ Triangle)
      . (connectedMatchersL .~ [LocationWithSymbol Square])
      . (revealedConnectedMatchersL .~ [LocationWithSymbol Square]))
  self `moveTo` room
  pure (room, adjacent)

roomActions :: Investigator -> Location -> TestAppT [Ability]
roomActions self room = filter ((== 1) . abilityIndex) <$> self `getActionsFrom` room

offeredTargets :: TestAppT [Target]
offeredTargets = do
  questionMap <- gameQuestion <$> getGame
  choices <- case map (stripQuestionWrappers . snd) (mapToList questionMap) of
    [ChooseOne xs] -> pure xs
    other -> expectationFailure ("expected native target choice: " <> show other) >> pure []
  for choices \case
    TargetLabel target _ -> pure target
    other -> expectationFailure ("expected target: " <> show other) >> pure ScenarioTarget

assertQueueEmpty :: TestAppT ()
assertQueueEmpty = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []

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
