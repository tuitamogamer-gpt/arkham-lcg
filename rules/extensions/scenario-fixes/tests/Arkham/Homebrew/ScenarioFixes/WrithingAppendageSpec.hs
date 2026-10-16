module Arkham.Homebrew.ScenarioFixes.WrithingAppendageSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource)
import Arkham.Classes.HasGame (getGame)
import Arkham.DamageEffect (DamageAssignment (..), nonAttack)
import Arkham.Enemy.CardDefs.CarnevaleOfHorrors qualified as Enemies
import Arkham.Enemy.Types (Enemy, Field (EnemyCard))
import Arkham.Helpers.Scenario (getEncounterDiscard)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Matcher
import Arkham.Placement
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (RegularEncounterDeck))
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed 82030: this encounter enemy's Forced ability deals the damage.
-- The investigator who resolves the prompt is not the damage's source.
spec :: Spec
spec = describe "Writhing Appendage retains encounter attribution on its defeat damage" do
  it "deals exactly one damage to the physical Cnidathqua when actually defeated" . gameTest $ \self -> do
    (appendage, boss) <- encounter self
    card <- field EnemyCard appendage.id
    bossCard <- field EnemyCard boss.id
    receipt <- observesBossDamage appendage boss
    defeatAppendage appendage
    resolveAppendage appendage
    receipt `refShouldBe` True
    boss.damage `shouldReturn` 1
    field EnemyCard boss.id `shouldReturn` bossCard
    assertDiscarded appendage card
    assertFinished

  it "finishes its defeat harmlessly when Cnidathqua is absent" . gameTest $ \self -> do
    here <- testLocation
    run $ PlaceInvestigator self.id (AtLocation here.id)
    appendage <- printedAppendage here
    card <- field EnemyCard appendage.id
    defeatAppendage appendage
    resolveAppendage appendage
    assertDiscarded appendage card
    self.damage `shouldReturn` 0
    assertFinished

  it "does not damage Cnidathqua for nonlethal damage to the appendage" . gameTest $ \self -> do
    (appendage, boss) <- encounter self
    run $ DealDamage (toTarget appendage) (nonAttack Nothing GameSource 1)
    appendage.damage `shouldReturn` 1
    boss.damage `shouldReturn` 0
    assertAny $ EnemyWithId appendage.id
    assertFinished

  it "does not treat discarding an appendage as defeating it" . gameTest $ \self -> do
    (appendage, boss) <- encounter self
    card <- field EnemyCard appendage.id
    discard appendage
    boss.damage `shouldReturn` 0
    assertDiscarded appendage card
    assertFinished

  it "resolves two separately defeated physical appendages exactly once each" . gameTest $ \self -> do
    (first, boss) <- encounter self
    here <- selectJust $ locationWithInvestigator self.id
    second <- testEnemyWithDef Enemies.writhingAppendage id
    run $ EnemySpawnAtLocationMatching Nothing (LocationWithId here) second.id
    firstCard <- field EnemyCard first.id
    secondCard <- field EnemyCard second.id
    defeatAppendage first
    resolveAppendage first
    boss.damage `shouldReturn` 1
    defeatAppendage second
    resolveAppendage second
    boss.damage `shouldReturn` 2
    assertDiscarded first firstCard
    assertDiscarded second secondCard
    firstCard `shouldNotBe` secondCard
    assertFinished

  it "does not apply the resolving investigator's extra damage modifier" . gameTest $ \self -> do
    (appendage, boss) <- encounter self
    run =<< gameModifier GameSource self (DamageDealt 2)
    defeatAppendage appendage
    resolveAppendage appendage
    boss.damage `shouldReturn` 1
    assertFinished

  it "does not offer parallel Zoey credit for the encounter enemy's damage"
    . gameTestWith Investigators.zoeySamarasParallel $ \self -> do
      (appendage, boss) <- encounter self
      receipt <- observesBossDamage appendage boss
      defeatAppendage appendage
      resolveAppendage appendage
      receipt `refShouldBe` True
      boss.damage `shouldReturn` 1
      assertNoReactionOf self
      assertFinished

  it "restores a pending physical defeat before resolving the same damage source" . gameTest $ \self -> do
    (appendage, boss) <- encounter self
    card <- field EnemyCard appendage.id
    receipt <- observesBossDamage appendage boss
    defeatAppendage appendage
    roundTripPendingGame
    resolveAppendage appendage
    roundTripPendingGame
    receipt `refShouldBe` True
    boss.damage `shouldReturn` 1
    assertDiscarded appendage card
    assertFinished

encounter :: Investigator -> TestAppT (Enemy, Enemy)
encounter self = do
  here <- testLocation
  elsewhere <- testLocation
  run $ PlaceInvestigator self.id (AtLocation here.id)
  appendage <- printedAppendage here
  boss <- testEnemyWithDef Enemies.cnidathqua id
  boss `spawnAt` elsewhere
  pure (appendage, boss)

printedAppendage :: Location -> TestAppT Enemy
printedAppendage here = do
  appendage <- testEnemyWithDef Enemies.writhingAppendage id
  appendage `spawnAt` here
  pure appendage

defeatAppendage :: Enemy -> TestAppT ()
defeatAppendage appendage = run $ DealDamage (toTarget appendage) (nonAttack Nothing GameSource 20)

resolveAppendage :: Enemy -> TestAppT ()
resolveAppendage appendage = chooseOptionMatching "resolve the actual appendage defeat Forced ability" \case
  AbilityLabel {ability} -> abilitySource ability == toSource appendage && abilityIndex ability == 2
  _ -> False

observesBossDamage :: Enemy -> Enemy -> TestAppT (IORef Bool)
observesBossDamage appendage boss = createMessageChecker \case
  DealDamage (EnemyTarget eid) assignment ->
    eid == boss.id
      && damageAssignmentSource assignment == AbilitySource (toSource appendage) 2
      && damageAssignmentAmount assignment == 1
  _ -> False

assertDiscarded :: Enemy -> Card -> TestAppT ()
assertDiscarded appendage card = do
  assertNone $ EnemyWithId appendage.id
  discardCards <- getEncounterDiscard RegularEncounterDeck
  map toCard discardCards `shouldSatisfy` elem card

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
