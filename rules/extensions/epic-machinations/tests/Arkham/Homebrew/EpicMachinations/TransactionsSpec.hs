module Arkham.Homebrew.EpicMachinations.TransactionsSpec (spec) where

import Arkham.Classes.HasGame (getGame)
import Arkham.Card (genCard, genPlayerCard, toCardDef)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (AssetAttrs (..))
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Enemies
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as EpicEnemies
import Arkham.Enemy.Types (EnemyAttrs (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Transactions
import Arkham.Homebrew.EpicMachinations.Transport (moveEdwin)
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Types (InvestigatorAttrs (..), investigatorClues)
import Arkham.Location.Types (LocationAttrs (..))
import Arkham.Matcher
import Arkham.Placement
import Arkham.Scenario.Types (setMetaKey)
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Stories
import Arkham.Message.Story qualified as StoryMessage
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
  it "publishes Edwin's actual era after fresh setup and physical movement without a clue or progress request"
    . scenarioTest "87001" $ \self -> do
      initialize self
      destination <- selectJust $ locationIs Locations.tindalosEpic
      edwin <- testEnemyWithDef EpicEnemies.edwinBennetEnviousRival $ \attrs -> attrs
        {enemyPlacement = AtLocation destination}
      present <- getGame
      let absent = present {gameEntities = (gameEntities present)
            {entitiesEnemies = Map.delete edwin.id $ entitiesEnemies $ gameEntities present},
            gameCards = Map.delete (toCardId edwin) $ gameCards present}
          state = selectedStories self.id "87034" "87038"
          connect era game = game {gameMode = case gameMode game of
            That scenario -> That $ change era scenario
            These campaign scenario -> These campaign $ change era scenario
            _ -> error "native movement test requires a scenario"}
          change era = overAttrs $ setMetaKey "epicMachinationsReplica"
            (either (error . show) id $ machinationsReplicaFor era state)
          worlds = Map.fromList [(PastEra, connect PastEra absent),
            (PresentEra, connect PresentEra present), (FutureEra, connect FutureEra absent)]
          ready = syncNativeEraProgress worlds state
          liveEras current = Map.keys $ Map.filter eraEdwinEnemy current.machinationsEras
      liveEras state `shouldBe` []
      liveEras ready `shouldBe` [PresentEra]
      (sent, received) <- expectRight $ moveEdwin self.id destination
        (worlds Map.! PresentEra) (worlds Map.! FutureEra)
      let movedWorlds = Map.insert PresentEra sent $ Map.insert FutureEra received worlds
          moved = syncNativeEraProgress movedWorlds ready
      liveEras moved `shouldBe` [FutureEra]
      moved.machinationsGlobalPlayers `shouldBe` ready.machinationsGlobalPlayers
      moved.machinationsRevision `shouldBe` ready.machinationsRevision
      moved.machinationsDeliveries `shouldBe` ready.machinationsDeliveries
      syncNativeEraProgress movedWorlds moved `shouldBe` moved
  it "keeps selected stories unfinished across empty native worlds while respecting local and global completion"
    . scenarioTest "87001" $ \self -> do
      initialize self
      base <- getGame
      let empty = base {gameEntities = (gameEntities base) {entitiesStories = mempty}}
          worlds = Map.fromList [(era, empty) | era <- allEras]
          selected = selectedStories self.id "87034" "87038"
          synchronized = syncNativeEraProgress worlds selected
          apply era operation = fst . either (error . show) id . applyMachinationsOperation era operation
          pastDone = syncNativeEraProgress worlds $ apply PastEra (CompleteStory "87038") synchronized
          redeemed = syncNativeEraProgress worlds $ apply PresentEra (CompleteStory "87034") pastDone
          stories era current = (current.machinationsEras Map.! era).eraStories
      for_ allEras $ \era -> stories era synchronized `shouldBe` Set.fromList ["87034", "87038"]
      stories PastEra pastDone `shouldBe` Set.singleton "87034"
      stories PresentEra pastDone `shouldBe` Set.fromList ["87034", "87038"]
      stories FutureEra pastDone `shouldBe` Set.fromList ["87034", "87038"]
      stories PastEra redeemed `shouldBe` mempty
      stories PresentEra redeemed `shouldBe` Set.singleton "87038"
      stories FutureEra redeemed `shouldBe` Set.singleton "87038"
      synchronized.machinationsCompletedStories `shouldBe` mempty
      synchronized.machinationsDeliveries `shouldBe` selected.machinationsDeliveries
      let checked = fst $ either (error . show) id $ applyMachinationsOperation PastEra CheckTimeline synchronized
      checked.machinationsResolution `shouldBe` Nothing
  it "retains a completed story's physical face until its deferred native removal executes"
    . scenarioTest "87001" $ \self -> do
      initialize self
      card <- genCard Stories.mobTroubles
      run $ StoryMessage $ StoryMessage.PlaceStory card Unplaced
      waiting <- getGame
      let selected = selectedStories self.id "87034" "87039"
          completed = fst $ either (error . show) id $ applyMachinationsOperation PastEra (CompleteStory "87039") selected
          refresh game = syncNativeEraProgress (Map.fromList [(era, game) | era <- allEras]) completed
          pastStories game = ((refresh game).machinationsEras Map.! PastEra).eraStories
      pastStories waiting `shouldSatisfy` Set.member "87039"
      run $ StoryMessage $ StoryMessage.RemoveStory $ StoryId "87039"
      removed <- getGame
      pastStories removed `shouldSatisfy` Set.notMember "87039"
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
  void $ genPlayerCard $ toCardDef $ toAttrs self
  let state = either (error . show) id $ initialMachinations $ Map.fromList [(era, Set.singleton self.id) | era <- allEras]
      replica = either (error . show) id $ machinationsReplicaFor PastEra state
      change = overAttrs $ setMetaKey "epicMultiplayer" True . setMetaKey "epicMachinationsReplica" replica
  overTest $ modeL %~ \case
    That scenario -> That $ change scenario
    These campaign scenario -> These campaign $ change scenario
    _ -> error "test requires native scenario"
  run Setup
  chooseOnlyOption "start this era at Tindalos"
  chooseOnlyOption "flip Noble Legacy"

expectRight = either (\problem -> expectationFailure (unpack problem) >> error "native transaction rejected") pure
selectedStories iid machination plot =
  let initial = either (error . show) id $ initialMachinations $ Map.fromList [(era, Set.singleton iid) | era <- allEras]
      apply operation = fst . either (error . show) id . applyMachinationsOperation PastEra operation
   in apply (SelectPlot plot) $ apply (SelectMachination machination) initial
zeroInvestigatorClues game = game {gameEntities = (gameEntities game)
  {entitiesInvestigators = Map.map (overAttrs \attrs -> attrs
    {investigatorTokens = Map.insert Clue 0 attrs.investigatorTokens}) $ entitiesInvestigators $ gameEntities game}}
clueCounts iid game =
  (investigatorClues $ toAttrs $ fromJustNote "test investigator" $ Map.lookup iid $ entitiesInvestigators $ gameEntities game,
   sum [Map.findWithDefault 0 Clue (toAttrs location).locationTokens | location <- Map.elems $ entitiesLocations $ gameEntities game,
     toCardCode location == toCardCode Locations.tindalosEpic])
