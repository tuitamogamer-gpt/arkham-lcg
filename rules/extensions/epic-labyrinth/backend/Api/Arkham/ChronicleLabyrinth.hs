{-# LANGUAGE OverloadedRecordDot #-}

-- Original transaction adapter. All participating games are locked in UUID
-- order before an answer is run. Transport, receipts and the authoritative
-- coordinator commit in the same SQL transaction as that answer.
module Api.Arkham.ChronicleLabyrinth where

import Api.Arkham.Epic (lookupGameEvent)
import Api.Arkham.Helpers (GameApp (..), runGameApp)
import Api.Arkham.Types.MultiplayerVariant
import Arkham.Card.CardCode (CardCode (..))
import Arkham.Classes.Entity (toAttrs)
import Arkham.Classes.HasQueue (newQueue)
import Arkham.Entities (Entities (..))
import Arkham.Epic.Types qualified as NativeEpic
import Arkham.Game
import Arkham.GameEnv
import Arkham.Game.State (GameState (..))
import Arkham.Homebrew.EpicLabyrinth.Coordinator qualified as Coordinator
import Arkham.Homebrew.EpicLabyrinth.Transfer (transferParcel)
import Arkham.Homebrew.EpicLabyrinth.ReturnBridge qualified as OwnerReturn
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Message
import Arkham.Phase (Phase (InvestigationPhase))
import Arkham.Prelude (fromJustNote)
import Arkham.Queue
import Arkham.Scenario.Types (ScenarioAttrs, getMetaKeyDefault)
import Control.Lens (view)
import Control.Monad (foldM)
import Control.Monad.Random (mkStdGen)
import Data.Aeson (Result (..), eitherDecodeStrict, encode, fromJSON)
import Data.ByteString.Lazy qualified as BSL
import Data.Map.Strict qualified as Map
import Data.List (partition)
import Data.Set qualified as Set
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import Data.These
import Data.Time.Clock
import Data.Time.Clock.POSIX (utcTimeToPOSIXSeconds)
import Data.Traversable (for)
import Database.Esqueleto.Experimental hiding (Value, update, (=.))
import Entity.Arkham.Step
import Import hiding (on, (==.))
import Import qualified as P

data SavedGroup = SavedGroup
  { savedId :: ArkhamGameId
  , savedName :: Text
  , savedGame :: Game
  , savedStep :: Int
  , savedVariant :: MultiplayerVariant
  , savedCreatedAt :: UTCTime
  , savedUpdatedAt :: UTCTime
  , savedQueue :: [Message]
  }
  deriving stock Generic
  deriving anyclass (ToJSON, FromJSON)

data UndoJournal = UndoJournal
  { journalState :: EventState
  , journalGroups :: [SavedGroup]
  , journalExpectedSteps :: [(ArkhamGameId, Int)]
  , journalRevision :: Int
  , journalTimer :: Maybe (Int, Int)
  }
  deriving stock Generic
  deriving anyclass (ToJSON, FromJSON)

jsonText :: ToJSON a => a -> Text
jsonText = Text.decodeUtf8 . BSL.toStrict . encode

decodeStored :: FromJSON a => Text -> a
decodeStored = either (error . ("Invalid Chronicle event journal: " <>) . Text.pack) id
  . eitherDecodeStrict . Text.encodeUtf8

isLabyrinthEvent :: ArkhamEpicEvent -> Bool
isLabyrinthEvent event = event.arkhamEpicEventScenarioId == Just "70001"

groupForOrdinal :: Int -> LabyrinthGroup
groupForOrdinal = \case
  0 -> GroupA
  1 -> GroupB
  2 -> GroupC
  _ -> error "Epic Labyrinth requires exactly groups A, B and C"

labyrinthGames :: MonadIO m => ArkhamEpicEventId -> ReaderT SqlBackend m [(LabyrinthGroup, ArkhamGameId)]
labyrinthGames eid = do
  groups <- P.selectList [ArkhamEpicGroupArkhamEpicEventId P.==. eid] [P.Asc ArkhamEpicGroupOrdinal]
  unless (map (arkhamEpicGroupOrdinal . entityVal) groups == [0, 1, 2])
    $ error "Epic Labyrinth requires exactly three groups"
  for groups \(Entity _ group) ->
    pure (groupForOrdinal group.arkhamEpicGroupOrdinal,
      fromJustNote "A Labyrinth group cannot lose its game" group.arkhamEpicGroupArkhamGameId)

-- Call before the ordinary single-game lock. Re-entrant row locks within one
-- transaction are safe; every event answer and undo uses this same ordering.
lockLabyrinthGames :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m ()
lockLabyrinthGames gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> do
    games <- labyrinthGames eid
    let ids = map snd games
    void $ select do
      game <- from $ table @ArkhamGame
      where_ $ game.id `in_` valList ids
      orderBy [asc game.id]
      locking forUpdate
      pure game.id
    void (rawSql "SELECT state::text FROM chronicle_labyrinth_events WHERE event_id = ? FOR UPDATE"
      [toPersistValue eid] :: MonadIO m => ReaderT SqlBackend m [Single Text])
  _ -> pure ()

loadGroup :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m SavedGroup
loadGroup gid = do
  game <- P.getJust gid
  step <- P.getBy $ UniqueStep gid game.arkhamGameStep
  pure $ SavedGroup gid game.arkhamGameName game.arkhamGameCurrentData
    game.arkhamGameStep game.arkhamGameMultiplayerVariant game.arkhamGameCreatedAt
    game.arkhamGameUpdatedAt (maybe [] (choiceMessages . arkhamStepChoice . entityVal) step)

scenarioMetaValue :: Game -> Maybe ScenarioAttrs
scenarioMetaValue game = case game.gameMode of
  That scenario -> Just $ toAttrs scenario
  These _ scenario -> Just $ toAttrs scenario
  _ -> Nothing

groupRequests :: Game -> [Request]
groupRequests game = maybe [] (getMetaKeyDefault "epicLabyrinthOutbox" []) (scenarioMetaValue game)

roster :: Game -> Set InvestigatorId
roster = Map.keysSet . entitiesInvestigators . gameEntities

loadCoordinator :: MonadIO m => ArkhamEpicEventId -> [(LabyrinthGroup, SavedGroup)] -> ReaderT SqlBackend m EventState
loadCoordinator eid groups = do
  rows <- rawSql "SELECT state::text FROM chronicle_labyrinth_events WHERE event_id = ? FOR UPDATE" [toPersistValue eid]
  let seats = Map.fromList [(group, roster saved.savedGame) | (group, saved) <- groups]
      fresh = either (error . show) id $ Coordinator.initialEvent
        $ Map.fromList [(group, Set.singleton $ InvestigatorId $ CardCode $ ":lobby:" <> tshow group) | group <- allGroups]
      initial = fresh {eventGroups = Map.map initialGroup seats}
      stored = case rows of
        [] -> initial
        Single value : _ -> decodeStored value
      -- The open lobbies fill asynchronously. Freeze each real roster once it
      -- exists, while retaining survival and all shared counters.
      hydrated = stored {eventGroups = Map.mapWithKey
        (\group prior -> let ids = Map.findWithDefault mempty group seats
          in if Set.null ids then prior else prior {groupInvestigators = ids}) stored.eventGroups}
  rawExecute "INSERT INTO chronicle_labyrinth_events(event_id,state) VALUES (?,?::jsonb) ON CONFLICT(event_id) DO NOTHING"
    [toPersistValue eid, toPersistValue $ jsonText hydrated]
  pure hydrated

labyrinthReplicaMessages :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m [Message]
labyrinthReplicaMessages gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> do
    members <- labyrinthGames eid
    groups <- for members \(group, id') -> (group,) <$> loadGroup id'
    state <- loadCoordinator eid groups
    current <- P.getJust gid
    when (current.arkhamGameCurrentData.gamePhase == InvestigationPhase
      && not current.arkhamGameCurrentData.gameInSetup
      && NativeEpic.sharedCounter NativeEpic.TimerStartedAt event.arkhamEpicEventSharedState == 0)
      $ error "All three Labyrinth groups must be ready before investigation actions"
    let origin = fst $ fromJustNote "Group missing from event" $ find ((== gid) . snd) members
        replica = either (error . show) id $ Coordinator.replicaFor origin state
    pure [ScenarioSpecific "epicLabyrinth.replica" $ toJSON replica]
  _ -> pure []

runInjected :: SavedGroup -> [Message] -> IO SavedGroup
runInjected saved messages = do
  let ending = any (\case
        ScenarioSpecific "epicLabyrinth.delivery" value -> case fromJSON @DeliveryEnvelope value of
          Success envelope -> case envelope.envelopeBody of ResolveTogether _ -> True; _ -> False
          Error _ -> False
        _ -> False) messages
      (bookkeeping, work) = partition (\case
        ScenarioSpecific kind _ -> kind `elem` ["epicLabyrinth.replica", "epicLabyrinth.ackRequests"]
        _ -> False) messages
      metaGame = foldl' (\game -> \case
        ScenarioSpecific "epicLabyrinth.replica" value -> setInitialScenarioMeta "epicLabyrinthReplica" (decodeValue @Replica value) game
        ScenarioSpecific "epicLabyrinth.ackRequests" value ->
          let ids = decodeValue @[OperationId] value
          in setInitialScenarioMeta "epicLabyrinthOutbox" (filter ((`notElem` ids) . requestId) $ groupRequests game) game
        _ -> game) saved.savedGame bookkeeping
      replicas = [message | message@(ScenarioSpecific "epicLabyrinth.replica" _) <- bookkeeping]
  -- Replica broadcasts update printed story/asset memory as well as scenario
  -- meta. They contain no choices. Preserve an existing question explicitly.
  game0 <- if ending || null replicas || metaGame.gameGameState `notElem` [IsActive]
    then pure $ if ending then metaGame {gameQuestion = mempty} else metaGame
    else do
      ref <- newIORef metaGame
      queue <- newQueue $ replicas <> [AskMap metaGame.gameQuestion | not $ null metaGame.gameQuestion]
      gen <- newIORef $ mkStdGen metaGame.gameSeed
      runGameApp (GameApp ref queue gen (pure . const ()) Nothing) $ runMessages (tshow saved.savedId) Nothing
      readIORef ref
  let mayInterrupt = null game0.gameQuestion || all waitingQuestion (Map.elems game0.gameQuestion)
  if null work then pure saved {savedGame = game0}
  else if not mayInterrupt then pure saved {savedGame = game0, savedQueue = saved.savedQueue <> work}
  else do
    gameRef <- newIORef game0
    -- A final retained ask stops the native loop without replacing an unrelated
    -- pending test or payment with a fresh investigation window. A delivery
    -- that asks its own question pauses before this saved continuation.
    queueRef <- newQueue $ work <> [AskMap game0.gameQuestion | not $ null game0.gameQuestion]
    genRef <- newIORef $ mkStdGen game0.gameSeed
    runGameApp (GameApp gameRef queueRef genRef (pure . const ()) Nothing)
      $ runMessages (tshow saved.savedId) Nothing
    game <- readIORef gameRef
    queue <- readIORef $ queueToRef queueRef
    pure saved {savedGame = game, savedQueue = queue <> if ending then [] else saved.savedQueue}
 where
  decodeValue :: FromJSON a => Value -> a
  decodeValue = \value -> case fromJSON value of
    Success result -> result
    Error problem -> error $ Text.pack problem
  waitingQuestion question =
    let text = jsonText question
    in "epicLabyrinth.wait" `Text.isInfixOf` text || "epicLabyrinth.exchange" `Text.isInfixOf` text

queuedDelivery :: DeliveryId -> SavedGroup -> Bool
queuedDelivery did = any isDelivery . savedQueue
 where
  isDelivery (ScenarioSpecific "epicLabyrinth.delivery" value) = case fromJSON @DeliveryEnvelope value of
    Success envelope -> envelope.envelopeId == did
    Error _ -> False
  isDelivery _ = False

-- The origin references already contain its answered game/remaining queue. No
-- participant is persisted until the entire bounded coordinator run succeeds.
reconcileLabyrinth :: MonadIO m => ArkhamGameId -> IORef Game -> Queue Message -> ReaderT SqlBackend m ()
reconcileLabyrinth gid originRef originQueue = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> do
    members <- labyrinthGames eid
    before <- for members \(group, id') -> (group,) <$> loadGroup id'
    state0 <- loadCoordinator eid before
    origin <- liftIO $ readIORef originRef
    queue <- liftIO $ readIORef $ queueToRef originQueue
    let groups0 = Map.fromList [(group, if saved.savedId == gid
          then saved {savedGame = origin, savedQueue = queue} else saved) | (group, saved) <- before]
        hydrated = state0 {eventGroups = Map.mapWithKey
          (\group prior -> let ids = roster $ (groups0 Map.! group).savedGame
            in if Set.null ids then prior else prior {groupInvestigators = ids}) state0.eventGroups}
    (state, groups) <- liftIO $ drain 0 hydrated groups0
    let foreignChanged = any (\(group, saved) -> saved.savedId /= gid
          && (toJSON saved.savedGame /= toJSON (groups Map.! group).savedGame
            || toJSON saved.savedQueue /= toJSON (groups Map.! group).savedQueue)) before
    unless (state == state0 && not foreignChanged) do
      now <- liftIO getCurrentTime
      lockedEvent <- P.getJust eid
      let shared = lockedEvent.arkhamEpicEventSharedState
          justReleased stage =
            maybe False barrierReleased (Map.lookup (StageBarrier stage) state.eventBarriers)
            && not (maybe False barrierReleased $ Map.lookup (StageBarrier stage) state0.eventBarriers)
          finished = isJust state.eventResolution || all (not . groupSurviving) (Map.elems state.eventGroups)
          previouslyFinished = isJust state0.eventResolution || all (not . groupSurviving) (Map.elems state0.eventGroups)
          timerChanges = justReleased 1 || justReleased 2 || finished /= previouslyFinished
          timerBefore = if timerChanges then Just
            (NativeEpic.sharedCounter NativeEpic.TimerStartedAt shared,
             NativeEpic.sharedCounter NativeEpic.TimeLimitMinutes shared) else Nothing
          nextShared
            | finished = NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes 0 shared
            | justReleased 1 || justReleased 2 = NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes 60
                $ NativeEpic.setSharedCounter NativeEpic.TimerStartedAt (floor $ utcTimeToPOSIXSeconds now) shared
            | otherwise = shared
      when timerChanges $ P.update eid [ArkhamEpicEventSharedState P.=. nextShared]
      let originBefore = snd $ fromJustNote "Origin missing" $ find ((== gid) . (.savedId) . snd) before
          expected = [(saved.savedId, saved.savedStep + 1) | saved <- Map.elems groups]
          journal = UndoJournal state0 (map snd before) expected state.eventRevision timerBefore
      rawExecute "INSERT INTO chronicle_labyrinth_journal(event_id,origin_game_id,origin_step,body) VALUES (?,?,?,?::jsonb)"
        [toPersistValue eid, toPersistValue gid, toPersistValue $ originBefore.savedStep + 1, toPersistValue $ jsonText journal]
      rawExecute "UPDATE chronicle_labyrinth_events SET state=?::jsonb, updated_at=now() WHERE event_id=?"
        [toPersistValue $ jsonText state, toPersistValue eid]
      for_ (Map.elems groups) \saved -> if saved.savedId == gid
        then liftIO do
          writeIORef originRef saved.savedGame
          writeIORef (queueToRef originQueue) saved.savedQueue
        else do
          P.replace saved.savedId $ ArkhamGame saved.savedName saved.savedGame
            (saved.savedStep + 1) saved.savedVariant saved.savedCreatedAt now
          P.insert_ $ ArkhamStep saved.savedId (Choice mempty saved.savedQueue)
            (saved.savedStep + 1) (ActionDiff $ view actionDiffL saved.savedGame)
  _ -> pure ()
 where
  drain n state groups
    | n >= 48 = error "Epic Labyrinth coordinator exceeded its transaction limit"
    | otherwise = do
        let returns = [(group, request) | (group, saved) <- Map.toList groups,
              request <- OwnerReturn.ownerReturnRequests saved.savedGame]
            pending = [(group, request) | (group, saved) <- Map.toList groups,
              request <- groupRequests saved.savedGame]
            deliverable group saved =
              [envelope | envelope <- Map.findWithDefault [] group state.eventDeliveries,
                saved.savedGame.gameGameState == IsActive, not saved.savedGame.gameInSetup,
                not $ queuedDelivery envelope.envelopeId saved,
                envelope.envelopeId `notElem` maybe [] (getMetaKeyDefault "epicLabyrinthApplied" []) (scenarioMetaValue saved.savedGame)]
        if null returns && null pending && all (\(group, saved) -> null $ deliverable group saved) (Map.toList groups)
          then pure (state, groups) else do
          (returnedState, returnedGroups) <- foldM applyReturn (state, groups) returns
          (next, transferred) <- foldM apply (returnedState, returnedGroups) pending
          updated <- for (Map.toList transferred) \(group, saved) -> do
            let acknowledgments = [request.requestId | (origin, request) <- pending, origin == group]
                replica = either (error . show) id $ Coordinator.replicaFor group next
                deliveries = [envelope | envelope <- Map.findWithDefault [] group next.eventDeliveries,
                  saved.savedGame.gameGameState == IsActive, not saved.savedGame.gameInSetup,
                  not $ queuedDelivery envelope.envelopeId saved,
                  envelope.envelopeId `notElem` maybe [] (getMetaKeyDefault "epicLabyrinthApplied" []) (scenarioMetaValue saved.savedGame)]
                messages = [ScenarioSpecific "epicLabyrinth.replica" $ toJSON replica]
                  <> [ScenarioSpecific "epicLabyrinth.ackRequests" $ toJSON acknowledgments | not $ null acknowledgments]
                  <> map (ScenarioSpecific "epicLabyrinth.delivery" . toJSON) deliveries
            (group,) <$> runInjected saved messages
          drain (n + 1) next $ Map.fromList updated
  applyReturn (state, groups) (origin, request) = do
    let sender = groups Map.! origin
        destination = returnOwnerGroup request.ownerReturnIntent
        recipient = groups Map.! destination
    if Set.member request.ownerReturnId state.eventAppliedOperations
      then pure (state, Map.insert origin sender
        {savedGame = OwnerReturn.acknowledgeOwnerReturn request.ownerReturnId sender.savedGame} groups)
      else do
        (sent, received, messages) <- either error pure
          $ OwnerReturn.transferOwnerReturn request sender.savedGame recipient.savedGame
        delivered <- runInjected recipient {savedGame = received} messages
        let next = state {eventAppliedOperations = Set.insert request.ownerReturnId state.eventAppliedOperations,
              eventRevision = state.eventRevision + 1}
        pure (next, Map.insert origin sender
          {savedGame = OwnerReturn.acknowledgeOwnerReturn request.ownerReturnId sent}
          $ Map.insert destination delivered groups)
  apply (state, groups) (origin, serialized) = do
    let request = serialized {requestOrigin = origin}
        wasApplied = Set.member request.requestId state.eventAppliedOperations
        next = either (error . ("Epic Labyrinth rejected operation: " <>) . show) id
          $ Coordinator.applyRequest request state
    case request.requestOperation of
      SendParcel parcel | not wasApplied -> do
        unless (parcel.parcelOrigin == origin) $ error "Parcel origin does not match event membership"
        let sender = groups Map.! origin
            recipient = groups Map.! parcel.parcelDestination
        (sent, received) <- either error pure
          $ transferParcel parcel sender.savedGame recipient.savedGame
        pure (next, Map.insert origin sender {savedGame = sent}
          $ Map.insert parcel.parcelDestination recipient {savedGame = received} groups)
      _ -> pure (next, groups)

-- Undo restores the coupled state only if no other group has subsequently
-- acted. Otherwise a local rewind would erase another player's decisions.
-- This check and the restore occur under the same ordered participant locks.
undoLabyrinthStep :: MonadIO m => ArkhamGameId -> Int -> ReaderT SqlBackend m ()
undoLabyrinthStep gid step = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> do
    rows <- rawSql "SELECT body::text FROM chronicle_labyrinth_journal WHERE origin_game_id=? AND origin_step=? FOR UPDATE"
      [toPersistValue gid, toPersistValue step]
    for_ rows \(Single value) -> do
      let journal = decodeStored @UndoJournal value
      current <- for (journal.journalGroups) \saved -> loadGroup saved.savedId
      stored <- rawSql "SELECT state::text FROM chronicle_labyrinth_events WHERE event_id=? FOR UPDATE" [toPersistValue eid]
      let state = decodeStored @EventState $ unSingle $ fromJustNote "Coordinator disappeared" $ listToMaybe stored
      unless (state.eventRevision == journal.journalRevision
        && all (\saved -> saved.savedId == gid || Map.lookup saved.savedId (Map.fromList journal.journalExpectedSteps) == Just saved.savedStep) current)
        $ error "Cannot undo this exchange after another group has continued"
      for_ journal.journalGroups \saved -> when (saved.savedId /= gid) do
        -- Move the cursor before trimming future steps (native deletion trigger).
        P.replace saved.savedId $ ArkhamGame saved.savedName saved.savedGame saved.savedStep
          saved.savedVariant saved.savedCreatedAt saved.savedUpdatedAt
        P.deleteWhere [ArkhamStepArkhamGameId P.==. saved.savedId, ArkhamStepStep P.>. saved.savedStep]
      rawExecute "UPDATE chronicle_labyrinth_events SET state=?::jsonb,updated_at=now() WHERE event_id=?"
        [toPersistValue $ jsonText journal.journalState, toPersistValue eid]
      for_ journal.journalTimer \(startedAt, minutes) -> do
        parent <- P.getJust eid
        let restored = NativeEpic.setSharedCounter NativeEpic.TimerStartedAt startedAt
              $ NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes minutes parent.arkhamEpicEventSharedState
        P.update eid [ArkhamEpicEventSharedState P.=. restored]
      rawExecute "DELETE FROM chronicle_labyrinth_journal WHERE origin_game_id=? AND origin_step=?"
        [toPersistValue gid, toPersistValue step]
  _ -> pure ()

-- Used after commit so all subscribed tables receive their new durable state.
labyrinthParticipantIds :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m [ArkhamGameId]
labyrinthParticipantIds gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> map snd <$> labyrinthGames eid
  _ -> pure []

labyrinthSharedSnapshot :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m (Maybe (ArkhamEpicEventId, NativeEpic.SharedEventState))
labyrinthSharedSnapshot gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isLabyrinthEvent event -> pure $ Just (eid, event.arkhamEpicEventSharedState)
  _ -> pure Nothing

-- Expiry marks every surviving group together; the native gate advances its
-- agenda at that group's next mythos, after the round/stage barriers. Repeated
-- timer callbacks do not create duplicate steps or reset a player's question.
expireLabyrinth :: MonadIO m => ArkhamEpicEventId -> ReaderT SqlBackend m (Maybe [(ArkhamGameId, ArkhamGame)])
expireLabyrinth eid = do
  parent <- P.getJust eid
  if not $ isLabyrinthEvent parent then pure Nothing else do
    members <- labyrinthGames eid
    lockLabyrinthGames $ snd $ fromJustNote "Event has no groups" $ listToMaybe members
    groups <- for members \(group, gid) -> (group,) <$> loadGroup gid
    state <- loadCoordinator eid groups
    if isJust state.eventResolution then pure $ Just [] else do
      now <- liftIO getCurrentTime
      changed <- for groups \(_, saved) -> case scenarioMetaValue saved.savedGame of
        Just attrs | saved.savedGame.gameGameState == IsActive
          && getMetaKeyDefault "epicLabyrinthStage" (1 :: Int) attrs <= 3
          && not (getMetaKeyDefault "epicLabyrinthTimeExpired" False attrs) -> do
            let next = saved {savedGame = setInitialScenarioMeta "epicLabyrinthTimeExpired" True saved.savedGame}
                game' = ArkhamGame next.savedName next.savedGame (next.savedStep + 1)
                  next.savedVariant next.savedCreatedAt now
            P.replace next.savedId game'
            P.insert_ $ ArkhamStep next.savedId (Choice mempty next.savedQueue)
              (next.savedStep + 1) (ActionDiff $ view actionDiffL next.savedGame)
            pure $ Just (next.savedId, game')
        _ -> pure Nothing
      pure $ Just $ catMaybes changed
