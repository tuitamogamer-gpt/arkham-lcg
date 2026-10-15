module Arkham.Homebrew.ScenarioFixes.StElmosFireSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Classes.HasGame (getGame)
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.Types (connectedMatchersL, revealedConnectedMatchersL, revealedSymbolL, symbolL)
import Arkham.LocationSymbol (LocationSymbol (Square, Triangle))
import Arkham.Matcher
import Arkham.Placement (Placement (AttachedToLocation))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Treachery.CardDefs.TheDrownedCity.ObsidianCanyons qualified as Treacheries
import Arkham.Treachery.Types (Field (TreacheryPlacement))
import Data.Aeson qualified as Aeson
import TestImport.New

-- Card 11665 restricts its revelation attachment to a location without another
-- copy, but its round-end movement has no such restriction. Drive the native
-- EndRoundWindow and select the real printed Forced ability. Where two copies
-- are present, inspect the first copy's resolved movement before answering the
-- second copy's separate, still-pending Forced ability.
spec :: Spec
spec = describe "St. Elmo's Fire's distinct attachment rules" do
  it "still reveals onto the nearest location without another copy"
    . gameTest $ \self -> do
      (origin, left, right) <- star
      self `moveTo` origin
      first <- attachFire origin
      revealed <- genEncounterCard Treacheries.stElmosFire
      run $ SetEncounterDeck $ Deck [revealed]
      run $ drawEncounterCard self.id GameSource
      offeredTargets `shouldMatchListM` map toTarget [left, right]
      chooseTarget right
      second <- selectJust $ treacheryIs Treacheries.stElmosFire <> not_ (TreacheryWithId first)
      fireAt first origin
      fireAt second right
      selectCount (treacheryIs Treacheries.stElmosFire) `shouldReturn` 2

  it "prefers an occupied adjacent location even when another Fire is attached there"
    . gameTest $ \self -> do
      (origin, occupied, _) <- star
      self `moveTo` occupied
      moving <- attachFire origin
      existing <- attachFire occupied
      triggerFire moving
      fireAt moving occupied
      fireAt existing occupied
      self.damage `shouldReturn` 0
      selectCount (treacheryIs Treacheries.stElmosFire) `shouldReturn` 2

  it "allows an empty adjacent location with another Fire when no neighbor has investigators"
    . gameTest $ \self -> do
      (origin, withFire, empty) <- star
      remote <- testLocation
      self `moveTo` remote
      moving <- attachFire origin
      existing <- attachFire withFire
      triggerFire moving
      offeredTargets `shouldMatchListM` map toTarget [withFire, empty]
      chooseTarget withFire
      fireAt moving withFire
      fireAt existing withFire

  it "moves to an empty neighbor instead of staying at its occupied current location"
    . gameTest $ \self -> do
      (origin, neighbor) <- testConnectedLocations id id
      self `moveTo` origin
      fire <- attachFire origin
      triggerFire fire
      -- Damage resolves at the old location, before attachment changes.
      fireAt fire origin
      self.damage `shouldReturn` 0
      applyAllDamage
      self.damage `shouldReturn` 1
      fireAt fire neighbor

  it "damages the original location before moving without damaging the destination"
    . gameTest $ \self -> do
      (origin, destination, _) <- star
      self `moveTo` origin
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` destination
      fire <- attachFire origin
      triggerFire fire
      fireAt fire origin
      self.damage `shouldReturn` 0
      other.damage `shouldReturn` 0
      applyAllDamage
      self.damage `shouldReturn` 1
      other.damage `shouldReturn` 0
      fireAt fire destination

  it "deals damage but stays put when there is no adjacent location"
    . gameTest $ \self -> do
      isolated <- testLocation
      self `moveTo` isolated
      fire <- attachFire isolated
      triggerFire fire
      applyAllDamage
      self.damage `shouldReturn` 1
      fireAt fire isolated
      env <- get
      queued <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
      queued `shouldBe` []
      gameWindowDepth <$> getGame `shouldReturn` 0

  it "offers every occupied neighbor, including a location already bearing Fire"
    . gameTest $ \self -> do
      (origin, left, right) <- star
      self `moveTo` left
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` right
      moving <- attachFire origin
      existing <- attachFire left
      triggerFire moving
      offeredTargets `shouldMatchListM` map toTarget [left, right]
      chooseTarget right
      fireAt moving right
      fireAt existing left
      self.damage `shouldReturn` 0
      other.damage `shouldReturn` 0

  it "restores a pending destination choice without duplicating the physical treachery"
    . gameTest $ \self -> do
      (origin, left, right) <- star
      remote <- testLocation
      self `moveTo` remote
      fire <- attachFire origin
      triggerFire fire
      fireAt fire origin
      offeredTargets `shouldMatchListM` map toTarget [left, right]
      roundTripPendingGame
      offeredTargets `shouldMatchListM` map toTarget [left, right]
      chooseTarget right
      fireAt fire right
      select (treacheryIs Treacheries.stElmosFire) `shouldReturn` [fire]
      self.damage `shouldReturn` 0

-- Symmetric three-location graph: both triangular leaves connect to the square
-- center and the center connects to both leaves. The leaves do not connect to
-- each other, making adjacency and nearest-location assertions unambiguous.
star :: TestAppT (Location, Location, Location)
star = do
  (origin, left) <- testConnectedLocations id id
  right <- testLocationWith
    ( (symbolL .~ Triangle)
        . (revealedSymbolL .~ Triangle)
        . (connectedMatchersL .~ [LocationWithSymbol Square])
        . (revealedConnectedMatchersL .~ [LocationWithSymbol Square])
    )
  pure (origin, left, right)

attachFire :: Location -> TestAppT TreacheryId
attachFire location = do
  card <- genCard Treacheries.stElmosFire
  (tid, message) <- Helpers.createTreacheryAt card $ AttachedToLocation location.id
  run message
  pure tid

fireAt :: TreacheryId -> Location -> TestAppT ()
fireAt fire location = field TreacheryPlacement fire `shouldReturn` AttachedToLocation location.id

triggerFire :: TreacheryId -> TestAppT ()
triggerFire fire = do
  run EndRoundWindow
  chooseOptionMatching "resolve this Fire's actual round-end Forced ability" \case
    AbilityLabel {ability} ->
      abilitySource ability == TreacherySource fire && abilityIndex ability == 1
    _ -> False

offeredTargets :: TestAppT [Target]
offeredTargets = do
  questionMap <- gameQuestion <$> getGame
  choices <- case map (stripQuestionWrappers . snd) (mapToList questionMap) of
    [ChooseOne xs] -> pure xs
    other -> do
      expectationFailure $ "expected a native location choice, got: " <> show other
      pure []
  for choices \case
    TargetLabel target _ -> pure target
    other -> do
      expectationFailure $ "expected a location target, got: " <> show other
      pure ScenarioTarget

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
