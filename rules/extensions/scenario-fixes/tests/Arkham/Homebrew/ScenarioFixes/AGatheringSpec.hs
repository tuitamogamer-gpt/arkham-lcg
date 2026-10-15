module Arkham.Homebrew.ScenarioFixes.AGatheringSpec (spec) where

import Arkham.Agenda.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Agendas
import Arkham.Agenda.Types (Field (AgendaCard))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetHorror))
import Arkham.Asset.Types qualified as Asset
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Enemies
import Arkham.Enemy.CardDefs.NightOfTheZealot.Ghouls qualified as OtherEnemies
import Arkham.Enemy.Types (Field (EnemyCard, EnemyDamage, EnemyDoom, EnemyLocation))
import Arkham.Helpers.Agenda (getCurrentAgendaStep)
import Arkham.Helpers.Scenario (scenarioField)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Locations
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Placement (Placement (InPlayArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Types (Field (ScenarioSetAsideCards))
import Arkham.Token qualified as Token
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed A Gathering (12169b): spawn the Servant only if it is set aside.
-- Every example advances the actual agenda, acknowledges its back, and resolves
-- its actual willpower test. No synthetic failure/UseThisAbility substitutes for
-- that path. The fixture installs the two real Queen of Ash agenda cards without
-- running an unrelated full scenario setup.
spec :: Spec
spec = describe "A Gathering's conditional Servant spawn" do
  it "spawns the physical set-aside Servant and resumes its test from a saved checkpoint"
    . scenarioTest "12168" $ \self -> do
      (cistern, _) <- prepare self
      servant <- genCard Enemies.servantOfFlameAWillingSacrifice
      other <- genCard OtherEnemies.ghoulMinion
      run $ SetAsideCards [servant, other]
      advanceGathering
      eid <- selectJust $ enemyIs Enemies.servantOfFlameAWillingSacrifice
      fieldMap EnemyCard toCardId eid `shouldReturn` toCardId servant
      field EnemyLocation eid `shouldReturn` Just cistern.id
      scenarioField ScenarioSetAsideCards `shouldReturn` [other]
      getCurrentAgendaStep `shouldReturn` 1
      roundTripPendingGame
      startSkillTest
      applyResults
      self.horror `shouldReturn` 0
      getCurrentAgendaStep `shouldReturn` 2
      selectCount (enemyIs Enemies.servantOfFlameAWillingSacrifice) `shouldReturn` 1

  it "leaves an already-in-play Servant at its location with its tokens and exhaustion intact"
    . scenarioTest "12168" $ \self -> do
      (_, elsewhere) <- prepare self
      servant <- testEnemyWithDef Enemies.servantOfFlameAWillingSacrifice id
      servant `spawnAt` elsewhere
      run $ PlaceTokens GameSource (toTarget servant) Token.Damage 1
      run $ PlaceTokens GameSource (toTarget servant) Token.Doom 1
      exhaust servant
      before <- field EnemyCard servant.id
      advanceGathering
      field EnemyLocation servant.id `shouldReturn` Just elsewhere.id
      field EnemyCard servant.id `shouldReturn` before
      field EnemyDamage servant.id `shouldReturn` 1
      field EnemyDoom servant.id `shouldReturn` 1
      assertAny $ EnemyWithId servant.id <> ExhaustedEnemy
      startSkillTest
      applyResults
      getCurrentAgendaStep `shouldReturn` 2
      field EnemyLocation servant.id `shouldReturn` Just elsewhere.id
      selectCount (enemyIs Enemies.servantOfFlameAWillingSacrifice) `shouldReturn` 1

  it "does not recreate a Servant that has left the game"
    . scenarioTest "12168" $ \self -> do
      (_, elsewhere) <- prepare self
      servant <- testEnemyWithDef Enemies.servantOfFlameAWillingSacrifice id
      servant `spawnAt` elsewhere
      run $ RemoveFromGame $ toTarget servant
      assertNone $ enemyIs Enemies.servantOfFlameAWillingSacrifice
      advanceGathering
      assertNone $ enemyIs Enemies.servantOfFlameAWillingSacrifice
      startSkillTest
      applyResults
      getCurrentAgendaStep `shouldReturn` 2
      assertNone $ enemyIs Enemies.servantOfFlameAWillingSacrifice

  it "leaves unrelated set-aside enemies untouched when the Servant is absent"
    . scenarioTest "12168" $ \self -> do
      void $ prepare self
      other <- genCard OtherEnemies.ghoulMinion
      run $ SetAsideCards [other]
      advanceGathering
      selectCount AnyEnemy `shouldReturn` 0
      scenarioField ScenarioSetAsideCards `shouldReturn` [other]
      startSkillTest
      applyResults
      getCurrentAgendaStep `shouldReturn` 2
      selectCount AnyEnemy `shouldReturn` 0
      scenarioField ScenarioSetAsideCards `shouldReturn` [other]

  it "deals direct horror for failure before advancing, bypassing available asset soak"
    . scenarioTest "12168" $ \self -> do
      void $ prepare self
      withProp @"willpower" 0 self
      rosary <- testAssetWithDef Assets.holyRosary
        ((Asset.controllerL ?~ self.id) . (Asset.placementL .~ InPlayArea self.id)) self
      advanceGathering
      getCurrentAgendaStep `shouldReturn` 1
      startSkillTest
      getCurrentAgendaStep `shouldReturn` 1
      self.horror `shouldReturn` 0
      applyResults
      assertHorrorIsDirect
      applyAllHorror
      self.horror `shouldReturn` 1
      field AssetHorror rosary.id `shouldReturn` 0
      getCurrentAgendaStep `shouldReturn` 2

  it "finishes both investigators' tests before installing A Ritual"
    . scenarioTest "12168" $ \self -> do
      (_, elsewhere) <- prepare self
      other <- addInvestigator Investigators.rolandBanks
      other `moveTo` elsewhere
      withProp @"willpower" 0 self
      withProp @"willpower" 5 other
      advanceGathering
      startSkillTest
      applyResults
      assertHorrorIsDirect
      applyAllHorror
      getCurrentAgendaStep `shouldReturn` 1
      startSkillTest
      applyResults
      self.horror `shouldReturn` 1
      other.horror `shouldReturn` 0
      getCurrentAgendaStep `shouldReturn` 2

prepare :: Investigator -> TestAppT (Location, Location)
prepare self = do
  runQueueT $ Lifted.setAgendaDeck [Agendas.aGathering, Agendas.aRitual]
  runMessages
  -- Setting the stack does not instantiate its current agenda; normal setup
  -- sends SetAgendaDeck separately to put the first physical card into play.
  run SetAgendaDeck
  cistern <- testLocationWithDef Locations.undergroundCistern id
  elsewhere <- testLocation
  self `moveTo` elsewhere
  withProp @"willpower" 5 self
  setChaosTokens [Zero]
  pure (cistern, elsewhere)

advanceGathering :: TestAppT ()
advanceGathering = do
  aid <- selectJust $ AgendaWithDeckId 1
  fieldMap AgendaCard toCardCode aid `shouldReturn` toCardCode Agendas.aGathering
  run $ AdvanceAgendaBy aid AgendaAdvancedWithOther
  chooseFirstOption "read A Gathering's printed back"

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
