module Arkham.Homebrew.ScenarioFixes.ApiaryTenderSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetDoom))
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.TheDrownedCity.TheApiary qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyDoom))
import Arkham.Event.Cards qualified as Events
import Arkham.Event.Types (Field (EventDoom))
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Investigator.Types (Field (InvestigatorDoom))
import Arkham.Keyword qualified as Keyword
import Arkham.Location.Types (Field (LocationDoom))
import Arkham.Matcher
import Arkham.Placement (Placement (AttachedToLocation, InThreatArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Treachery.CardDefs.TheDrownedCity.Stowaways qualified as Stowaways
import Arkham.Treachery.CardDefs.TheDrownedCity.TheApiary qualified as Apiary
import Arkham.Treachery.Types (Field (TreacheryDoom, TreacheryPlacement))
import Data.Aeson qualified as Aeson
import TestImport.New

-- Apiary Tender (11575) says "a card at this location", without restricting
-- card types. Drive actual token placement and its offered Forced ability.
-- The printed When trigger now finishes its attack before doom is placed.
spec :: Spec
spec = describe "Apiary Tender's doom trigger covers every located card type" do
  for_ ["treachery", "event", "location", "enemy", "asset", "investigator"] \kind ->
    it ("readies and attacks before doom is placed on a local " <> kind) . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      tender <- tenderAt here
      run $ EnemyEngageInvestigator tender.id self.id
      exhaust tender
      (target, doom) <- locatedTarget kind self here tender
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 0
      tender.exhausted `shouldReturn` True
      resolveTender tender
      assertAttack self tender
      doom `shouldReturn` 1
      assertQueueFinished

  for_ ["treachery", "event"] \kind -> do
    it ("ignores doom on a " <> kind <> " at another location") . gameTest $ \self -> do
      here <- testLocation
      elsewhere <- testLocation
      self `moveTo` elsewhere
      tender <- tenderAt here
      exhaust tender
      (target, doom) <- locatedTarget kind self elsewhere tender
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 1
      assertUntouched self tender
      assertQueueFinished

    it ("does not treat two missing locations as a shared location for a " <> kind) . gameTest $ \self -> do
      tender <- printedTender
      unused <- testLocation
      (target, doom) <- case kind of
        "treachery" -> do
          tid <- threatArea self Stowaways.infected
          pure (toTarget tid, field TreacheryDoom tid)
        _ -> do
          card <- genMyCard self Events.openGate
          run $ CreateEventAt self.id card (InThreatArea self.id)
          eid <- selectJust $ eventIs Events.openGate
          pure (toTarget eid, field EventDoom eid)
      -- The unused location makes the fixture nonempty but neither entity is
      -- placed there. No location match is inferred from two Nothing values.
      assertAny $ LocationWithId unused.id
      exhaust tender
      self.location `shouldReturn` Nothing
      tender.location `shouldReturn` Nothing
      run $ PlaceDoom GameSource target 1
      doom `shouldReturn` 1
      assertUntouched self tender
      assertQueueFinished

    it ("does not trigger when zero doom is placed on a local " <> kind) . gameTest $ \self -> do
      here <- testLocation
      self `moveTo` here
      tender <- tenderAt here
      exhaust tender
      (target, doom) <- locatedTarget kind self here tender
      run $ PlaceDoom GameSource target 0
      doom `shouldReturn` 0
      assertUntouched self tender
      assertQueueFinished

  it "does not mistake another token on a local treachery for doom" . gameTest $ \self -> do
    here <- testLocation
    self `moveTo` here
    tender <- tenderAt here
    exhaust tender
    tid <- threatArea self Stowaways.infected
    run $ PlaceTokens GameSource (toTarget tid) #resource 1
    field TreacheryDoom tid `shouldReturn` 0
    assertUntouched self tender
    assertQueueFinished

  it "readies and loses aloof without attacking when its location has no investigator" . gameTest $ \self -> do
    here <- testLocation
    elsewhere <- testLocation
    self `moveTo` elsewhere
    tender <- tenderAt here
    exhaust tender
    (target, doom) <- locatedTarget "event" self here tender
    run $ PlaceDoom GameSource target 2
    resolveTender tender
    doom `shouldReturn` 2
    tender.exhausted `shouldReturn` False
    assertNone $ EnemyWithId tender.id <> EnemyWithKeyword Keyword.Aloof
    self.damage `shouldReturn` 0
    self.horror `shouldReturn` 0
    self.engagedEnemies `shouldReturn` []
    assertQueueFinished

  it "restores the pending trigger from Parasitic Transformation without repeating placement or attack" . gameTest $ \self -> do
    here <- testLocation
    self `moveTo` here
    tender <- tenderAt here
    exhaust tender
    tid <- threatArea self Apiary.parasiticTransformation
    -- Resolve the treachery's real engagement trigger, which places doom on
    -- that same physical card and then offers the Tender's Forced ability.
    run $ EnemyEngageInvestigator tender.id self.id
    chooseAbility (TreacherySource tid) 1
    field TreacheryDoom tid `shouldReturn` 0
    field TreacheryPlacement tid `shouldReturn` InThreatArea self.id
    tender.exhausted `shouldReturn` True
    roundTripPendingGame
    resolveTender tender
    -- Save again at the native damage assignment prompt, preserving the
    -- pending horror assignment and attack completion messages.
    roundTripPendingGame
    assertAttack self tender
    field TreacheryDoom tid `shouldReturn` 1
    select (treacheryIs Apiary.parasiticTransformation) `shouldReturn` [tid]
    assertQueueFinished

printedTender :: TestAppT Enemy
printedTender =
  testEnemyWithDef Enemies.apiaryTender id
    & prop @"healthDamage" 1
    & prop @"sanityDamage" 1

tenderAt :: Location -> TestAppT Enemy
tenderAt location = do
  tender <- printedTender
  tender `spawnAt` location
  pure tender

threatArea :: Investigator -> CardDef -> TestAppT TreacheryId
threatArea host def = do
  card <- genCard def
  (tid, message) <- Helpers.createTreacheryAt card $ InThreatArea host.id
  run message
  pure tid

locatedTarget :: String -> Investigator -> Location -> Enemy -> TestAppT (Target, TestAppT Int)
locatedTarget kind self location tender = case kind of
  "treachery" -> do
    tid <- threatArea self Stowaways.infected
    pure (toTarget tid, field TreacheryDoom tid)
  "event" -> do
    card <- genMyCard self Events.openGate
    run $ CreateEventAt self.id card (AttachedToLocation location.id)
    eid <- selectJust $ eventIs Events.openGate
    pure (toTarget eid, field EventDoom eid)
  "location" -> pure (toTarget location, field LocationDoom location.id)
  "enemy" -> pure (toTarget tender, field EnemyDoom tender.id)
  "asset" -> do
    aid <- self `putAssetIntoPlay` Assets.flashlight
    pure (toTarget aid, field AssetDoom aid)
  "investigator" -> pure (toTarget self, field InvestigatorDoom self.id)
  _ -> error $ "unsupported doom target fixture: " <> kind

resolveTender :: Enemy -> TestAppT ()
resolveTender tender = chooseAbility (toSource tender) 1

chooseAbility :: Source -> Int -> TestAppT ()
chooseAbility source index = chooseOptionMatching "resolve the actual printed Forced ability" \case
  AbilityLabel {ability} -> abilitySource ability == source && abilityIndex ability == index
  _ -> False

assertAttack :: Investigator -> Enemy -> TestAppT ()
assertAttack self tender = do
  chooseOptionAcrossQuestions "assign the Tender's printed damage to the engaged investigator" \case
    ComponentLabel (InvestigatorComponent iid DamageToken) _ -> iid == self.id
    _ -> False
  chooseOptionAcrossQuestions "assign the Tender's printed horror to the engaged investigator" \case
    ComponentLabel (InvestigatorComponent iid HorrorToken) _ -> iid == self.id
    _ -> False
  self.damage `shouldReturn` 1
  self.horror `shouldReturn` 1
  tender.exhausted `shouldReturn` False
  self.engagedEnemies `shouldReturn` [tender.id]
  assertNone $ EnemyWithId tender.id <> EnemyWithKeyword Keyword.Aloof

assertUntouched :: Investigator -> Enemy -> TestAppT ()
assertUntouched self tender = do
  tender.exhausted `shouldReturn` True
  assertAny $ EnemyWithId tender.id <> EnemyWithKeyword Keyword.Aloof
  self.damage `shouldReturn` 0
  self.horror `shouldReturn` 0

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
