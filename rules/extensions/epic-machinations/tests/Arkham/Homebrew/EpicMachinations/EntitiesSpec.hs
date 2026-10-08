module Arkham.Homebrew.EpicMachinations.EntitiesSpec (spec) where

import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Ability (Ability, abilityIndex, abilityLimit)
import Arkham.Ability.Limit (AbilityLimit (GroupLimit), AbilityLimitType (PerGame, PerRound, PerTurn))
import Arkham.Agenda.Types (Field (AgendaDoom))
import Arkham.Asset.Cards.NightOfTheZealot qualified as PlayerAssets
import Arkham.Asset.Types (Field (AssetDamage, AssetClues, AssetCardId, AssetPlacement, AssetTokens))
import Arkham.Card
import Arkham.Classes.HasGame (getGame)
import Arkham.Cost (Payment (NoPayment))
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Ordinary
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.Enemy.CardDefs.NightOfTheZealot.Rats qualified as Rats
import Arkham.Enemy.Types (Field (EnemyTokens, EnemyHealth, EnemyDamage))
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicLabyrinth.Types (DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.Assets.EdwinBennetEsteemedColleague qualified as Colleague
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Enemies.EdwinBennetEnviousRival qualified as Rival
import Arkham.Homebrew.EpicMachinations.Enemies.Tyrthrha qualified as Tyr
import Arkham.Homebrew.EpicMachinations.Helpers (getMachinationsReplica)
import Arkham.Homebrew.EpicMachinations.Stories.ABitterRivalry qualified as Bitter
import Arkham.Homebrew.EpicMachinations.Stories.RedeemAFormerColleague qualified as Redeem
import Arkham.Homebrew.EpicMachinations.Stories.Shared (allPlotsFinished)
import Arkham.Homebrew.EpicMachinations.Stories.UneasyAlliance qualified as Alliance
import Arkham.Homebrew.EpicMachinations.Transactions (nativeEraProgress)
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Message.Story
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Location.CardDefs.MachinationsThroughTime qualified as Locations
import Arkham.Location.Types (Field (LocationAbilities, LocationCardId, LocationTokens), revealedL)
import Arkham.Matcher (enemyIs, assetIs, locationIs, AssetMatcher (AssetWithId, AssetExhausted), EnemyMatcher (EnemyWithId), LocationMatcher (LocationIs))
import Arkham.SkillTest.Type (SkillTestType (..))
import Arkham.Placement
import Arkham.Projection
import Arkham.Scenario.Types (setMetaKey)
import Arkham.ScenarioLogKey (ScenarioLogKey (ATreeSeedHasBeenPlanted, CorriganIndustriesHasBeenFounded))
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Stories
import Arkham.Token qualified as Token
import Data.Aeson qualified as Aeson
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

locationAbility :: Location -> Int -> TestAppT Ability
locationAbility location index = do
  abilities <- field LocationAbilities location.id
  pure $ fromJustNote "printed location ability" $ find ((== index) . abilityIndex) abilities

remoteLocations :: [(Era, CardDef, Int, Era, CardDef, Token.Token)]
remoteLocations =
  [ (FutureEra, Locations.miskatonicUniversityFuture, 1, PastEra, Locations.miskatonicUniversityPast, Token.Seed)
  , (PresentEra, Locations.tickTockClubPresent, 1, FutureEra, Locations.tickTockClubFuture, Token.Time)
  , (FutureEra, Locations.tickTockClubFuture, 1, PastEra, Locations.oMalleysWatchShop, Token.Time)
  , (FutureEra, Locations.riverDocksFuture, 2, PresentEra, Locations.riverDocksPresent, Token.Shipment)
  ]

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
    . scenarioTest "87001" $ \self -> do
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
      run $ Flip self.id GameSource $ EnemyTarget edwin.id
      -- Native RemoveEnemy retains an OutOfPlay tombstone for historical
      -- references; its former enemy face must no longer be in play.
      selectCount (EnemyWithId edwin.id) `shouldReturn` 0
      redeemed <- getGame
      let progress = nativeEraProgress PresentEra redeemed
      progress.eraEdwinEnemy `shouldBe` False
      progress.eraEdwinAsset `shouldBe` True
      colleagues <- select $ assetIs Assets.edwinBennetEsteemedColleague
      length colleagues `shouldBe` 1
      for_ colleagues $ \aid -> do
        field AssetCardId aid `shouldReturn` physical
        field AssetTokens aid `shouldReturn` Map.singleton Token.Target 2
        selectCount (AssetWithId aid <> AssetExhausted) `shouldReturn` 1
        field AssetPlacement attached `shouldReturn` AttachedToAsset aid Nothing

  it "chooses resolution four after the Rival is removed, including a saved historical entity"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      location <- testLocation
      edwin <- testEnemyWithDef Enemies.edwinBennetEnviousRival id
      edwin `spawnAt` location
      active <- getGame
      (nativeEraProgress PresentEra active).eraEdwinEnemy `shouldBe` True
      run $ RemoveFromGame $ EnemyTarget edwin.id
      removed <- getGame
      let historical = fromJustNote "native removal retains the physical Rival record" $
            Map.lookup edwin.id $ entitiesEnemies removed.gameEntities
      historical.placement.isInPlay `shouldBe` False
      restored <- either (\problem -> expectationFailure problem >> error "native reload failed") pure $
        Aeson.eitherDecode $ Aeson.encode removed
      let progress = nativeEraProgress PresentEra restored
          initial = either (error . show) id $ initialMachinations $
            Map.fromList [(era, Set.singleton self.id) | era <- allEras]
          reported = initial {machinationsEras = Map.insert PresentEra progress initial.machinationsEras}
          failed = fst $ either (error . show) id $ applyMachinationsOperation PresentEra FailTimeline reported
      progress.eraEdwinEnemy `shouldBe` False
      progress.eraEdwinAsset `shouldBe` False
      failed.machinationsResolution `shouldBe` Just 4

  it "does not count a removed Colleague as the live asset for failure resolution"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      location <- testLocation
      self `moveTo` location
      edwin <- self `putAssetIntoPlay` Assets.edwinBennetEsteemedColleague
      active <- getGame
      (nativeEraProgress PresentEra active).eraEdwinAsset `shouldBe` True
      run $ RemoveFromGame $ AssetTarget edwin
      removed <- getGame
      let progress = nativeEraProgress PresentEra removed
          initial = either (error . show) id $ initialMachinations $
            Map.fromList [(era, Set.singleton self.id) | era <- allEras]
          reported = initial {machinationsEras = Map.insert PresentEra progress initial.machinationsEras}
          failed = fst $ either (error . show) id $ applyMachinationsOperation PresentEra FailTimeline reported
      progress.eraEdwinAsset `shouldBe` False
      failed.machinationsResolution `shouldBe` Just 4

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

  it "keeps Uneasy Alliance's global plot objective closed until every local plot completes"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      story <- putStory Stories.uneasyAlliance
      let initial = either (error . show) id $ initialMachinations $
            Map.fromList [(era, Set.singleton self.id) | era <- allEras]
          apply era operation = fst . either (error . show) id . applyMachinationsOperation era operation
          selected = apply PastEra (SelectPlot "87038") initial
          unreported = selected {machinationsEras = Map.map (\progress -> progress {eraStories = mempty}) selected.machinationsEras}
          pastDone = apply PastEra (CompleteStory "87038") selected
          presentDone = apply PresentEra (CompleteStory "87038") pastDone
          allDone = apply FutureEra (CompleteStory "87038") presentDone
      for_ [(selected, False), (unreported, False), (pastDone, False), (presentDone, False), (allDone, True)] $
        \(state, expected) -> do
          let replica = either (error . show) id $ machinationsReplicaFor PresentEra state
          run $ ScenarioSpecific "epicMachinations.replica" $ toJSON replica
          game <- getGame
          let actual = fromJustNote "the physical Uneasy Alliance story" $ Map.lookup story game.gameEntities.entitiesStories
          allPlotsFinished (toAttrs actual) `shouldBe` expected

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

  describe "Printed cross-era location actions" do
    for_ [(PresentEra, "87018", "Send a shipment to the Present River Docks"),
          (FutureEra, "87027", "Send a shipment to the Future River Docks")] $ \(receiver, code, label) ->
      it ("registers the original Past Docks runner and pays for its shipment to " <> show receiver)
        . scenarioTest "87001" $ \self -> do
          initializeEpic PastEra self
          docks <- testLocationWithDef Locations.riverDocksPast (revealedL .~ True)
          self `moveTo` docks
          withProp @"resources" 2 self
          ability <- locationAbility docks 1
          abilityLimit ability `shouldBe` GroupLimit PerTurn 1
          self `useAbility` ability
          chooseOptionMatching "exact shipment recipient" $ \case
            Label actual _ -> actual == label
            _ -> False
          self.resources `shouldReturn` 0
          self.remainingActions `shouldReturn` 2
          pendingOperations `shouldReturn` [SendLocationToken receiver code Token.Shipment 1]
          selectCount (LocationIs code) `shouldReturn` 0

    it "registers the original Present Docks runner and pays three resources plus an action"
      . scenarioTest "87001" $ \self -> do
        initializeEpic PresentEra self
        docks <- testLocationWithDef Locations.riverDocksPresent (revealedL .~ True)
        self `moveTo` docks
        withProp @"resources" 3 self
        ability <- locationAbility docks 2
        self `useAbility` ability
        self.resources `shouldReturn` 0
        self.remainingActions `shouldReturn` 2
        pendingOperations `shouldReturn` [SendLocationToken FutureEra "87027" Token.Shipment 1]
        selectCount (locationIs Locations.riverDocksFuture) `shouldReturn` 0

    for_ [(True, "Exhaust Thomas Corrigan to place a time token at the Present Tick-Tock Club"),
          (False, "Leave Thomas Corrigan ready")] $ \(send, label) ->
      it ("registers the original Past Watch Shop runner and " <> if send then "sends its paid optional time" else "keeps its paid skip option")
        . scenarioTest "87001" $ \self -> do
          initializeEpic PastEra self
          shop <- testLocationWithDef Locations.oMalleysWatchShop (revealedL .~ True)
          agenda <- testAgenda "87002" id
          run $ PlaceTokens GameSource (AgendaTarget agenda.id) Token.Doom 2
          run $ PlaceTokens GameSource (LocationTarget shop.id) Token.Time 1
          self `moveTo` shop
          thomas <- self `putAssetIntoPlay` Assets.thomasCorriganPast
          run $ PlaceAsset thomas $ AtLocation shop.id
          ability <- locationAbility shop 1
          self `useAbility` ability
          clickLabel label
          self.remainingActions `shouldReturn` 2
          field AgendaDoom agenda.id `shouldReturn` 1
          fieldMap LocationTokens (Map.findWithDefault 0 Token.Time) shop.id `shouldReturn` 0
          selectCount (AssetWithId thomas <> AssetExhausted) `shouldReturn` if send then 1 else 0
          pendingOperations `shouldReturn` if send then [SendLocationToken PresentEra "87017" Token.Time 1] else []
          selectCount (locationIs Locations.tickTockClubPresent) `shouldReturn` 0

    it "registers the original Childhood Home runner and pays its printed two actions"
      . scenarioTest "87001" $ \self -> do
        initializeEpic PastEra self
        home <- testLocationWithDef Locations.childhoodHome (revealedL .~ True)
        self `moveTo` home
        let identifier = DeliveryId "location-test:home-founding"
        run $ ScenarioSpecific "epicMachinations.delivery" $ toJSON $
          MachinationsEnvelope identifier $ ReceiveAnnouncement CorriganIndustriesHasBeenFounded
        ability <- locationAbility home 2
        abilityLimit ability `shouldBe` GroupLimit PerGame 1
        self `useAbility` ability
        self.remainingActions `shouldReturn` 1
        pendingOperations `shouldReturn`
          [AcknowledgeMachinationsDelivery identifier, SendLocationToken FutureEra "87029" Token.TimeCapsule 1]
        selectCount (locationIs Locations.corriganIndustries) `shouldReturn` 0

    for_ [(PastEra, "87007"), (PresentEra, "87016"), (FutureEra, "87025")] $ \(receiver, code) ->
      it ("registers the original Future Advertiser runner and pays for its newspaper to " <> show receiver)
        . scenarioTest "87001" $ \self -> do
          initializeEpic FutureEra self
          advertiser <- testLocationWithDef Locations.arkhamAdvertiserFuture (revealedL .~ True)
          self `moveTo` advertiser
          ability <- locationAbility advertiser 1
          abilityLimit ability `shouldBe` GroupLimit PerGame 2
          self `useAbility` ability
          chooseOptionMatching "exact newspaper recipient" $ \case
            Label actual _ -> actual == "Place a newspaper token in " <> tshow receiver
            _ -> False
          self.remainingActions `shouldReturn` 2
          pendingOperations `shouldReturn` [SendLocationToken receiver code Token.Newspaper 1]
          fieldMap LocationTokens (Map.findWithDefault 0 Token.Newspaper) advertiser.id `shouldReturn` 0

    it "pays the Future University action and routes its seed to the absent Past University"
      . scenarioTest "87001" $ \self -> do
        initializeEpic FutureEra self
        university <- testLocationWithDef Locations.miskatonicUniversityFuture (revealedL .~ True)
        self `moveTo` university
        mary <- self `putAssetIntoPlay` Assets.maryZielinskiFuture
        run $ PlaceAsset mary $ AtLocation university.id
        original <- field LocationCardId university.id
        ability <- locationAbility university 1
        abilityLimit ability `shouldBe` GroupLimit PerGame 1
        self `useAbility` ability
        self.remainingActions `shouldReturn` 2
        pendingOperations `shouldReturn` [SendLocationToken PastEra "87010" Token.Seed 1]
        selectCount (locationIs Locations.miskatonicUniversityPast) `shouldReturn` 0
        field LocationCardId university.id `shouldReturn` original

    for_ [(True, "Exhaust Thomas Corrigan to place a time token at the Future Tick-Tock Club"),
          (False, "Leave Thomas Corrigan ready")] $ \(send, label) ->
      it ("pays the Present Club's time/action/doom change and " <> if send then "sends its optional time" else "keeps Thomas ready")
        . scenarioTest "87001" $ \self -> do
          initializeEpic PresentEra self
          club <- testLocationWithDef Locations.tickTockClubPresent (revealedL .~ True)
          agenda <- testAgenda "87002" id
          run $ PlaceTokens GameSource (AgendaTarget agenda.id) Token.Doom 2
          run $ PlaceTokens GameSource (LocationTarget club.id) Token.Time 1
          self `moveTo` club
          thomas <- self `putAssetIntoPlay` Assets.thomasCorriganPresent
          run $ PlaceAsset thomas $ AtLocation club.id
          ability <- locationAbility club 1
          self `useAbility` ability
          clickLabel label
          self.remainingActions `shouldReturn` 2
          field AgendaDoom agenda.id `shouldReturn` 1
          fieldMap LocationTokens (Map.findWithDefault 0 Token.Time) club.id `shouldReturn` 0
          selectCount (AssetWithId thomas <> AssetExhausted) `shouldReturn` if send then 1 else 0
          pendingOperations `shouldReturn` if send then [SendLocationToken FutureEra "87026" Token.Time 1] else []
          selectCount (locationIs Locations.tickTockClubFuture) `shouldReturn` 0

    it "pays Future Thomas's exhaustion and one local clue to send time to the Past Watch Shop"
      . scenarioTest "87001" $ \self -> do
        initializeEpic FutureEra self
        club <- testLocationWithDef Locations.tickTockClubFuture (revealedL .~ True)
        self `moveTo` club
        thomas <- self `putAssetIntoPlay` Assets.thomasCorriganFuture
        run $ PlaceAsset thomas $ AtLocation club.id
        withProp @"clues" 1 self
        ability <- locationAbility club 1
        abilityLimit ability `shouldBe` GroupLimit PerGame 1
        self `useAbility` ability
        chooseTarget thomas
        self.clues `shouldReturn` 0
        self.remainingActions `shouldReturn` 2
        selectCount (AssetWithId thomas <> AssetExhausted) `shouldReturn` 1
        pendingOperations `shouldReturn` [SendLocationToken PastEra "87008" Token.Time 1]
        selectCount (locationIs Locations.oMalleysWatchShop) `shouldReturn` 0

    it "pays the Future Docks' three-resource alternative without spending an action"
      . scenarioTest "87001" $ \self -> do
        initializeEpic FutureEra self
        docks <- testLocationWithDef Locations.riverDocksFuture (revealedL .~ True)
        self `moveTo` docks
        withProp @"resources" 3 self
        ability <- locationAbility docks 2
        abilityLimit ability `shouldBe` GroupLimit PerRound 1
        self `useAbility` ability
        self.resources `shouldReturn` 0
        self.remainingActions `shouldReturn` 3
        pendingOperations `shouldReturn` [SendLocationToken PresentEra "87018" Token.Shipment 1]
        selectCount (locationIs Locations.riverDocksPresent) `shouldReturn` 0

    it "pays the Future Docks' two distinct Scientists alternative without resources or actions"
      . scenarioTest "87001" $ \self -> do
        initializeEpic FutureEra self
        docks <- testLocationWithDef Locations.riverDocksFuture (revealedL .~ True)
        self `moveTo` docks
        withProp @"resources" 0 self
        thomas <- self `putAssetIntoPlay` Assets.thomasCorriganFuture
        mary <- self `putAssetIntoPlay` Assets.maryZielinskiFuture
        run $ PlaceAsset thomas $ AtLocation docks.id
        run $ PlaceAsset mary $ AtLocation docks.id
        ability <- locationAbility docks 2
        self `useAbility` ability
        chooseTarget thomas
        chooseTarget mary
        self.resources `shouldReturn` 0
        self.remainingActions `shouldReturn` 3
        selectCount (AssetWithId thomas <> AssetExhausted) `shouldReturn` 1
        selectCount (AssetWithId mary <> AssetExhausted) `shouldReturn` 1
        pendingOperations `shouldReturn` [SendLocationToken PresentEra "87018" Token.Shipment 1]

    for_ remoteLocations $ \(_, _, _, receiver, definition, token) ->
      it ("applies the physical " <> show token <> " receipt once at " <> show (toCardCode definition))
        . scenarioTest "87001" $ \self -> do
          initializeEpic receiver self
          target <- testLocationWithDef definition (revealedL .~ True)
          other <- testLocation
          original <- field LocationCardId target.id
          let identifier = DeliveryId $ "location-test:" <> tshow (toCardCode definition)
              delivery = ScenarioSpecific "epicMachinations.delivery" $ toJSON $
                MachinationsEnvelope identifier $ PlaceRemoteToken (toCardCode definition) token 1
          run delivery
          run delivery
          fieldMap LocationTokens (Map.findWithDefault 0 token) target.id `shouldReturn` 1
          fieldMap LocationTokens (Map.findWithDefault 0 token) other.id `shouldReturn` 0
          field LocationCardId target.id `shouldReturn` original
          pendingOperations `shouldReturn` [AcknowledgeMachinationsDelivery identifier]

    it "uses the received seed through the Past University's printed two-action planting cost"
      . scenarioTest "87001" $ \self -> do
        initializeEpic PastEra self
        university <- testLocationWithDef Locations.miskatonicUniversityPast (revealedL .~ True)
        self `moveTo` university
        thomas <- self `putAssetIntoPlay` Assets.thomasCorriganPast
        run $ PlaceAsset thomas $ AtLocation university.id
        withProp @"resources" 0 self
        let identifier = DeliveryId "location-test:seed-plant"
        run $ ScenarioSpecific "epicMachinations.delivery" $ toJSON $
          MachinationsEnvelope identifier $ PlaceRemoteToken "87010" Token.Seed 1
        ability <- locationAbility university 1
        self `useAbility` ability
        self.remainingActions `shouldReturn` 1
        self.resources `shouldReturn` 1
        fieldMap LocationTokens (Map.findWithDefault 0 Token.Seed) university.id `shouldReturn` 0
        pendingOperations `shouldReturn` [AcknowledgeMachinationsDelivery identifier, Announce ATreeSeedHasBeenPlanted]

    for_ remoteLocations $ \(_, origin, index, _, targetDefinition, token) ->
      it ("retains ordinary Single Group location behavior for " <> show (toCardCode origin))
        . gameTest $ \self -> do
          source <- testLocationWithDef origin (revealedL .~ True)
          target <- testLocationWithDef targetDefinition (revealedL .~ True)
          when (toCardCode origin == "87017") do
            agenda <- testAgenda "87002" id
            run $ PlaceTokens GameSource (AgendaTarget agenda.id) Token.Doom 1
            thomas <- self `putAssetIntoPlay` Assets.thomasCorriganPresent
            run $ PlaceAsset thomas $ AtLocation source.id
          run $ UseCardAbility self.id (LocationSource source.id) index [] NoPayment
          when (toCardCode origin == "87017") $ chooseOptionMatching "ordinary optional Time effect" $ \case
            Label "$label.skip" _ -> False
            Label _ _ -> True
            _ -> False
          fieldMap LocationTokens (Map.findWithDefault 0 token) target.id `shouldReturn` 1
          pendingOperations `shouldReturn` []
