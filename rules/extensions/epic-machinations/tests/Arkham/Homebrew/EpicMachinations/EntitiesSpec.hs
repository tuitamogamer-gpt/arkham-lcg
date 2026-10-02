module Arkham.Homebrew.EpicMachinations.EntitiesSpec (spec) where

import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Asset.Cards.NightOfTheZealot qualified as PlayerAssets
import Arkham.Asset.Types (Field (AssetDamage, AssetClues, AssetCardId, AssetPlacement, AssetTokens))
import Arkham.Card
import Arkham.Classes.HasGame (getGame)
import Arkham.Classes.HasQueue (fromQueue)
import Arkham.Cost (Payment (NoPayment))
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Ordinary
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.Enemy.CardDefs.NightOfTheZealot.Rats qualified as Rats
import Arkham.Enemy.Types (Field (EnemyTokens, EnemyHealth, EnemyDamage, EnemyCard, EnemyLocation))
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicLabyrinth.Types (DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.Assets.EdwinBennetEsteemedColleague qualified as Colleague
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Enemies.EdwinBennetEnviousRival qualified as Rival
import Arkham.Homebrew.EpicMachinations.Enemies.Tyrthrha qualified as Tyr
import Arkham.Homebrew.EpicMachinations.Helpers (getMachinationsReplica)
import Arkham.Homebrew.EpicMachinations.Stories.ABitterRivalry qualified as Bitter
import Arkham.Homebrew.EpicMachinations.Stories.RedeemAFormerColleague qualified as Redeem
import Arkham.Homebrew.EpicMachinations.Stories.UneasyAlliance qualified as Alliance
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Message.Story
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Matcher (enemyIs, assetIs, AssetMatcher (AssetWithId, AssetExhausted))
import Arkham.SkillTest.Type (SkillTestType (..))
import Arkham.Placement
import Arkham.Projection
import Arkham.Scenario.Types (setMetaKey)
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Stories
import Arkham.Token qualified as Token
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import TestImport qualified as TI
import TestImport.New

initializeEpic :: Era -> Investigator -> TestAppT ()
initializeEpic era self = do
  let state = either (error . show) id $ initialMachinations $ Map.fromList [(e, Set.singleton self.id) | e <- allEras]
      replica = either (error . show) id $ machinationsReplicaFor era state
      change = overAttrs $ setMetaKey "epicMultiplayer" True . setMetaKey "epicMachinationsReplica" replica
  overTest $ modeL %~ \case
    That active -> That $ change active
    These campaign active -> These campaign $ change active
    _ -> error "test needs scenario"

putStory :: CardDef -> TestAppT StoryId
putStory definition = do
  card <- genCard definition
  run $ StoryMessage $ PlaceStory card Unplaced
  replica <- getMachinationsReplica
  run $ ScenarioSpecific "epicMachinations.replica" $ toJSON replica
  pure $ StoryId $ toCardCode definition

pendingOperations :: TestAppT [MachinationsOperation]
pendingOperations = map machinationsRequestOperation <$> (getScenarioMetaKeyDefault "epicMachinationsOutbox" [] :: TestAppT [MachinationsRequest])

spec :: Spec
spec = describe "Epic Machinations original entities and story actions" do
  it "uses the actual Epic NPC identities and common printed story identities" do
    toCardCode Rival.edwinBennetEnviousRival `TI.shouldBe` "87037"
    toCardCode Colleague.edwinBennetEsteemedColleague `TI.shouldBe` "87037b"
    toCardCode Tyr.tyrthrha `TI.shouldBe` "87043"
    [toCardCode Bitter.aBitterRivalry, toCardCode Redeem.redeemAFormerColleague, toCardCode Alliance.uneasyAlliance]
      `TI.shouldBe` ["87033", "87034", "87035"]

  it "damages each Scientist at Edwin's location before choosing the encounter-card recipient"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      location <- testLocation
      self `moveTo` location
      edwin <- testEnemyWithDef Enemies.edwinBennetEnviousRival id
      edwin `spawnAt` location
      thomas <- self `putAssetIntoPlay` Assets.thomasCorriganPresent
      mary <- self `putAssetIntoPlay` Assets.maryZielinskiPresent
      rats <- genEncounterCard Rats.swarmOfRats
      run $ SetEncounterDeck $ Deck [rats]
      run $ UseCardAbility self.id (EnemySource edwin.id) 1 [] NoPayment
      field AssetDamage thomas `shouldReturn` 1
      field AssetDamage mary `shouldReturn` 1
      chooseTarget self
      selectCount (enemyIs Rats.swarmOfRats) `shouldReturn` 1

  it "prevents damage to the Envious Rival" . scenarioTest "87001" $ \self -> do
    initializeEpic PresentEra self
    location <- testLocation
    edwin <- testEnemyWithDef Enemies.edwinBennetEnviousRival id
    edwin `spawnAt` location
    run $ nonAttackEnemyDamage (Just self.id) GameSource 3 edwin.id
    field EnemyDamage edwin.id `shouldReturn` 0

  it "flips the actual Rival card into the Colleague while preserving its physical identity and attachments"
    . scenarioTest "87001" $ TI.debug $ \self -> do
      initializeEpic PresentEra self
      location <- testLocation
      self `moveTo` location
      edwin <- testEnemyWithDef Enemies.edwinBennetEnviousRival id
      edwin `spawnAt` location
      attached <- self `putAssetIntoPlay` PlayerAssets.flashlight
      run $ PlaceAsset attached $ AttachedToEnemy edwin.id
      run $ PlaceTokens GameSource (EnemyTarget edwin.id) Token.Target 2
      runQueueT $ Lifted.exhaustEnemy GameSource edwin.id
      runMessages
      before <- getGame
      let physical = toCardId $ fromJustNote "Rival" $ Map.lookup edwin.id $ entitiesEnemies $ gameEntities before
      registered <- field EnemyCard edwin.id
      actualLocation <- field EnemyLocation edwin.id
      let otherFace = lookupCard (toCardCode $ flipCard registered) (toCardId registered)
      liftIO $ print $ object ["edwinBefore" .= registered, "resolvedOtherFace" .= otherFace,
        "resolvedType" .= show (toCardType otherFace), "location" .= actualLocation]
      run $ Flip self.id GameSource $ EnemyTarget edwin.id
      after <- getGame
      queued <- fromQueue id
      liftIO $ print $ object ["edwinAfterAssets" .= entitiesAssets (gameEntities after),
        "edwinAfterEnemies" .= entitiesEnemies (gameEntities after),
        "question" .= gameQuestion after, "remainingQueue" .= queued]
      Map.member edwin.id (entitiesEnemies $ gameEntities after) `shouldBe` False
      colleagues <- select $ assetIs Assets.edwinBennetEsteemedColleague
      length colleagues `shouldBe` 1
      for_ colleagues $ \aid -> do
        field AssetCardId aid `shouldReturn` physical
        field AssetTokens aid `shouldReturn` Map.singleton Token.Target 2
        selectCount (AssetWithId aid <> AssetExhausted) `shouldReturn` 1
        field AssetPlacement attached `shouldReturn` AttachedToAsset aid Nothing

  it "sizes a redemption payment by all three groups and refuses insufficient local clues"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      location <- testLocation
      edwin <- testEnemyWithDef Enemies.edwinBennetEnviousRival id
      edwin `spawnAt` location
      story <- putStory Stories.redeemAFormerColleague
      withProp @"clues" 2 self
      run $ PassedSkillTest self.id (Just #parley) (toAbilitySource story 2)
        (SkillTestInitiatorTarget $ EnemyTarget edwin.id) (SkillSkillTest #intellect) 1
      tokens <- field EnemyTokens edwin.id
      Map.findWithDefault 0 Token.Redemption tokens `shouldBe` 0
      self.clues `shouldReturn` 2

  it "Uneasy Alliance consumes two clues in the local era" . scenarioTest "87001" $ \self -> do
    initializeEpic PastEra self
    location <- testLocation
    self `moveTo` location
    aid <- self `putAssetIntoPlay` Assets.edwinBennetEsteemedColleague
    run $ PlaceTokens GameSource (AssetTarget aid) Token.Clue 3
    story <- putStory Stories.uneasyAlliance
    run $ UseCardAbility self.id (StorySource story) 3 [] NoPayment
    field AssetClues aid `shouldReturn` 1

  it "records the damage that actually survived native processing exactly once"
    . scenarioTest "87001" $ \self -> do
      initializeEpic FutureEra self
      location <- testLocation
      tyr <- testEnemyWithDef Ordinary.tyrthrha id
      tyr `spawnAt` location
      field EnemyHealth tyr.id `shouldReturn` Just 18
      run $ nonAttackEnemyDamage (Just self.id) GameSource 3 tyr.id
      field EnemyDamage tyr.id `shouldReturn` 3
      pendingOperations `shouldReturn` [DamageTyrthrha 3]

  it "mirrors an absolute shared health delivery without applying it twice"
    . scenarioTest "87001" $ \self -> do
      initializeEpic FutureEra self
      location <- testLocation
      tyr <- testEnemyWithDef Ordinary.tyrthrha id
      tyr `spawnAt` location
      let delivery = ScenarioSpecific "epicMachinations.delivery" $ toJSON $
            MachinationsEnvelope (DeliveryId "tyr-test:1") $ SetTyrthrhaRemaining 7
      run delivery
      run delivery
      field EnemyDamage tyr.id `shouldReturn` 11
      pendingOperations `shouldReturn` [AcknowledgeMachinationsDelivery $ DeliveryId "tyr-test:1"]

  it "retains ordinary Tyr health and damage without requiring an Epic replica" . gameTest $ \self -> do
    location <- testLocation
    tyr <- testEnemyWithDef Ordinary.tyrthrha id
    tyr `spawnAt` location
    field EnemyHealth tyr.id `shouldReturn` Just 6
    run $ nonAttackEnemyDamage (Just self.id) GameSource 2 tyr.id
    field EnemyDamage tyr.id `shouldReturn` 2
    pendingOperations `shouldReturn` []
