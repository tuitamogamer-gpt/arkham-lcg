module Arkham.Homebrew.EpicMachinations.TransactionsSpec (spec) where

import Arkham.Classes.HasGame (getGame)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (AssetAttrs (..))
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Enemies
import Arkham.Enemy.Types (EnemyAttrs (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Transactions
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Types (InvestigatorAttrs (..), investigatorClues)
import Arkham.Location.Types (LocationAttrs (..))
import Arkham.Matcher
import Arkham.Placement
import Arkham.Scenario.Types (setMetaKey)
import Arkham.Token (Token (Clue, Damage))
import Data.Either (isLeft)
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import TestImport.New

spec :: Spec
spec = describe "Machinations actual native token transactions" do
  it "moves one physical clue from investigator to this era's Tindalos" . scenarioTest "87001" $ \self -> do
    initialize self
    withProp @"clues" 2 self
    base <- getGame
    changed <- expectRight $ depositTindalosClue self.id base
    clueCounts self.id changed `shouldBe` (1, 1)
    clueCounts self.id base `shouldBe` (2, 0)
  it "moves a clue between eras sharing the same investigator code" . scenarioTest "87001" $ \self -> do
    initialize self
    withProp @"clues" 1 self
    base <- getGame
    donor <- expectRight $ depositTindalosClue self.id base
    let receiver = zeroInvestigatorClues base
    (a, b) <- expectRight $ takeTindalosClue self.id donor receiver
    clueCounts self.id a `shouldBe` (0, 0)
    clueCounts self.id b `shouldBe` (1, 0)
  it "keeps both native changes for a pickup from one's own era" . scenarioTest "87001" $ \self -> do
    initialize self
    withProp @"clues" 1 self
    base <- getGame
    donor <- expectRight $ depositTindalosClue self.id base
    (taken, received) <- expectRight $ takeTindalosClue self.id donor donor
    let merged = received {gameEntities = (gameEntities received)
          {entitiesLocations = entitiesLocations $ gameEntities taken}}
    clueCounts self.id merged `shouldBe` (1, 0)
    toJSON merged `shouldSatisfy` (/= toJSON donor)
  it "rejects overspending either native clue pool" . scenarioTest "87001" $ \self -> do
    initialize self
    base <- getGame
    depositTindalosClue self.id (zeroInvestigatorClues base) `shouldSatisfy` isLeft
    takeTindalosClue self.id base base `shouldSatisfy` isLeft
  it "derives real progress from the locked game instead of a serialized report" . scenarioTest "87001" $ \self -> do
    initialize self
    base <- getGame
    let progress = nativeEraProgress PastEra base
    progress.eraInvestigators `shouldBe` Set.singleton self.id
    progress.eraScientistsEscorted `shouldBe` False
    progress.eraTindalosClues `shouldBe` 0
  it "counts controlled Scientists at their controller's actual location" . scenarioTest "87001" $ \self -> do
    initialize self
    _ <- testAssetWithDef Assets.thomasCorriganPast (\attrs -> attrs {assetPlacement = InPlayArea self.id}) self
    _ <- testAssetWithDef Assets.maryZielinskiPast (\attrs -> attrs {assetPlacement = InPlayArea self.id}) self
    base <- getGame
    nativeEraProgress PastEra base `shouldSatisfy` (not . eraScientistsEscorted)
    away <- selectJust $ Anywhere <> not_ (locationIs Locations.tindalosEpic)
    let entities = gameEntities base
        moved = base {gameEntities = entities {entitiesInvestigators = Map.adjust
          (overAttrs \attrs -> attrs {investigatorPlacement = AtLocation away}) self.id entities.entitiesInvestigators}}
    nativeEraProgress PastEra moved `shouldSatisfy` eraScientistsEscorted
  it "mirrors absolute Tyrthrha damage while preserving physical identity and exhaustion" . scenarioTest "87001" $ \self -> do
    initialize self
    boss <- testEnemyWithDef Enemies.tyrthrha $ \attrs -> attrs
      {enemyTokens = Map.insert Damage 2 attrs.enemyTokens, enemyExhausted = True}
    ordinary <- testEnemyWith (\attrs -> attrs {enemyTokens = Map.insert Damage 3 attrs.enemyTokens})
    base <- getGame
    let changed = setSharedTyrthrha 24 17 base
        enemy iid = toAttrs $ fromJustNote "physical enemy" $ Map.lookup iid $ entitiesEnemies $ gameEntities changed
    (enemy boss.id).enemyCardId `shouldBe` toCardId boss
    (enemy boss.id).enemyExhausted `shouldBe` True
    Map.lookup Damage (enemy boss.id).enemyTokens `shouldBe` Just 7
    Map.lookup Damage (enemy ordinary.id).enemyTokens `shouldBe` Just 3

initialize self = do
  let state = either (error . show) id $ initialMachinations $ Map.fromList [(era, Set.singleton self.id) | era <- allEras]
      replica = either (error . show) id $ machinationsReplicaFor PastEra state
      change = overAttrs $ setMetaKey "epicMultiplayer" True . setMetaKey "epicMachinationsReplica" replica
  overTest $ modeL %~ \case
    That scenario -> That $ change scenario
    These campaign scenario -> These campaign $ change scenario
    _ -> error "test requires native scenario"
  run Setup
  chooseFirstOption "flip Noble Legacy"

expectRight = either (\problem -> expectationFailure (unpack problem) >> error "native transaction rejected") pure
zeroInvestigatorClues game = game {gameEntities = (gameEntities game)
  {entitiesInvestigators = Map.map (overAttrs \attrs -> attrs
    {investigatorTokens = Map.insert Clue 0 attrs.investigatorTokens}) $ entitiesInvestigators $ gameEntities game}}
clueCounts iid game =
  (investigatorClues $ toAttrs $ fromJustNote "test investigator" $ Map.lookup iid $ entitiesInvestigators $ gameEntities game,
   sum [Map.findWithDefault 0 Clue (toAttrs location).locationTokens | location <- Map.elems $ entitiesLocations $ gameEntities game,
     toCardCode location == toCardCode Locations.tindalosEpic])
