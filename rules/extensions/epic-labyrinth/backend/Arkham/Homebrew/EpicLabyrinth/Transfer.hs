module Arkham.Homebrew.EpicLabyrinth.Transfer
  ( transferParcel
  , moveNativeGraph
  , originalOwner
  , returnToOriginalOwnerDiscard
  , detachReturningCards
  , connectedGroup
  , requireCardIdsFree
  ) where

import Arkham.Asset.Types (Asset, AssetAttrs (..), assetIsStory)
import Arkham.Card
import Arkham.Classes.Entity
import Arkham.Enemy.Types (Enemy, EnemyAttrs (..))
import Arkham.Entities (Entities (..))
import Arkham.Event.Types (Event, EventAttrs (eventCardsUnderneath, eventController))
import Arkham.Helpers (Deck (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared (StoryMemory (..), memory, remember)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Investigator.Types (Investigator, InvestigatorAttrs (..), investigatorClues, investigatorResources)
import Arkham.Placement
import Arkham.Prelude
import Arkham.Scenario.Types (Scenario, ScenarioAttrs (..))
import Arkham.Story.Types (Story, StoryAttrs (..))
import Arkham.Target
import Arkham.Token (Token (Clue, Resource))
import Arkham.Trait (Trait (Item))
import Arkham.Treachery.Types (Treachery)
import Data.Aeson qualified as Json
import Data.Aeson.Key qualified as Key
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set

-- This function is pure. The caller commits both resulting native games and
-- the event journal in one database transaction, then dispatches the receipt
-- messages. No half-transfer is observable when validation fails.
transferParcel :: Parcel -> Game -> Game -> Either Text (Game, Game)
transferParcel parcel sender receiver = do
  senderGroup <- connectedGroup sender
  receiverGroup <- connectedGroup receiver
  require (senderGroup == parcelOrigin parcel && receiverGroup == parcelDestination parcel
    && senderGroup /= receiverGroup) "Parcel does not belong to these two groups"
  let cargo = parcelCargo parcel
  require (cargoResources cargo >= 0 && cargoClues cargo >= 0) "Negative parcel tokens"
  requireDistinct $ map snapshotCardId (cargoEntities cargo)
    <> concatMap (toList . snapshotAttachments) (cargoEntities cargo)
  case parcelPermission parcel of
    ThroughVent -> transferVent parcel sender receiver
    ThroughRift identifier -> exchange RiftExchange identifier
    ThroughParadox identifier -> do
      require (cargoClues cargo == 0) "Paradox Effect cannot exchange clues"
      exchange ParadoxExchange identifier
    MoveJailor -> do
      require (map snapshotKind (cargoEntities cargo) == [Jailor] && emptyTokens cargo) "Invalid Jailor cargo"
      require (all ((== "70051") . snapshotCardCode) $ cargoEntities cargo) "Incorrect Jailor identity"
      moveNativeGraph (cargoEntities cargo) Nothing Nothing sender receiver
    MovePet -> Left "The Pet moves through the recipient's set-aside copy at the round barrier"
 where
  exchange kind identifier = do
    donor <- maybe (Left "Missing donor") Right $ parcelSender parcel
    recipient <- maybe (Left "Missing recipient") Right $ parcelRecipient parcel
    validateExchange kind identifier donor recipient parcel sender
    require (null $ cargoNotes $ parcelCargo parcel) "Private exchanges cannot transport Vent notes"
    require (all ((`elem` [HandCard, StoryAsset]) . snapshotKind) $ cargoEntities $ parcelCargo parcel) "Invalid exchange entity"
    validateLiving donor sender
    validateLiving recipient receiver
    (debited, credited) <- transferInvestigatorTokens donor recipient (parcelCargo parcel) sender receiver
    foldM (transferExchangeEntity donor recipient) (debited, credited) $ cargoEntities $ parcelCargo parcel

emptyTokens :: Cargo -> Bool
emptyTokens cargo = cargoResources cargo == 0 && cargoClues cargo == 0 && null (cargoNotes cargo)

validateExchange :: ExchangeKind -> ExchangeId -> InvestigatorId -> InvestigatorId -> Parcel -> Game -> Either Text ()
validateExchange kind identifier donor recipient parcel sender = do
  replica <- scenarioKey "epicLabyrinthReplica" sender
  active <- maybe (Left "Private exchange is not active") Right $
    find ((== identifier) . exchangeId) $ replicaExchanges replica
  require (exchangeKind active == kind && not (exchangeClosed active)) "Wrong or closed private exchange"
  require (Map.lookup (parcelOrigin parcel) (exchangeParticipants active) == Just donor
    && Map.lookup (parcelDestination parcel) (exchangeParticipants active) == Just recipient) "Incorrect exchange participants"
  require (parcelOrigin parcel `notElem` exchangeFinished active
    && parcelDestination parcel `notElem` exchangeFinished active) "An exchange participant already finished"

transferInvestigatorTokens :: InvestigatorId -> InvestigatorId -> Cargo -> Game -> Game -> Either Text (Game, Game)
transferInvestigatorTokens donor recipient cargo sender receiver = do
  a <- investigator donor sender
  b <- investigator recipient receiver
  let resources = cargoResources cargo
      clues = cargoClues cargo
  require (investigatorResources (toAttrs a) >= resources && investigatorClues (toAttrs a) >= clues) "Donor no longer has the offered tokens"
  let debit = overAttrs (changeInvestigatorTokens (-resources) (-clues)) a
      credit = overAttrs (changeInvestigatorTokens resources clues) b
  pure (putInvestigator debit sender, putInvestigator credit receiver)

changeInvestigatorTokens :: Int -> Int -> InvestigatorAttrs -> InvestigatorAttrs
changeInvestigatorTokens resources clues attrs = attrs {investigatorTokens =
  Map.insert Resource (investigatorResources attrs + resources)
    $ Map.insert Clue (investigatorClues attrs + clues) $ investigatorTokens attrs}

transferExchangeEntity :: InvestigatorId -> InvestigatorId -> (Game, Game) -> EntitySnapshot -> Either Text (Game, Game)
transferExchangeEntity donor recipient (sender, receiver) snapshot = case snapshotKind snapshot of
  HandCard -> do
    require (null (snapshotAttachedEntities snapshot) && null (snapshotAttachments snapshot)) "A hand card cannot carry attachments"
    a <- investigator donor sender
    b <- investigator recipient receiver
    card <- maybe (Left "Offered card is absent from donor's hand") Right $
      find ((== snapshotCardId snapshot) . toCardId) $ investigatorHand $ toAttrs a
    validateCardHeader sender snapshot card
    require (snapshotNative snapshot == toJSON card) "Offered hand card changed"
    requireCardIdsFree [snapshotCardId snapshot] receiver
    let a' = overAttrs (\attrs -> attrs {investigatorHand = filter ((/= snapshotCardId snapshot) . toCardId) $ investigatorHand attrs}) a
        b' = overAttrs (\attrs -> attrs {investigatorHand = investigatorHand attrs <> [card]}) b
    receiver' <- registerOwner snapshot $ putKnownCard card $ putInvestigator b' receiver
    pure (forgetKnownCard (snapshotCardId snapshot) $ putInvestigator a' sender, receiver')
  StoryAsset -> do
    native <- decodeRoot sender snapshot
    asset <- case native of NativeAsset a -> Right a; _ -> Left "Expected an asset"
    validateCardHeader sender snapshot $ toCard asset
    require (assetController (toAttrs asset) == Just donor && assetIsStory (toAttrs asset)) "Offered asset is not a controlled story asset"
    moveNativeGraph [snapshot] (Just recipient) (Just $ InPlayArea recipient) sender receiver
  _ -> Left "Entity cannot be exchanged privately"

transferVent :: Parcel -> Game -> Game -> Either Text (Game, Game)
transferVent parcel sender receiver = do
  require (isNothing $ parcelRecipient parcel) "The Vent sends to another Vent, not an investigator"
  require (all ((== ItemAsset) . snapshotKind) $ cargoEntities $ parcelCargo parcel) "Only Item cards pass through the Vent"
  origin <- vent sender
  destination <- vent receiver
  let cargo = parcelCargo parcel
      originAttrs = toAttrs origin
      destinationAttrs = toAttrs destination
      originMemory = memory originAttrs
      destinationMemory = memory destinationAttrs
  reserved <- maybe (Left "Vent shipment is not reserved") Right $ Map.lookup (parcelId parcel) $ pendingVentParcels originMemory
  require (toJSON reserved == toJSON cargo) "Vent shipment differs from reserved cargo"
  require (tokens Resource originAttrs >= cargoResources cargo && tokens Clue originAttrs >= cargoClues cargo) "Vent tokens are missing"
  require (null $ cargoNotes cargo \\ ventNotes originMemory) "Vent notes are missing"
  cards <- for (cargoEntities cargo) \snapshot -> do
    require (null (snapshotAttachedEntities snapshot) && null (snapshotAttachments snapshot)) "A Vent Item has left play and cannot keep attachments"
    card <- maybe (Left "Vent Item is not underneath the origin Vent") Right $
      find ((== snapshotCardId snapshot) . toCardId) $ storyCardsUnderneath originAttrs
    validateCardHeader sender snapshot card
    require (snapshotNative snapshot == toJSON card) "Vent Item changed"
    require (Item `elem` cdCardTraits (toCardDef card)) "Vent cargo is not an Item"
    require (any ((== snapshotCardId snapshot) . snapshotCardId) $ ventItems originMemory) "Vent Item metadata is missing"
    pure card
  let ids = map toCardId cards
  requireDistinct ids
  requireCardIdsFree ids receiver
  let origin' = overAttrs (\attrs -> (remember originMemory
          { ventItems = filter ((`notElem` ids) . snapshotCardId) $ ventItems originMemory
          , ventNotes = ventNotes originMemory \\ cargoNotes cargo
          } attrs)
          { storyTokens = changeStoryTokens (-cargoResources cargo) (-cargoClues cargo) attrs
          , storyCardsUnderneath = filter ((`notElem` ids) . toCardId) $ storyCardsUnderneath attrs
          }) origin
      destination' = overAttrs (\attrs -> (remember destinationMemory
          { ventItems = ventItems destinationMemory <> cargoEntities cargo
          , ventNotes = ventNotes destinationMemory <> cargoNotes cargo
          } attrs)
          { storyTokens = changeStoryTokens (cargoResources cargo) (cargoClues cargo) attrs
          , storyCardsUnderneath = storyCardsUnderneath attrs <> cards
          }) destination
      sender' = foldl' (flip forgetKnownCard) (putStory origin' sender) ids
      receiver' = foldl' (flip putKnownCard) (putStory destination' receiver) cards
  receiver'' <- foldM (flip registerOwner) receiver' $ cargoEntities cargo
  pure (sender', receiver'')

tokens :: Token -> StoryAttrs -> Int
tokens token = Map.findWithDefault 0 token . storyTokens

changeStoryTokens :: Int -> Int -> StoryAttrs -> Map Token Int
changeStoryTokens resources clues attrs = Map.insert Resource (tokens Resource attrs + resources)
  $ Map.insert Clue (tokens Clue attrs + clues) $ storyTokens attrs

-- Reusable native graph movement for another printed cross-group scenario.
-- Its caller validates that scenario's movement permission and participants.
-- Exact native entity snapshots and their complete attachment graph are always
-- checked against the origin and occupied destination IDs are always rejected.
moveNativeGraph :: [EntitySnapshot] -> Maybe InvestigatorId -> Maybe Placement -> Game -> Game -> Either Text (Game, Game)
moveNativeGraph snapshots controller placement sender receiver = do
  for_ controller $ flip validateLiving receiver
  roots <- traverse (decodeRoot sender) snapshots
  children <- concat <$> traverse (decodeAttachments sender) snapshots
  let rootsIds = map nativeCardId roots
      childrenIds = map nativeCardId children
      ids = rootsIds <> childrenIds
      physicalCards = [card | entity <- roots <> children, card <- nativeCard entity : nativeEmbeddedCards entity]
      allCards = Map.fromList [(toCardId card, Map.findWithDefault card (toCardId card) $ gameCards sender)
        | card <- physicalCards]
  requireDistinct ids
  requireDistinct $ map toCardId physicalCards
  requireCardIdsFree (Map.keys allCards) receiver
  let occupiedTargets = map nativeTarget $ allNative $ gameEntities receiver
  require (all ((`notElem` occupiedTargets) . nativeTarget) $ roots <> children)
    "Recipient already contains a native entity ID"
  let rootTargets = map nativeTarget roots
      childTargets = map nativeTarget children
      permittedTargets = rootTargets <> childTargets
  for_ children $ \child -> require (maybe False (`elem` permittedTargets) $ placementToAttached $ nativePlacement child) "Detached entity in attachment graph"
  let reachable targets =
        let next = targets <> [nativeTarget e | e <- children,
              nativeTarget e `notElem` targets,
              maybe False (`elem` targets) $ placementToAttached $ nativePlacement e]
        in if length next == length targets then targets else reachable next
  require (all ((`elem` reachable rootTargets) . nativeTarget) children) "Attachment graph is not rooted in the moved entity"
  requireGraphComplete roots children sender
  let movedRoots = map (moveRoot controller placement) roots
      sender' = foldl' (flip forgetKnownCard)
        (foldl' (flip removeNative) sender $ roots <> children) $ Map.keys allCards
      receiver' = foldl' (flip putKnownCard)
        (foldl' (flip installNative) receiver $ movedRoots <> children) $ Map.elems allCards
  receiver'' <- foldM (flip registerOwner) receiver' snapshots
  -- Owner records on player attachments travel independently of root ownership.
  provenance <- scenarioKeyDefault "epicLabyrinthOwners" mempty sender :: Either Text (Map CardId LabyrinthGroup)
  let ownerGroup card = Map.lookup (toCardId card) provenance <|> case (toCardOwner card, connectedGroup sender) of
        (Just _, Right group) -> Just group
        _ -> Nothing
  finalReceiver <- foldM (\game card -> maybe (Right game) (\group -> setScenarioMap "epicLabyrinthOwners" (toCardId card) group game) $ ownerGroup card) receiver'' $ Map.elems allCards
  controllerGroups <- scenarioKeyDefault "epicLabyrinthControllers" mempty sender :: Either Text (Map CardId (LabyrinthGroup, InvestigatorId))
  let originalController entity = case entity of
        NativeAsset asset -> assetController $ toAttrs asset
        NativeEvent event -> Just $ eventController $ toAttrs event
        _ -> Nothing
      controllerRecord entity = do
        iid <- originalController entity
        if nativeCardId entity `elem` rootsIds && isJust controller
          then (,iid) <$> either (const Nothing) Just (connectedGroup receiver)
          else Map.lookup (nativeCardId entity) controllerGroups
            <|> ((,iid) <$> either (const Nothing) Just (connectedGroup sender))
  withControllers <- foldM (\game entity -> maybe (Right game)
    (\record -> setScenarioMap "epicLabyrinthControllers" (nativeCardId entity) record game)
    $ controllerRecord entity) finalReceiver $ movedRoots <> children
  pure (sender', withControllers)

data NativeEntity = NativeAsset Asset | NativeEnemy Enemy | NativeEvent Event | NativeTreachery Treachery

decodeRoot :: Game -> EntitySnapshot -> Either Text NativeEntity
decodeRoot game snapshot = do
  kind <- case snapshotKind snapshot of
    StoryAsset -> Right "asset"
    Jailor -> Right "enemy"
    Pet -> Right "enemy"
    _ -> Left "Native graph root is not a live asset or enemy"
  entity <- nativeById kind (snapshotCardId snapshot) game
  require (nativeJSON entity == snapshotNative snapshot) "Native entity state changed before transfer"
  require (nativeCardId entity == snapshotCardId snapshot && toCardCode (nativeCard entity) == snapshotCardCode snapshot) "Native root identity differs from parcel header"
  require (toCardOwner (nativeCard entity) == snapshotOwner snapshot) "Native root owner differs from parcel header"
  when (isNothing $ snapshotOwner snapshot) $
    require (isNothing $ snapshotOwnerGroup snapshot) "Unowned native root has owner provenance"
  when (snapshotKind snapshot == StoryAsset) $ case entity of
    NativeAsset asset -> require (assetController (toAttrs asset) == snapshotController snapshot) "Native root controller differs from parcel header"
    _ -> Left "Expected a native asset"
  pure entity

decodeAttachments :: Game -> EntitySnapshot -> Either Text [NativeEntity]
decodeAttachments game snapshot = do
  children <- traverse decodeChild $ snapshotAttachedEntities snapshot
  require (setFromList (map nativeCardId children) == snapshotAttachments snapshot) "Attachment identities differ from parcel header"
  traverse_ (flip validateExisting game) children
  pure children
 where
  decodeChild value = do
    kind <- valueKey "kind" value :: Either Text Text
    cid <- valueKey "cardId" value
    native <- valueKey "native" value
    child <- nativeById kind cid game
    require (nativeJSON child == native) "Native attachment state changed before transfer"
    pure child

nativeById :: Text -> CardId -> Game -> Either Text NativeEntity
nativeById kind cid game = maybe (Left "Native entity is absent from origin") Right $
  find (\entity -> nativeCardId entity == cid && nativeKind entity == kind) $ allNative $ gameEntities game

nativeKind :: NativeEntity -> Text
nativeKind = \case
  NativeAsset _ -> "asset"
  NativeEnemy _ -> "enemy"
  NativeEvent _ -> "event"
  NativeTreachery _ -> "treachery"

validateExisting :: NativeEntity -> Game -> Either Text ()
validateExisting entity game = do
  let current = find ((== nativeCardId entity) . nativeCardId) $ allNative $ gameEntities game
  original <- maybe (Left "Native entity is absent from origin") Right current
  require (nativeJSON original == nativeJSON entity) "Native entity state changed before transfer"

requireGraphComplete :: [NativeEntity] -> [NativeEntity] -> Game -> Either Text ()
requireGraphComplete roots children game = do
  let moving = roots <> children
      targets = map nativeTarget moving
      declared = map nativeCardId children
      attached = [nativeCardId e | e <- allNative $ gameEntities game, maybe False (`elem` targets) $ placementToAttached $ nativePlacement e]
  require (all (`elem` declared) attached) "Attachment graph is incomplete"

moveRoot :: Maybe InvestigatorId -> Maybe Placement -> NativeEntity -> NativeEntity
moveRoot controller placement = \case
  NativeAsset asset -> NativeAsset $ overAttrs (\attrs -> attrs
    {assetController = controller <|> assetController attrs, assetPlacement = fromMaybe (assetPlacement attrs) placement}) asset
  NativeEnemy enemy -> NativeEnemy $ overAttrs (\attrs -> attrs
    {enemyPlacement = fromMaybe (enemyPlacement attrs) placement, enemyLastKnownLocation = case placement of
      Just (AtLocation lid) -> Just lid
      _ -> Nothing, enemyMovement = Nothing, enemyAttacking = Nothing, enemyWantsToAttack = False}) enemy
  entity -> entity

allNative :: Entities -> [NativeEntity]
allNative entities = map NativeAsset (toList $ entitiesAssets entities)
  <> map NativeEnemy (toList $ entitiesEnemies entities)
  <> map NativeEvent (toList $ entitiesEvents entities)
  <> map NativeTreachery (toList $ entitiesTreacheries entities)

nativeCard :: NativeEntity -> Card
nativeCard = \case
  NativeAsset a -> toCard a
  NativeEnemy e -> toCard e
  NativeEvent e -> toCard e
  NativeTreachery t -> toCard t

nativeCardId :: NativeEntity -> CardId
nativeCardId = toCardId . nativeCard

nativeEmbeddedCards :: NativeEntity -> [Card]
nativeEmbeddedCards = \case
  NativeAsset a -> assetCardsUnderneath $ toAttrs a
  NativeEnemy e -> enemyCardsUnderneath $ toAttrs e
  NativeEvent e -> eventCardsUnderneath $ toAttrs e
  NativeTreachery _ -> []

nativeTarget :: NativeEntity -> Target
nativeTarget = \case
  NativeAsset a -> toTarget a
  NativeEnemy e -> toTarget e
  NativeEvent e -> toTarget e
  NativeTreachery t -> toTarget t

nativePlacement :: NativeEntity -> Placement
nativePlacement = \case
  NativeAsset a -> a.placement
  NativeEnemy e -> e.placement
  NativeEvent e -> e.placement
  NativeTreachery t -> t.placement

nativeJSON :: NativeEntity -> Value
nativeJSON = \case
  NativeAsset a -> toJSON a
  NativeEnemy e -> toJSON e
  NativeEvent e -> toJSON e
  NativeTreachery t -> toJSON t

removeNative :: NativeEntity -> Game -> Game
removeNative entity game = forgetKnownCard (nativeCardId entity) game {gameEntities = case entity of
  NativeAsset a -> (gameEntities game) {entitiesAssets = Map.delete (toId a) $ entitiesAssets $ gameEntities game}
  NativeEnemy e -> (gameEntities game) {entitiesEnemies = Map.delete (toId e) $ entitiesEnemies $ gameEntities game}
  NativeEvent e -> (gameEntities game) {entitiesEvents = Map.delete (toId e) $ entitiesEvents $ gameEntities game}
  NativeTreachery t -> (gameEntities game) {entitiesTreacheries = Map.delete (toId t) $ entitiesTreacheries $ gameEntities game}}

installNative :: NativeEntity -> Game -> Game
installNative entity game = putKnownCard (nativeCard entity) game {gameEntities = case entity of
  NativeAsset a -> (gameEntities game) {entitiesAssets = Map.insert (toId a) a $ entitiesAssets $ gameEntities game}
  NativeEnemy e -> (gameEntities game) {entitiesEnemies = Map.insert (toId e) e $ entitiesEnemies $ gameEntities game}
  NativeEvent e -> (gameEntities game) {entitiesEvents = Map.insert (toId e) e $ entitiesEvents $ gameEntities game}
  NativeTreachery t -> (gameEntities game) {entitiesTreacheries = Map.insert (toId t) t $ entitiesTreacheries $ gameEntities game}}

validateCardHeader :: Game -> EntitySnapshot -> Card -> Either Text ()
validateCardHeader game snapshot card = do
  require (toCardId card == snapshotCardId snapshot && toCardCode card == snapshotCardCode snapshot
    && toCardOwner card == snapshotOwner snapshot) "Card identity or owner differs from parcel header"
  case toCardOwner card of
    Nothing -> require (isNothing $ snapshotOwnerGroup snapshot) "Unowned card has owner provenance"
    Just _ -> do
      group <- connectedGroup game
      owners <- scenarioKeyDefault "epicLabyrinthOwners" mempty game
      require (snapshotOwnerGroup snapshot == Just (Map.findWithDefault group (toCardId card) owners)) "Original owner group differs from parcel header"

registerOwner :: EntitySnapshot -> Game -> Either Text Game
registerOwner snapshot game = case snapshotOwnerGroup snapshot of
  Nothing -> Right game
  Just group -> setScenarioMap "epicLabyrinthOwners" (snapshotCardId snapshot) group game

originalOwner :: Card -> Game -> Either Text (Maybe (LabyrinthGroup, InvestigatorId))
originalOwner card game = case toCardOwner card of
  Nothing -> Right Nothing
  Just iid -> do
    group <- connectedGroup game
    owners <- scenarioKeyDefault "epicLabyrinthOwners" mempty game
    pure $ Just (Map.findWithDefault group (toCardId card) owners, iid)

-- The server calls this after ordinary leave-play/discard windows have resolved
-- for a foreign-owned player card. The original card goes to its owner's own
-- group even when the two groups use the same investigator code.
returnToOriginalOwnerDiscard :: Card -> Game -> Game -> Either Text (Game, Game)
returnToOriginalOwnerDiscard card current ownerGame = do
  (group, iid) <- originalOwner card current >>= maybe (Left "Card has no original investigator owner") Right
  destination <- connectedGroup ownerGame
  origin <- connectedGroup current
  require (group == destination && origin /= destination) "Wrong original owner group"
  let present = Map.lookup (toCardId card) (gameCards current)
        <|> find ((== toCardId card) . toCardId) (cardsInPlayZones current)
  native <- maybe (Left "Foreign-owned card is absent from its current group") Right present
  require (toJSON native == toJSON card) "Foreign-owned card changed before return"
  playerCard <- case card of PlayerCard c -> Right c; _ -> Left "Only an owned player card returns to an investigator discard"
  owner <- investigator iid ownerGame
  requireCardIdsFree [toCardId card] ownerGame
  let cid = toCardId card
      strip investigator' = overAttrs (\attrs -> attrs
        { investigatorHand = filter ((/= cid) . toCardId) $ investigatorHand attrs
        , investigatorDiscard = filter ((/= cid) . toCardId) $ investigatorDiscard attrs
        }) investigator'
      entities = (gameEntities current) {entitiesInvestigators = Map.map strip $ entitiesInvestigators $ gameEntities current}
      cleaned = foldl' (flip removeNative) current {gameEntities = entities}
        [e | e <- allNative entities, nativeCardId e == cid]
      returned = overAttrs (\attrs -> attrs {investigatorDiscard = investigatorDiscard attrs <> [playerCard]}) owner
  pure (forgetKnownCard cid cleaned, putKnownCard card $ putInvestigator returned ownerGame)

connectedGroup :: Game -> Either Text LabyrinthGroup
connectedGroup game = case replicaGroup <$> scenarioKey "epicLabyrinthReplica" game of
  Right group -> Right group
  Left _ -> do
    replica <- scenarioKey "epicMachinationsReplica" game :: Either Text Value
    era <- valueKey "currentEra" replica :: Either Text Text
    case era of
      "PastEra" -> Right GroupA
      "PresentEra" -> Right GroupB
      "FutureEra" -> Right GroupC
      _ -> Left "Unknown connected Machinations era"

-- Return messages have already passed the source's leave-play windows. Keep
-- the exact native Card in that message, checking its physical identity and
-- owner against the source before removing every live source-zone reference.
detachReturningCards :: [Card] -> Game -> Either Text Game
detachReturningCards cards game = do
  requireDistinct $ map toCardId cards
  for_ cards $ \card -> do
    let present = Map.lookup (toCardId card) (gameCards game)
          <|> find ((== toCardId card) . toCardId) (cardsInPlayZones game)
    native <- maybe (Left "Returning card is absent from its current group") Right present
    require (toCardCode native == toCardCode card && toCardOwner native == toCardOwner card)
      "Returning card identity or owner changed"
  let ids = map toCardId cards
      strip i = overAttrs (\attrs -> attrs
        {investigatorHand = filter ((`notElem` ids) . toCardId) $ investigatorHand attrs,
         investigatorDiscard = filter ((`notElem` ids) . toCardId) $ investigatorDiscard attrs,
         investigatorDeck = investigatorDeck attrs & (\deck -> deck {unDeck = filter ((`notElem` ids) . toCardId) $ unDeck deck})}) i
      entities = (gameEntities game)
        { entitiesInvestigators = Map.map strip $ entitiesInvestigators $ gameEntities game
        , entitiesStories = Map.map (overAttrs \attrs -> attrs
            {storyCardsUnderneath = filter ((`notElem` ids) . toCardId) $ storyCardsUnderneath attrs}) $ entitiesStories $ gameEntities game}
      changed = foldl' (flip removeNative) game {gameEntities = entities}
        [entity | entity <- allNative entities, nativeCardId entity `elem` ids]
      stripCache cached = cached
        { entitiesAssets = Map.filter ((`notElem` ids) . toCardId) $ entitiesAssets cached
        , entitiesEnemies = Map.filter ((`notElem` ids) . toCardId) $ entitiesEnemies cached
        , entitiesEvents = Map.filter ((`notElem` ids) . toCardId) $ entitiesEvents cached
        , entitiesTreacheries = Map.filter ((`notElem` ids) . toCardId) $ entitiesTreacheries cached
        }
  pure $ foldl' (flip forgetKnownCard) changed
    {gameInHandEntities = Map.map stripCache $ gameInHandEntities changed,
     gameInDiscardEntities = Map.map stripCache $ gameInDiscardEntities changed,
     gameInSearchEntities = stripCache $ gameInSearchEntities changed} ids

scenario :: Game -> Either Text Scenario
scenario game = case gameMode game of
  This _ -> Left "Game has no active scenario"
  That value -> Right value
  These _ value -> Right value

scenarioKey :: FromJSON a => Text -> Game -> Either Text a
scenarioKey key game = scenario game >>= valueKey key . scenarioMeta . toAttrs

scenarioKeyDefault :: FromJSON a => Text -> a -> Game -> Either Text a
scenarioKeyDefault key def game = do
  active <- scenario game
  case scenarioMeta $ toAttrs active of
    Object values -> maybe (Right def) decodeNative $ KeyMap.lookup (Key.fromText key) values
    _ -> Right def

setScenarioMap :: (Ord key, ToJSONKey key, FromJSONKey key, ToJSON value, FromJSON value) => Text -> key -> value -> Game -> Either Text Game
setScenarioMap name key value game = do
  existing <- scenarioKeyDefault name mempty game
  setScenarioKey name (toJSON $ Map.insert key value existing) game

setScenarioKey :: Text -> Value -> Game -> Either Text Game
setScenarioKey key value game = do
  active <- scenario game
  let changed = overAttrs (\attrs -> attrs {scenarioMeta = case scenarioMeta attrs of
        Object values -> Object $ KeyMap.insert (Key.fromText key) value values
        _ -> object [Key.fromText key .= value]}) active
  pure game {gameMode = case gameMode game of
    This campaign -> These campaign changed
    That _ -> That changed
    These campaign _ -> These campaign changed}

valueKey :: FromJSON a => Text -> Value -> Either Text a
valueKey key = \case
  Object values -> maybe (Left $ "Missing " <> key) decodeNative $ KeyMap.lookup (Key.fromText key) values
  _ -> Left "Expected a native object"

decodeNative :: FromJSON a => Value -> Either Text a
decodeNative value = case Json.fromJSON value of
  Json.Error message -> Left $ pack message
  Json.Success result -> Right result

require :: Bool -> Text -> Either Text ()
require True _ = Right ()
require False message = Left message

requireDistinct :: Ord a => [a] -> Either Text ()
requireDistinct values = require (length values == Set.size (Set.fromList values)) "Duplicate entity identity"

requireCardIdsFree :: [CardId] -> Game -> Either Text ()
requireCardIdsFree ids game = do
  let active = map nativeCardId (allNative $ gameEntities game)
        <> map toCardId (cardsInPlayZones game)
  require (all (\cid -> Map.notMember cid (gameCards game) && cid `notElem` active) ids) "Recipient already contains a parcel card ID"

cardsInPlayZones :: Game -> [Card]
cardsInPlayZones game = concatMap (\i -> investigatorHand (toAttrs i)
    <> map PlayerCard (investigatorDiscard $ toAttrs i)
    <> map PlayerCard ((investigatorDeck $ toAttrs i).cards)) (toList $ entitiesInvestigators $ gameEntities game)
  <> concatMap (storyCardsUnderneath . toAttrs) (toList $ entitiesStories $ gameEntities game)
  <> concatMap (\entity -> nativeCard entity : nativeEmbeddedCards entity) (allNative $ gameEntities game)

investigator :: InvestigatorId -> Game -> Either Text Investigator
investigator iid game = maybe (Left "Investigator is absent from this group") Right $ Map.lookup iid $ entitiesInvestigators $ gameEntities game

validateLiving :: InvestigatorId -> Game -> Either Text ()
validateLiving iid game = do
  attrs <- toAttrs <$> investigator iid game
  require (not (investigatorDefeated attrs || investigatorResigned attrs || investigatorEliminated attrs)) "Exchange investigator is eliminated"

putInvestigator :: Investigator -> Game -> Game
putInvestigator value game = game
  { gameEntities = (gameEntities game) {entitiesInvestigators = Map.insert (toId value) value $ entitiesInvestigators $ gameEntities game}
  , gameInHandEntities = Map.delete (toId value) $ gameInHandEntities game
  , gameInDiscardEntities = Map.delete (toId value) $ gameInDiscardEntities game
  }

vent :: Game -> Either Text Story
vent game = maybe (Left "This group has no Vent in play") Right $ Map.lookup (StoryId "70035") $ entitiesStories $ gameEntities game

putStory :: Story -> Game -> Game
putStory value game = game {gameEntities = (gameEntities game) {entitiesStories = Map.insert (toId value) value $ entitiesStories $ gameEntities game}}

forgetKnownCard :: CardId -> Game -> Game
forgetKnownCard cid game = game {gameCards = Map.delete cid $ gameCards game}

putKnownCard :: Card -> Game -> Game
putKnownCard card game = game {gameCards = Map.insert (toCardId card) card $ gameCards game}
