module Arkham.Homebrew.EpicLabyrinth.TransferSpec (spec) where

import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Asset.Cards.NightOfTheZealot qualified as PlayerAssets
import Arkham.Asset.Types (Asset, AssetAttrs (..))
import Arkham.Card
import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.Types (Enemy (..), EnemyAttrs (..))
import Arkham.Game.Base (Game (..))
import Arkham.Deck qualified as Deck
import Arkham.Homebrew.EpicLabyrinth.Enemies.TheJailor qualified as Jailor
import Arkham.Homebrew.EpicLabyrinth.ReturnBridge
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Stories.TheVent qualified as Vent
import Arkham.Homebrew.EpicLabyrinth.Transfer
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Investigator.Types (InvestigatorAttrs (..), investigatorResources, investigatorClues)
import Arkham.Placement
import Arkham.Scenario.Types (ScenarioAttrs (..))
import Arkham.Story.Types (Story (..), StoryAttrs (..))
import Arkham.Token qualified as Token
import Arkham.Zone (OutOfPlayZone (SetAsideZone))
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Either (isLeft)
import Data.Map.Strict qualified as Map
import Data.UUID qualified as UUID
import TestImport qualified as TI
import TestImport.New

identifier :: ExchangeId
identifier = ExchangeId UUID.nil

connected :: LabyrinthGroup -> [Exchange] -> Game -> Game
connected group exchanges game = game {gameMode = case gameMode game of
  This campaign -> error $ "test needs a scenario: " <> show campaign
  That active -> That $ change active
  These campaign active -> These campaign $ change active}
 where
  change = overAttrs \attrs -> attrs {scenarioId = "70001", scenarioMeta = case scenarioMeta attrs of
    Object values -> Object $ KeyMap.insert "epicMultiplayer" (toJSON True) $ KeyMap.insert "epicLabyrinthReplica" (toJSON replica) values
    _ -> object ["epicLabyrinthReplica" .= replica, "epicMultiplayer" .= True]}
  replica = Replica
    { replicaGroup = group
    , replicaGroups = Map.fromList [(g, initialGroup $ setFromList [gameActiveInvestigatorId game]) | g <- allGroups]
    , replicaStoryChoices = mempty
    , replicaSecretChamber = Nothing
    , replicaExchanges = exchanges
    , replicaRevision = 0
    }

participantExchange :: ExchangeKind -> InvestigatorId -> Exchange
participantExchange kind iid = Exchange identifier kind (Map.fromList [(GroupA, iid), (GroupB, iid)]) False mempty

packet :: InvestigatorId -> Permission -> Cargo -> Parcel
packet iid permission cargo = Parcel (ParcelId UUID.nil) GroupA GroupB (Just iid) (Just iid) permission cargo

readTokens :: Game -> (Int, Int)
readTokens game = let attrs = toAttrs $ fromJustNote "test investigator" $ Map.lookup (gameActiveInvestigatorId game) $ entitiesInvestigators $ gameEntities game
  in (investigatorResources attrs, investigatorClues attrs)

zeroTokens :: Game -> Game
zeroTokens game = game {gameEntities = (gameEntities game) {entitiesInvestigators = Map.map
  (overAttrs \attrs -> attrs {investigatorTokens = Map.insert Token.Resource 0 $ Map.insert Token.Clue 0 $ investigatorTokens attrs})
  $ entitiesInvestigators $ gameEntities game}}

assertRight :: Either Text a -> TestAppT a
assertRight = either (\message -> expectationFailure (unpack message) >> error "failed pure transfer") pure

ownerRecord :: Card -> LabyrinthGroup -> Game -> Game
ownerRecord card group game = game {gameMode = case gameMode game of
  That active -> That $ overAttrs (\attrs -> attrs {scenarioMeta = case attrs.meta of
    Object values -> Object $ KeyMap.insert "epicLabyrinthOwners" (toJSON $ Map.singleton (toCardId card) group) values
    _ -> error "test needs object metadata"}) active
  These campaign active -> These campaign $ overAttrs (\attrs -> attrs {scenarioMeta = case attrs.meta of
    Object values -> Object $ KeyMap.insert "epicLabyrinthOwners" (toJSON $ Map.singleton (toCardId card) group) values
    _ -> error "test needs object metadata"}) active
  _ -> error "test needs scenario"}

spec :: Spec
spec = describe "Epic Labyrinth atomic native transfer" do
  it "debits and credits resources and clues across groups with the same investigator code" . gameTest $ \self -> do
    withProp @"resources" 5 self
    withProp @"clues" 3 self
    base <- getGame
    let exchange = participantExchange RiftExchange self.id
        sender = connected GroupA [exchange] base
        receiver = zeroTokens $ connected GroupB [exchange] base
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoResources = 2, cargoClues = 1}
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    readTokens a `shouldBe` (3, 2)
    readTokens b `shouldBe` (2, 1)
    readTokens sender `shouldBe` (5, 3)

  it "rejects overspending without changing either native game" . gameTest $ \self -> do
    withProp @"resources" 1 self
    base <- getGame
    let exchange = participantExchange RiftExchange self.id
        sender = connected GroupA [exchange] base
        receiver = zeroTokens $ connected GroupB [exchange] base
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoResources = 2}
    transferParcel parcel sender receiver `shouldSatisfy` isLeft
    readTokens sender `shouldBe` (1, 0)
    readTokens receiver `shouldBe` (0, 0)

  it "forbids clues through Paradox Effect" . gameTest $ \self -> do
    withProp @"clues" 1 self
    base <- getGame
    let exchange = participantExchange ParadoxExchange self.id
        parcel = packet self.id (ThroughParadox identifier) emptyCargo {cargoClues = 1}
    transferParcel parcel (connected GroupA [exchange] base) (connected GroupB [exchange] base)
      `shouldSatisfy` isLeft

  it "rejects a participant who has already left the private exchange" . gameTest $ \self -> do
    base <- getGame
    let exchange = (participantExchange RiftExchange self.id) {exchangeFinished = setFromList [GroupB]}
        parcel = packet self.id (ThroughRift identifier) emptyCargo
    transferParcel parcel (connected GroupA [exchange] base) (connected GroupB [exchange] base)
      `shouldSatisfy` isLeft

  it "moves an exact hand card and preserves its original owner group" . gameTest $ \self -> do
    card <- genMyCard self PlayerAssets.flashlight
    withProp @"hand" [card] self
    base <- getGame
    let exchange = participantExchange RiftExchange self.id
        sender = connected GroupA [exchange] base {gameCards = Map.insert (toCardId card) card $ gameCards base}
        receiver = zeroTokens $ connected GroupB [exchange] base
          { gameEntities = (gameEntities base) {entitiesInvestigators = Map.map
              (overAttrs \attrs -> attrs {investigatorHand = []}) $ entitiesInvestigators $ gameEntities base}
          , gameCards = Map.delete (toCardId card) $ gameCards base
          }
        snapshot = EntitySnapshot HandCard (toCardId card) (toCardCode card) (toCardOwner card) (Just GroupA) Nothing mempty [] (toJSON card)
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoEntities = [snapshot]}
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    let hand game = investigatorHand . toAttrs $ fromJustNote "self" $ Map.lookup self.id $ entitiesInvestigators $ gameEntities game
    hand a `shouldBe` []
    map toJSON (hand b) `shouldBe` [toJSON card]
    originalOwner card b `shouldBe` Right (Just (GroupA, self.id))
    transferParcel parcel a b `shouldSatisfy` isLeft

  it "rejects stale card contents and occupied destination card IDs" . gameTest $ \self -> do
    card <- genMyCard self PlayerAssets.flashlight
    withProp @"hand" [card] self
    base <- getGame
    let exchange = participantExchange RiftExchange self.id
        snapshot = EntitySnapshot HandCard (toCardId card) (toCardCode card) (toCardOwner card) (Just GroupA) Nothing mempty [] Null
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoEntities = [snapshot]}
    transferParcel parcel (connected GroupA [exchange] base) (connected GroupB [exchange] base)
      `shouldSatisfy` isLeft
    let occupied = snapshot {snapshotNative = toJSON card}
    transferParcel (parcel {parcelCargo = emptyCargo {cargoEntities = [occupied]}})
      (connected GroupA [exchange] base) (connected GroupB [exchange] base) `shouldSatisfy` isLeft

  it "moves a live story asset with its damage, clues, exhaustion and native metadata intact" . gameTest $ \self -> do
    base <- getGame
    aid <- self `putAssetIntoPlay` Assets.eixodolonsNote
    current <- getGame
    let original = fromJustNote "Note" $ Map.lookup aid $ entitiesAssets $ gameEntities current
        asset = overAttrs (\attrs -> attrs {assetTokens = Map.fromList [(Token.Damage, 1), (Token.Clue, 2)],
          assetExhausted = True, assetMeta = object ["state" .= ("saved" :: Text)]}) original
        exchange = participantExchange RiftExchange self.id
        sender = connected GroupA [exchange] current
          {gameEntities = (gameEntities current) {entitiesAssets = Map.insert aid asset $ entitiesAssets $ gameEntities current}}
        receiver = connected GroupB [exchange] base
        snapshot = storyAssetSnapshot Nothing asset
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoEntities = [snapshot]}
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    Map.member aid (entitiesAssets $ gameEntities a) `shouldBe` False
    let moved = fromJustNote "moved Note" $ Map.lookup aid $ entitiesAssets $ gameEntities b
    toJSON moved `shouldBe` toJSON asset

  it "moves Vent tokens and private notes exactly once at commit" . gameTest $ \self -> do
    base <- getGame
    let cargo = emptyCargo {cargoResources = 3, cargoClues = 2, cargoNotes = ["Do not reveal this outside the Vent."]}
        parcel = (packet self.id ThroughVent cargo) {parcelRecipient = Nothing}
        cardA = unsafeMakeCardId UUID.nil
        cardB = unsafeMakeCardId $ UUID.fromWords 0 0 0 1
        storyA = cbCardBuilder Vent.theVent cardA (Nothing, StoryId "70035")
        storyB = cbCardBuilder Vent.theVent cardB (Nothing, StoryId "70035")
        origin = overAttrs (\attrs -> (remember emptyMemory
          {ventNotes = cargoNotes cargo, pendingVentParcels = Map.singleton (parcelId parcel) cargo} attrs)
          {storyTokens = Map.fromList [(Token.Resource, 5), (Token.Clue, 4)]}) storyA
        install story game = game {gameEntities = (gameEntities game)
          {entitiesStories = Map.singleton (StoryId "70035") $ Story story}}
        sender = install origin $ connected GroupA [] base
        receiver = install storyB $ connected GroupB [] base
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    let readVent game = toAttrs $ fromJustNote "Vent" $ Map.lookup (StoryId "70035") $ entitiesStories $ gameEntities game
        count token = Map.findWithDefault 0 token . storyTokens . readVent
    (count Token.Resource a, count Token.Clue a) `shouldBe` (2, 2)
    (count Token.Resource b, count Token.Clue b) `shouldBe` (3, 2)
    ventNotes (memory $ readVent a) `shouldBe` []
    ventNotes (memory $ readVent b) `shouldBe` cargoNotes cargo
    transferParcel parcel a b `shouldSatisfy` isLeft

  it "moves The Jailor with its complete recursive attachment graph and original player owners" . gameTest $ \self -> do
    base <- getGame
    firstId <- self `putAssetIntoPlay` PlayerAssets.flashlight
    secondId <- self `putAssetIntoPlay` PlayerAssets.flashlight
    current <- getGame
    let eid = EnemyId UUID.nil
        cid = unsafeMakeCardId $ UUID.fromWords 0 0 0 7
        enemy = Enemy $ overAttrs (\attrs -> attrs
          { enemyPlacement = OutOfPlay SetAsideZone
          , enemyTokens = Map.fromList [(Token.Damage, 3), (Token.Doom, 2)]
          , enemyExhausted = True
          , enemyMeta = object ["awaitsRoundEnd" .= False]
          }) $ cbCardBuilder Jailor.theJailor cid eid
        first = overAttrs (\attrs -> attrs {assetPlacement = AttachedToEnemy eid,
          assetTokens = Map.singleton Token.Damage 1}) $
          fromJustNote "first attachment" $ Map.lookup firstId $ entitiesAssets $ gameEntities current
        second = overAttrs (\attrs -> attrs {assetPlacement = AttachedToAsset firstId Nothing,
          assetExhausted = True, assetMeta = object ["nested" .= True]}) $
          fromJustNote "second attachment" $ Map.lookup secondId $ entitiesAssets $ gameEntities current
        attached asset = object ["kind" .= ("asset" :: Text), "cardId" .= toCardId asset, "native" .= toJSON asset]
        snapshot = EntitySnapshot Jailor cid "70051" Nothing Nothing Nothing
          (setFromList [toCardId first, toCardId second]) [attached first, attached second] (toJSON enemy)
        -- putAssetIntoPlay's test generator records an unowned canonical card
        -- before it assigns pcOwner to the played copy. Real deck cards already
        -- have that owner; make both fixture records agree before transport.
        sender = connected GroupA [] current {gameCards = Map.insert (toCardId first) (toCard first)
          $ Map.insert (toCardId second) (toCard second) $ gameCards current,
          gameEntities = (gameEntities current)
          {entitiesEnemies = Map.insert eid enemy $ entitiesEnemies $ gameEntities current,
           entitiesAssets = Map.insert firstId first $ Map.insert secondId second $ entitiesAssets $ gameEntities current}}
        receiver = connected GroupB [] base
        parcel = (packet self.id MoveJailor emptyCargo {cargoEntities = [snapshot]})
          {parcelSender = Nothing, parcelRecipient = Nothing}
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    Map.member eid (entitiesEnemies $ gameEntities a) `shouldBe` False
    Map.member firstId (entitiesAssets $ gameEntities a) `shouldBe` False
    Map.member secondId (entitiesAssets $ gameEntities a) `shouldBe` False
    toJSON (fromJustNote "Jailor" $ Map.lookup eid $ entitiesEnemies $ gameEntities b) `shouldBe` toJSON enemy
    toJSON (fromJustNote "attachment" $ Map.lookup firstId $ entitiesAssets $ gameEntities b) `shouldBe` toJSON first
    toJSON (fromJustNote "nested attachment" $ Map.lookup secondId $ entitiesAssets $ gameEntities b) `shouldBe` toJSON second
    originalOwner (toCard second) b `shouldBe` Right (Just (GroupA, self.id))
    let incomplete = snapshot {snapshotAttachments = setFromList [toCardId first], snapshotAttachedEntities = [attached first]}
    transferParcel (parcel {parcelCargo = emptyCargo {cargoEntities = [incomplete]}}) sender receiver `shouldSatisfy` isLeft
    let stale = snapshot {snapshotAttachedEntities = [attached first, object ["kind" .= ("asset" :: Text),
          "cardId" .= toCardId second, "native" .= Null]]}
    transferParcel (parcel {parcelCargo = emptyCargo {cargoEntities = [stale]}}) sender receiver `shouldSatisfy` isLeft

  it "rejects a destination entity ID even when its physical card ID differs" . gameTest $ \self -> do
    base <- getGame
    aid <- self `putAssetIntoPlay` Assets.eixodolonsNote
    current <- getGame
    let asset = fromJustNote "Note" $ Map.lookup aid $ entitiesAssets $ gameEntities current
        conflict = overAttrs (\attrs -> attrs {assetCardId = unsafeMakeCardId UUID.nil}) asset
        sender = connected GroupA [] current
        receiver = connected GroupB [] base {gameEntities = (gameEntities base)
          {entitiesAssets = Map.insert aid conflict $ entitiesAssets $ gameEntities base}}
    moveNativeGraph [storyAssetSnapshot Nothing asset] Nothing Nothing sender receiver `shouldSatisfy` isLeft

  it "returns a transferred card to its original group's discard after another group used it" . gameTest $ \self -> do
    card <- genMyCard self PlayerAssets.flashlight
    withProp @"hand" [card] self
    base <- getGame
    let exchange = participantExchange RiftExchange self.id
        sender = connected GroupA [exchange] base {gameCards = Map.insert (toCardId card) card $ gameCards base}
        receiver = connected GroupB [exchange] base
          { gameEntities = (gameEntities base) {entitiesInvestigators = Map.map
              (overAttrs \attrs -> attrs {investigatorHand = []}) $ entitiesInvestigators $ gameEntities base}
          , gameCards = Map.delete (toCardId card) $ gameCards base }
        snapshot = EntitySnapshot HandCard (toCardId card) (toCardCode card) (toCardOwner card) (Just GroupA) Nothing mempty [] (toJSON card)
        parcel = packet self.id (ThroughRift identifier) emptyCargo {cargoEntities = [snapshot]}
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    (used, ownerGame) <- assertRight $ returnToOriginalOwnerDiscard card b a
    let investigatorIn game = toAttrs $ fromJustNote "self" $ Map.lookup self.id $ entitiesInvestigators $ gameEntities game
    investigatorHand (investigatorIn used) `shouldBe` []
    map (toJSON . PlayerCard) (investigatorDiscard $ investigatorIn ownerGame) `shouldBe` [toJSON card]
    Map.member (toCardId card) (gameCards used) `shouldBe` False
    Map.lookup (toCardId card) (gameCards ownerGame) `shouldSatisfy` isJust
    returnToOriginalOwnerDiscard card used ownerGame `shouldSatisfy` isLeft

  it "transfers a Vent Item's exact card and original owner without installing a live asset" . gameTest $ \self -> do
    base <- getGame
    card <- genMyCard self PlayerAssets.flashlight
    let snapshot = EntitySnapshot ItemAsset (toCardId card) (toCardCode card) (toCardOwner card)
          (Just GroupA) Nothing mempty [] (toJSON card)
        cargo = emptyCargo {cargoEntities = [snapshot]}
        parcel = (packet self.id ThroughVent cargo) {parcelRecipient = Nothing}
        origin = overAttrs (\attrs -> (remember emptyMemory
          {ventItems = [snapshot], pendingVentParcels = Map.singleton (parcelId parcel) cargo} attrs)
          {storyCardsUnderneath = [card]}) $
          cbCardBuilder Vent.theVent (unsafeMakeCardId $ UUID.fromWords 0 0 0 8) (Nothing, StoryId "70035")
        destination = cbCardBuilder Vent.theVent (unsafeMakeCardId $ UUID.fromWords 0 0 0 9) (Nothing, StoryId "70035")
        install story game = game {gameEntities = (gameEntities game)
          {entitiesStories = Map.singleton (StoryId "70035") $ Story story}}
        sender = install origin $ connected GroupA [] base {gameCards = Map.insert (toCardId card) card $ gameCards base}
        receiver = install destination $ connected GroupB [] base
    (a, b) <- assertRight $ transferParcel parcel sender receiver
    let underneath game = storyCardsUnderneath . toAttrs $
          fromJustNote "Vent" $ Map.lookup (StoryId "70035") $ entitiesStories $ gameEntities game
    underneath a `shouldBe` []
    map toJSON (underneath b) `shouldBe` [toJSON card]
    originalOwner card b `shouldBe` Right (Just (GroupA, self.id))
    length (entitiesAssets $ gameEntities b) `shouldBe` length (entitiesAssets $ gameEntities base)

  it "routes discard, hand and all three deck return forms through the original owner's native queue" . gameTest $ \self -> do
    card <- genMyCard self PlayerAssets.flashlight
    withProp @"hand" [card] self
    base <- getGame
    let source = ownerRecord card GroupA $ connected GroupB [] base
          {gameCards = Map.insert (toCardId card) card $ gameCards base}
        receiver = connected GroupA [] base
          {gameCards = Map.delete (toCardId card) $ gameCards base,
           gameEntities = (gameEntities base) {entitiesInvestigators = Map.map
            (overAttrs \attrs -> attrs {investigatorHand = []}) $ entitiesInvestigators $ gameEntities base}}
        player = case card of PlayerCard pc -> pc; _ -> error "test needs player card"
        cases = [(OwnerDiscard, [AddToDiscard self.id player]), (OwnerHand, [AddToHand self.id [card]]),
          (OwnerDeckTop, [PutCardOnTopOfDeck self.id (Deck.InvestigatorDeck self.id) card]),
          (OwnerDeckBottom, [PutCardOnBottomOfDeck self.id (Deck.InvestigatorDeck self.id) card]),
          (OwnerDeckShuffle, [ShuffleCardsIntoDeck (Deck.InvestigatorDeck self.id) [card]])]
    for_ cases $ \(destination, expected) -> do
      let request = OwnerReturnRequest (OperationId UUID.nil) $ OwnerReturnIntent GroupA self.id [card] destination
      (a, b, messages) <- assertRight $ transferOwnerReturn request source receiver
      messages `shouldBe` expected
      Map.member (toCardId card) (gameCards a) `shouldBe` False
      Map.lookup (toCardId card) (gameCards b) `shouldSatisfy` isJust
      transferOwnerReturn request a b `shouldSatisfy` isLeft

  it "splits mixed hand additions without confusing reused investigator IDs" . gameTest $ \self -> do
    returning <- genMyCard self PlayerAssets.flashlight
    local <- genMyCard self PlayerAssets.flashlight
    base <- getGame
    let source = ownerRecord returning GroupA $ connected GroupB [] base
        intent = OwnerReturnIntent GroupA self.id [returning] OwnerHand
        expected = Run [AddToHand self.id [local], ScenarioSpecific "epicLabyrinth.ownerReturn" $ toJSON intent]
    gateOwnerReturn source (AddToHand self.id [local, returning]) `shouldBe` expected
    gateOwnerReturn (connected GroupA [] base) (AddToHand self.id [local]) `shouldBe` AddToHand self.id [local]

  it "detects Machinations owner group from its frozen era JSON without importing Machine types" . gameTest $ \_ -> do
    base <- getGame
    let eraGame era = base {gameMode = case gameMode base of
          That active -> That $ overAttrs (\attrs -> attrs {scenarioMeta = object
            ["epicMachinationsReplica" .= object ["currentEra" .= (era :: Text)]]}) active
          These campaign active -> These campaign $ overAttrs (\attrs -> attrs {scenarioMeta = object
            ["epicMachinationsReplica" .= object ["currentEra" .= (era :: Text)]]}) active
          _ -> error "needs scenario"}
    map (connectedGroup . eraGame) ["PastEra", "PresentEra", "FutureEra"] `shouldBe` map Right allGroups
