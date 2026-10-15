module Arkham.Homebrew.ScenarioFixes.QueenOfAshSpec (spec) where

import Arkham.Ability (abilityIndex, abilitySource, abilityType)
import Arkham.Ability.Type (AbilityType (ForcedAbility))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Campaign (lookupCampaign)
import Arkham.Campaigns.BrethrenOfAsh.Key
import Arkham.Classes.HasGame (getGame)
import Arkham.Difficulty (Difficulty (Easy))
import Arkham.Enemy.CardDefs.BrethrenOfAsh.AshenPilgrims qualified as Enemies
import Arkham.Enemy.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyCard, EnemyLocation))
import Arkham.Helpers.Log (getHasRecord)
import Arkham.Helpers.Scenario (getEncounterDeck, scenarioField)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Investigator.Types (Field (InvestigatorLocation))
import Arkham.Location.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Locations
import Arkham.Matcher
import Arkham.Projection
import Arkham.Question (Question (..))
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Types (Field (ScenarioSetAsideCards))
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import TestImport.New

-- Brethren of Ash campaign guide, p. 12: when the investigators stirred up
-- trouble, put one Cultist from Ashen Pilgrims/Cultists into play per player,
-- then shuffle all remaining encounter cards into the encounter deck. The
-- generated card cache lets these tests compare physical identities, including
-- the multiple copies of Cantor of Flame and Zealot, across their actual zones.
spec :: Spec
spec = describe "Queen of Ash: campaign setup card conservation" do
  for_ [1 .. 4] \players -> do
    it ("spawns " <> show players <> " distinct cultists and retains every unchosen physical card")
      . scenarioTest "12168" $ \self -> do
        beginQueenSetup self players True
        gathered <- gatheredCultists
        finishQueenSetup
        assertQueenSetup players True gathered

    it ("keeps all six cultists in the encounter deck without the record, for " <> show players <> " players")
      . scenarioTest "12168" $ \self -> do
        beginQueenSetup self players False
        gathered <- gatheredCultists
        finishQueenSetup
        assertQueenSetup players False gathered

  it "resumes the pending starting-location choice without losing, duplicating or replacing a cultist"
    . scenarioTest "12168" $ \self -> do
      beginQueenSetup self 4 True
      gathered <- gatheredCultists
      -- The real starting-location choice suspends the native queue before
      -- enemy creation. Save both the Game and that queue, not only the deck.
      selectCount AnyEnemy `shouldReturn` 0
      questions <- gameQuestion <$> getGame
      questions `shouldSatisfy` (not . null)
      roundTripPendingGame
      finishQueenSetup
      assertQueenSetup 4 True gathered
      completed <- deployedCultists
      roundTripPendingGame
      tick
      assertQueenSetup 4 True gathered
      deployedCultists `shouldReturn` completed

beginQueenSetup :: Investigator -> Int -> Bool -> TestAppT ()
beginQueenSetup self players stirredUpTrouble = do
  -- Production setup has loaded investigator decks. The empty scenarioTest
  -- harness otherwise makes Game.putGame discard its generated card cache.
  withDeck self [Assets.flashlight]
  traverse_ addInvestigator $ take (players - 1)
    [Investigators.rolandBanks, Investigators.daisyWalker, Investigators.skidsOToole]
  overTest \game -> game
    { gameMode = These (lookupCampaign "12" Easy)
        (fromJustNote "Queen of Ash is the attached native scenario" $ modeScenario $ gameMode game)
    , gamePlayerCount = players
    }
  when stirredUpTrouble $ record InvestigatorsStirredUpTrouble
  getHasRecord InvestigatorsStirredUpTrouble `shouldReturn` stirredUpTrouble
  run Setup
  -- The first ask is the printed setup instructions. Acknowledge its actual
  -- Continue option before saving the subsequent starting-location choice.
  chooseOptionMatching "acknowledge Queen of Ash setup instructions" \case
    Label "$continue" _ -> True
    _ -> False

finishQueenSetup :: TestAppT ()
finishQueenSetup = do
  culvert <- selectJust $ locationIs Locations.sewerCulvert
  chooseTarget culvert
  resolveSetupZealots []
  -- Keep the setup flag while all placements and initial enemies resolve;
  -- finish via the real message rather than changing the flag ahead of them.
  run EndSetup

-- A drawn Zealot can open its real forced enter-play window. Resolve only
-- that printed ability, at most once per physical Zealot, before EndSetup.
-- Never run another message past an unanswered ask to finish the queue.
resolveSetupZealots :: [EnemyId] -> TestAppT ()
resolveSetupZealots resolved = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  unless (null pending) do
    questions <- gameQuestion <$> getGame
    zealots <- select $ enemyIs Enemies.zealot
    let offered = concatMap (choices . stripQuestionWrappers) $ Map.elems questions
        zealotAbility = \case
          AbilityLabel {ability}
            | abilityIndex ability == 1
            , ForcedAbility {} <- abilityType ability
            , EnemySource eid <- abilitySource ability
            , eid `elem` zealots -> Just eid
          _ -> Nothing
        available = filter (`notElem` resolved) $ mapMaybe zealotAbility offered
    case headMay available of
      Just enemy | length resolved < 3 -> do
        chooseOptionMatching "resolve the spawned Zealot's printed forced ability"
          ((== Just enemy) . zealotAbility)
        resolveSetupZealots (enemy : resolved)
      _ -> expectationFailure
        $ "Unexpected Queen of Ash setup prompt/queue: "
        <> take 1800 (show (questions, take 5 pending))
 where
  choices = \case
    ChooseOne options -> options
    PlayerWindowChooseOne options -> options
    ChooseOneAtATime options -> options
    _ -> []

isSetupCultist :: Card -> Bool
isSetupCultist card = toCardCode card `elem` ["12121", "12188", "12189"]

gatheredCultists :: TestAppT [Card]
gatheredCultists = filter isSetupCultist . Map.elems . gameCards <$> getGame

deployedCultists :: TestAppT [(CardId, Maybe LocationId)]
deployedCultists = do
  enemies <- select AnyEnemy
  fmap sort $ for enemies \enemy -> do
    card <- field EnemyCard enemy
    location <- field EnemyLocation enemy
    pure (toCardId card, location)

assertQueenSetup :: Int -> Bool -> [Card] -> TestAppT ()
assertQueenSetup players stirredUpTrouble gathered = do
  Deck deck <- getEncounterDeck
  enemies <- select AnyEnemy
  spawned <- traverse (field EnemyCard) enemies
  placements <- traverse (field EnemyLocation) enemies
  tunnels <- select $ LocationWithTitle "Sewer Tunnels"
  culvert <- selectJust $ locationIs Locations.sewerCulvert
  setAside <- scenarioField ScenarioSetAsideCards
  let remaining = filter isSetupCultist $ map toCard deck
      expectedSpawned = if stirredUpTrouble then players else 0
      ids = sort . map toCardId
  selectCount Anyone `shouldReturn` players
  getHasRecord InvestigatorsStirredUpTrouble `shouldReturn` stirredUpTrouble
  map toCardCode gathered `shouldMatchList`
    ["12121", "12121", "12188", "12188", "12188", "12189"]
  length (nub $ ids gathered) `shouldBe` 6
  length spawned `shouldBe` expectedSpawned
  all isSetupCultist spawned `shouldBe` True
  length remaining `shouldBe` 6 - expectedSpawned
  -- Equality of physical IDs catches both missing cards and replacements that
  -- merely recreate the correct card codes; disjoint zones catch duplication.
  ids (remaining <> spawned) `shouldBe` ids gathered
  length (nub $ ids $ remaining <> spawned) `shouldBe` 6
  ids remaining `shouldNotSatisfy` any (`elem` ids spawned)
  length tunnels `shouldBe` 5
  all (maybe False (`elem` tunnels)) placements `shouldBe` True
  length (nub placements) `shouldBe` expectedSpawned
  selectField InvestigatorLocation Anyone `shouldReturn` replicate players (Just culvert)
  count ((== toCardCode Enemies.hellhound) . toCardCode) deck `shouldBe` 2
  for_ [Enemies.queensKnight, Enemies.servantOfFlameAWillingSacrifice] \card ->
    map toCardCode setAside `shouldContain` [toCardCode card]
  filter isSetupCultist setAside `shouldBe` []

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
