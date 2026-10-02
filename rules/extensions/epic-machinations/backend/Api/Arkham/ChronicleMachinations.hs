{-# LANGUAGE OverloadedRecordDot #-}

-- Original three-era transaction adapter. Physical effects commit together;
-- queued receipts never repeat them or replace a pending player decision.
module Api.Arkham.ChronicleMachinations where

import Api.Arkham.Epic (lookupGameEvent)
import Api.Arkham.Helpers (GameApp (..), runGameApp)
import Api.Arkham.ChronicleLabyrinth (SavedGroup (..), loadGroup, scenarioMetaValue, roster, jsonText, decodeStored)
import Arkham.Card.CardCode (CardCode (..))
import Arkham.Classes.HasQueue (newQueue)
import Arkham.Entities (Entities (..))
import Arkham.Epic.Types qualified as NativeEpic
import Arkham.Game
import Arkham.GameEnv
import Arkham.Game.State (GameState (..))
import Arkham.Homebrew.EpicLabyrinth.ReturnBridge qualified as OwnerReturn
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Types (LabyrinthGroup (..), OperationId, DeliveryId)
import Arkham.Homebrew.EpicMachinations.Coordinator qualified as Coordinator
import Arkham.Homebrew.EpicMachinations.Transactions qualified as Physical
import Arkham.Homebrew.EpicMachinations.Transport (moveEdwin, edwinInteractionPending)
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Message
import Arkham.Phase (Phase (InvestigationPhase))
import Arkham.Prelude (fromJustNote)
import Arkham.Queue
import Arkham.Scenario.Types (getMetaKeyDefault)
import Control.Lens (view)
import Control.Monad (foldM)
import Control.Monad.Random (mkStdGen)
import Data.Aeson (Result (..), fromJSON)
import Data.List (partition)
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import Data.Text qualified as Text
import Data.Time.Clock
import Data.Traversable (for)
import Database.Esqueleto.Experimental hiding (Value, update, isNothing, (=.))
import Entity.Arkham.Step
import Import hiding (on, (==.))
import Import qualified as P

data MachinationsJournal = MachinationsJournal
  { journalState :: MachinationsState
  , journalGroups :: [SavedGroup]
  , journalExpectedSteps :: [(ArkhamGameId, Int)]
  , journalRevision :: Int
  , journalTimer :: Maybe (Int, Int)
  }
  deriving stock Generic
  deriving anyclass (ToJSON, FromJSON)

isMachinationsEvent event = event.arkhamEpicEventScenarioId == Just "87001"
eraForOrdinal = \case
  0 -> PastEra
  1 -> PresentEra
  2 -> FutureEra
  _ -> error "Machinations requires exactly Past, Present and Future"
eraForOwnerGroup = \case GroupA -> PastEra; GroupB -> PresentEra; GroupC -> FutureEra

machinationsGames :: MonadIO m => ArkhamEpicEventId -> ReaderT SqlBackend m [(Era, ArkhamGameId)]
machinationsGames eid = do
  groups <- P.selectList [ArkhamEpicGroupArkhamEpicEventId P.==. eid] [P.Asc ArkhamEpicGroupOrdinal]
  unless (map (arkhamEpicGroupOrdinal . entityVal) groups == [0, 1, 2]) $ error "Machinations requires exactly three eras"
  for groups \(Entity _ group) -> pure (eraForOrdinal group.arkhamEpicGroupOrdinal,
    fromJustNote "An era cannot lose its game" group.arkhamEpicGroupArkhamGameId)

lockMachinationsGames :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m ()
lockMachinationsGames gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> do
    games <- machinationsGames eid
    void $ select do
      game <- from $ table @ArkhamGame
      where_ $ game.id `in_` valList (map snd games)
      orderBy [asc game.id]
      locking forUpdate
      pure game.id
    void (rawSql "SELECT state::text FROM chronicle_machinations_events WHERE event_id=? FOR UPDATE"
      [toPersistValue eid] :: MonadIO m => ReaderT SqlBackend m [Single Text])
  _ -> pure ()

eraRequests game = maybe [] (getMetaKeyDefault "epicMachinationsOutbox" []) $ scenarioMetaValue game

loadCoordinator :: MonadIO m => ArkhamEpicEventId -> [(Era, SavedGroup)] -> ReaderT SqlBackend m MachinationsState
loadCoordinator eid groups = do
  parent <- P.getJust eid
  rows <- rawSql "SELECT state::text FROM chronicle_machinations_events WHERE event_id=? FOR UPDATE" [toPersistValue eid]
  let initial = either (error . show) id $ Coordinator.initialMachinations $ Map.fromList
        [(era, Set.singleton $ InvestigatorId $ CardCode $ ":lobby:" <> tshow era) | era <- allEras]
      fresh = initial {machinationsGlobalPlayers = parent.arkhamEpicEventTotalInvestigators,
        machinationsBossHealth = 6 * parent.arkhamEpicEventTotalInvestigators,
        machinationsBossRemaining = 6 * parent.arkhamEpicEventTotalInvestigators}
      stored = case rows of [] -> fresh; Single value : _ -> decodeStored value
      hydrated = stored {machinationsEras = Map.fromList
        [(era, (Map.findWithDefault (EraProgress mempty False mempty 0 False False) era stored.machinationsEras)
          {eraInvestigators = roster saved.savedGame}) | (era, saved) <- groups]}
  rawExecute "INSERT INTO chronicle_machinations_events(event_id,state) VALUES (?,?::jsonb) ON CONFLICT(event_id) DO NOTHING"
    [toPersistValue eid, toPersistValue $ jsonText hydrated]
  pure hydrated

machinationsReplicaMessages :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m [Message]
machinationsReplicaMessages gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> do
    members <- machinationsGames eid
    groups <- for members \(era, id') -> (era,) <$> loadGroup id'
    state <- loadCoordinator eid groups
    current <- P.getJust gid
    when (current.arkhamGameCurrentData.gamePhase == InvestigationPhase
      && not current.arkhamGameCurrentData.gameInSetup
      && NativeEpic.sharedCounter NativeEpic.TimerStartedAt event.arkhamEpicEventSharedState == 0)
      $ error "All three eras must be ready before investigation actions"
    let origin = fst $ fromJustNote "Era missing" $ find ((== gid) . snd) members
        replica = either (error . show) id $ Coordinator.machinationsReplicaFor origin state
    pure [ScenarioSpecific "epicMachinations.replica" $ toJSON replica]
  _ -> pure []

runInjected :: SavedGroup -> [Message] -> IO SavedGroup
runInjected saved messages = do
  let ending = any (\case
        ScenarioSpecific "epicMachinations.delivery" value -> case fromJSON @MachinationsEnvelope value of
          Success envelope -> case envelope.machinationsDeliveryBody of ResolveTimeline _ _ -> True; _ -> False
          Error _ -> False
        _ -> False) messages
      (bookkeeping, work) = partition (\case
        ScenarioSpecific kind _ -> kind `elem` ["epicMachinations.replica", "epicMachinations.ackRequests"]
        _ -> False) messages
      metaGame = foldl' (\game -> \case
        ScenarioSpecific "epicMachinations.replica" value -> setInitialScenarioMeta "epicMachinationsReplica" (decodeValue @MachinationsReplica value) game
        ScenarioSpecific "epicMachinations.ackRequests" value ->
          let ids = decodeValue @[OperationId] value
          in setInitialScenarioMeta "epicMachinationsOutbox" (filter ((`notElem` ids) . machinationsRequestId) $ eraRequests game) game
        _ -> game) saved.savedGame bookkeeping
      replicas = [message | message@(ScenarioSpecific "epicMachinations.replica" _) <- bookkeeping]
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
    -- A global printed ending discards the interrupted test/action continuation.
    -- Any new native resolution/reward question and its queue remain intact.
    pure saved {savedGame = game, savedQueue = queue <> if ending then [] else saved.savedQueue}
 where
  decodeValue :: FromJSON a => Value -> a
  decodeValue = \value -> case fromJSON value of
    Success result -> result
    Error problem -> error $ Text.pack problem
  waitingQuestion question =
    let text = jsonText question
    in "epicMachinations.wait" `Text.isInfixOf` text || "epicMachinations.waitSetup" `Text.isInfixOf` text

queuedDelivery :: DeliveryId -> SavedGroup -> Bool
queuedDelivery did = any isDelivery . savedQueue
 where
  isDelivery (ScenarioSpecific "epicMachinations.delivery" value) = case fromJSON @MachinationsEnvelope value of
    Success envelope -> envelope.machinationsDeliveryId == did
    Error _ -> False
  isDelivery _ = False


reconcileMachinations :: MonadIO m => ArkhamGameId -> IORef Game -> Queue Message -> ReaderT SqlBackend m ()
reconcileMachinations gid originRef originQueue = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> do
    members <- machinationsGames eid
    before <- for members \(era, id') -> (era,) <$> loadGroup id'
    state0 <- loadCoordinator eid before
    origin <- liftIO $ readIORef originRef
    queue <- liftIO $ readIORef $ queueToRef originQueue
    let groups0 = Map.fromList [(era, if saved.savedId == gid
          then saved {savedGame = origin, savedQueue = queue} else saved) | (era, saved) <- before]
    (state, groups) <- liftIO $ drain 0 state0 groups0
    let foreignChanged = any (\(era, saved) -> saved.savedId /= gid
          && (toJSON saved.savedGame /= toJSON (groups Map.! era).savedGame
            || toJSON saved.savedQueue /= toJSON (groups Map.! era).savedQueue)) before
    unless (state == state0 && not foreignChanged) do
      now <- liftIO getCurrentTime
      parent <- P.getJust eid
      let timerChanges = isJust state.machinationsResolution && isNothing state0.machinationsResolution
          timerBefore = if timerChanges then Just
            (NativeEpic.sharedCounter NativeEpic.TimerStartedAt parent.arkhamEpicEventSharedState,
             NativeEpic.sharedCounter NativeEpic.TimeLimitMinutes parent.arkhamEpicEventSharedState) else Nothing
          expected = [(saved.savedId, saved.savedStep + 1) | saved <- Map.elems groups]
          actorBefore = snd $ fromJustNote "Actor missing" $ find ((== gid) . (.savedId) . snd) before
          journal = MachinationsJournal state0 (map snd before) expected state.machinationsRevision timerBefore
      when timerChanges $ P.update eid [ArkhamEpicEventSharedState P.=.
        NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes 0 parent.arkhamEpicEventSharedState]
      rawExecute "INSERT INTO chronicle_machinations_journal(event_id,origin_game_id,origin_step,body) VALUES (?,?,?,?::jsonb)"
        [toPersistValue eid, toPersistValue gid, toPersistValue $ actorBefore.savedStep + 1, toPersistValue $ jsonText journal]
      rawExecute "UPDATE chronicle_machinations_events SET state=?::jsonb,updated_at=now() WHERE event_id=?"
        [toPersistValue $ jsonText state, toPersistValue eid]
      for_ (Map.elems groups) \saved -> if saved.savedId == gid
        then liftIO do
          writeIORef originRef saved.savedGame
          writeIORef (queueToRef originQueue) saved.savedQueue
        else persistGroup now saved
  _ -> pure ()

persistGroup :: MonadIO m => UTCTime -> SavedGroup -> ReaderT SqlBackend m ()
persistGroup now saved = do
  P.replace saved.savedId $ ArkhamGame saved.savedName saved.savedGame (saved.savedStep + 1)
    saved.savedVariant saved.savedCreatedAt now
  P.insert_ $ ArkhamStep saved.savedId (Choice mempty saved.savedQueue)
    (saved.savedStep + 1) (ActionDiff $ view actionDiffL saved.savedGame)

-- Shared-story installation can execute during setup: EndSetup is explicitly
-- waiting for those same two deliveries. Other work retains setup checkpoints.
eligibleDelivery saved envelope = saved.savedGame.gameGameState == IsActive
  && (not saved.savedGame.gameInSetup || case envelope.machinationsDeliveryBody of InstallSharedStory _ -> True; _ -> False)
  && not (queuedDelivery envelope.machinationsDeliveryId saved)
  && envelope.machinationsDeliveryId `notElem`
    maybe [] (getMetaKeyDefault "epicLabyrinthApplied" []) (scenarioMetaValue saved.savedGame)

drain :: Int -> MachinationsState -> Map Era SavedGroup -> IO (MachinationsState, Map Era SavedGroup)
drain n state groups
  | n >= 64 = error "Machinations coordinator exceeded its transaction limit"
  | otherwise = do
      let returns = [(era, request) | (era, saved) <- Map.toList groups,
            request <- OwnerReturn.ownerReturnRequests saved.savedGame]
          pending = [(era, request) | (era, saved) <- Map.toList groups, request <- eraRequests saved.savedGame]
          available era saved = filter (eligibleDelivery saved) $ Map.findWithDefault [] era state.machinationsDeliveries
      if null returns && null pending && all (\(era, saved) -> null $ available era saved) (Map.toList groups)
        then pure (state, groups) else do
        (returned, returnedGroups) <- foldM applyReturn (state, groups) returns
        (next, physical) <- foldM apply (returned, returnedGroups) pending
        updated <- for (Map.toList physical) \(era, saved) -> do
          let acknowledgments = [request.machinationsRequestId | (origin, request) <- pending, origin == era]
              replica = either (error . show) id $ Coordinator.machinationsReplicaFor era next
              deliveries = filter (eligibleDelivery saved) $ Map.findWithDefault [] era next.machinationsDeliveries
              messages = [ScenarioSpecific "epicMachinations.replica" $ toJSON replica]
                <> [ScenarioSpecific "epicMachinations.ackRequests" $ toJSON acknowledgments | not $ null acknowledgments]
                <> map (ScenarioSpecific "epicMachinations.delivery" . toJSON) deliveries
          (era,) <$> runInjected saved messages
        drain (n + 1) next $ Map.fromList updated
 where
  refresh current worlds = current {machinationsEras = Map.mapWithKey
    (\era saved -> Physical.nativeEraProgress era saved.savedGame) worlds}
  apply (current, worlds) (origin, serialized) = do
    let operation = case serialized.machinationsRequestOperation of
          ReportProgress _ -> ReportProgress $ Physical.nativeEraProgress origin (worlds Map.! origin).savedGame
          other -> other
        request = serialized {machinationsRequestEra = origin, machinationsRequestOperation = operation}
        authoritative = case operation of
          CheckTimeline -> refresh current worlds
          FailTimeline -> refresh current worlds
          DepositTindalosClue _ -> refresh current worlds
          TakeTindalosClue _ _ -> refresh current worlds
          _ -> current
        duplicate = Set.member request.machinationsRequestId current.machinationsApplied
        next = either (error . ("Machinations rejected operation: " <>) . show) id
          $ Coordinator.applyMachinationsRequest request authoritative
        actor = worlds Map.! origin
    if duplicate then pure (next, worlds) else case operation of
      DepositTindalosClue iid -> do
        changed <- either error pure $ Physical.depositTindalosClue iid actor.savedGame
        pure (next, Map.insert origin actor {savedGame = changed} worlds)
      TakeTindalosClue iid source -> do
        let donor = worlds Map.! source
        (taken, received) <- either error pure $ Physical.takeTindalosClue iid donor.savedGame actor.savedGame
        let merged = received {gameEntities = (gameEntities received)
              {entitiesLocations = entitiesLocations $ gameEntities taken}}
        pure (next, if source == origin then Map.insert origin actor {savedGame = merged} worlds
          else Map.insert origin actor {savedGame = received} $ Map.insert source donor {savedGame = taken} worlds)
      DamageTyrthrha _ -> pure (next, Map.map (\saved -> saved
        {savedGame = Physical.setSharedTyrthrha next.machinationsBossHealth next.machinationsBossRemaining saved.savedGame}) worlds)
      HealTyrthrha _ -> pure (next, Map.map (\saved -> saved
        {savedGame = Physical.setSharedTyrthrha next.machinationsBossHealth next.machinationsBossRemaining saved.savedGame}) worlds)
      BringEdwin iid lid -> do
        let candidates = [(era, saved) | (era, saved) <- Map.toList worlds,
              let progress = Physical.nativeEraProgress era saved.savedGame,
              progress.eraEdwinAsset || progress.eraEdwinEnemy]
        case candidates of
          [(source, donor)] | source /= origin -> do
            when (edwinInteractionPending donor.savedGame donor.savedQueue)
              $ error "Finish the native interaction with Edwin before moving him to another era"
            (sent, received) <- either error pure $ moveEdwin iid lid donor.savedGame actor.savedGame
            pure (next, Map.insert source donor {savedGame = sent} $ Map.insert origin actor {savedGame = received} worlds)
          [(source, donor)] | source == origin -> do
            when (edwinInteractionPending donor.savedGame donor.savedQueue)
              $ error "Finish the native interaction with Edwin before moving him"
            (_, received) <- either error pure $ moveEdwin iid lid donor.savedGame actor.savedGame
            pure (next, Map.insert origin actor {savedGame = received} worlds)
          _ -> error "Edwin must exist as one actual entity in exactly one era"
      _ -> pure (next, worlds)
  applyReturn (current, worlds) (origin, request) = do
    let sender = worlds Map.! origin
        destination = eraForOwnerGroup request.ownerReturnIntent.returnOwnerGroup
        recipient = worlds Map.! destination
    if Set.member request.ownerReturnId current.machinationsApplied
      then pure (current, Map.insert origin sender
        {savedGame = OwnerReturn.acknowledgeOwnerReturn request.ownerReturnId sender.savedGame} worlds)
      else do
        (sent, received, messages) <- either error pure
          $ OwnerReturn.transferOwnerReturn request sender.savedGame recipient.savedGame
        delivered <- runInjected recipient {savedGame = received} messages
        let next = current {machinationsApplied = Set.insert request.ownerReturnId current.machinationsApplied,
              machinationsRevision = current.machinationsRevision + 1}
        pure (next, Map.insert origin sender
          {savedGame = OwnerReturn.acknowledgeOwnerReturn request.ownerReturnId sent}
          $ Map.insert destination delivered worlds)

undoMachinationsStep :: MonadIO m => ArkhamGameId -> Int -> ReaderT SqlBackend m ()
undoMachinationsStep gid step = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> do
    rows <- rawSql "SELECT body::text FROM chronicle_machinations_journal WHERE origin_game_id=? AND origin_step=? FOR UPDATE"
      [toPersistValue gid, toPersistValue step]
    for_ rows \(Single value) -> do
      let journal = decodeStored @MachinationsJournal value
      current <- for (journal.journalGroups) \saved -> loadGroup saved.savedId
      stored <- rawSql "SELECT state::text FROM chronicle_machinations_events WHERE event_id=? FOR UPDATE" [toPersistValue eid]
      let state = decodeStored @MachinationsState $ unSingle $ fromJustNote "Coordinator disappeared" $ listToMaybe stored
      unless (state.machinationsRevision == journal.journalRevision
        && all (\saved -> saved.savedId == gid || Map.lookup saved.savedId (Map.fromList journal.journalExpectedSteps) == Just saved.savedStep) current)
        $ error "Cannot undo this timeline effect after another group has continued"
      for_ journal.journalGroups \saved -> when (saved.savedId /= gid) do
        -- Move the cursor before trimming future steps (native deletion trigger).
        P.replace saved.savedId $ ArkhamGame saved.savedName saved.savedGame saved.savedStep
          saved.savedVariant saved.savedCreatedAt saved.savedUpdatedAt
        P.deleteWhere [ArkhamStepArkhamGameId P.==. saved.savedId, ArkhamStepStep P.>. saved.savedStep]
      rawExecute "UPDATE chronicle_machinations_events SET state=?::jsonb,updated_at=now() WHERE event_id=?"
        [toPersistValue $ jsonText journal.journalState, toPersistValue eid]
      for_ journal.journalTimer \(startedAt, minutes) -> do
        parent <- P.getJust eid
        let restored = NativeEpic.setSharedCounter NativeEpic.TimerStartedAt startedAt
              $ NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes minutes parent.arkhamEpicEventSharedState
        P.update eid [ArkhamEpicEventSharedState P.=. restored]
      rawExecute "DELETE FROM chronicle_machinations_journal WHERE origin_game_id=? AND origin_step=?"
        [toPersistValue gid, toPersistValue step]
  _ -> pure ()

-- Used after commit so all subscribed tables receive their new durable state.
machinationsParticipantIds :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m [ArkhamGameId]
machinationsParticipantIds gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> map snd <$> machinationsGames eid
  _ -> pure []

machinationsSharedSnapshot :: MonadIO m => ArkhamGameId -> ReaderT SqlBackend m (Maybe (ArkhamEpicEventId, NativeEpic.SharedEventState))
machinationsSharedSnapshot gid = lookupGameEvent gid >>= \case
  Just (Entity eid event, _) | isMachinationsEvent event -> pure $ Just (eid, event.arkhamEpicEventSharedState)
  _ -> pure Nothing

-- Immediate printed expiry ends the unfinished decision and advances agenda2B.
-- An external clock establishes an undo floor, without an undoable actor entry.
setGameUndoFloor :: MonadIO m => ArkhamGameId -> Int -> ReaderT SqlBackend m ()
setGameUndoFloor gid step = void $ P.upsertBy
  (UniqueGameUndoFloor gid)
  (ArkhamGameUndoFloor gid step)
  [ArkhamGameUndoFloorFloorStep P.=. step]

expireMachinations :: MonadIO m => ArkhamEpicEventId -> ReaderT SqlBackend m (Maybe [(ArkhamGameId, ArkhamGame)])
expireMachinations eid = do
  parent <- P.getJust eid
  if not $ isMachinationsEvent parent then pure Nothing else do
    members <- machinationsGames eid
    lockMachinationsGames $ snd $ fromJustNote "Event has no eras" $ listToMaybe members
    before <- for members \(era, gid) -> (era,) <$> loadGroup gid
    state <- loadCoordinator eid before
    if isJust state.machinationsResolution then pure $ Just [] else do
      triggered <- liftIO $ for before \(era, saved) -> do
        let terminated = saved {savedGame = saved.savedGame {gameQuestion = mempty}, savedQueue = []}
        (era,) <$> runInjected terminated [ScenarioSpecific "epicMachinations.timeExpired" Null]
      (resolved, groups) <- liftIO $ drain 0 state $ Map.fromList triggered
      now <- liftIO getCurrentTime
      rawExecute "UPDATE chronicle_machinations_events SET state=?::jsonb,updated_at=now() WHERE event_id=?"
        [toPersistValue $ jsonText resolved, toPersistValue eid]
      P.update eid [ArkhamEpicEventSharedState P.=.
        NativeEpic.setSharedCounter NativeEpic.TimeLimitMinutes 0 parent.arkhamEpicEventSharedState]
      updates <- for (Map.elems groups) \saved -> do
        persistGroup now saved
        setGameUndoFloor saved.savedId (saved.savedStep + 1)
        game <- P.getJust saved.savedId
        pure (saved.savedId, game)
      pure $ Just updates
