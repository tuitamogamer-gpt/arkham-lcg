module Arkham.Homebrew.EpicLabyrinth.Coordinator where

import Arkham.Card.CardCode
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Prelude
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set

initialEvent :: Map LabyrinthGroup (Set InvestigatorId) -> Either RulesError EventState
initialEvent investigators = do
  require (Map.keysSet investigators == Set.fromList allGroups) InvalidGroups
  for_ (Map.toList investigators) \(group, ids) ->
    require (Set.size ids >= 1 && Set.size ids <= 4) (InvalidInvestigatorCount group)
  -- Investigator codes are unique only within each independent group. The
  -- same investigator can legitimately be used by another group.
  pure $ EventState
    (Map.map initialGroup investigators) mempty mempty mempty mempty Nothing
    mempty mempty False Nothing Nothing mempty Nothing 0

-- Requests are serialized by the event-row lock. A retry has no output: already
-- committed deliveries remain in the ledger until their receiver acknowledges.
applyRequest :: Request -> EventState -> Either RulesError EventState
applyRequest request before
  | Set.member request.requestId before.eventAppliedOperations = Right before
  | otherwise = do
      _ <- getGroup request.requestOrigin before
      (changed, deliveries) <- applyOperation request.requestOrigin request.requestOperation before
      let envelopes = zipWith (envelope request.requestId) [0 ..] deliveries
          outbox = foldl' (\boxes (group, entry) -> Map.insertWith (flip (<>)) group [entry] boxes)
            changed.eventDeliveries envelopes
      pure changed
        { eventAppliedOperations = Set.insert request.requestId changed.eventAppliedOperations
        , eventDeliveries = outbox
        , eventRevision = before.eventRevision + 1
        }
 where
  envelope op index delivery =
    (delivery.deliveryGroup, DeliveryEnvelope (DeliveryId $ tshow op <> ":" <> tshow (index :: Int)) delivery.deliveryBody)

applyOperation :: LabyrinthGroup -> Operation -> EventState -> Either RulesError (EventState, [RoutedDelivery])
applyOperation origin operation state = case operation of
  Arrive key -> do
    let old = Map.findWithDefault emptyBarrier key state.eventBarriers
        barrier = old {barrierArrived = Set.insert origin old.barrierArrived}
        ready = activeGroups state `Set.isSubsetOf` barrier.barrierArrived
        open = ready && not barrier.barrierOpened
        next = barrier {barrierOpened = barrier.barrierOpened || ready, barrierGeneration = if open then 1 else barrier.barrierGeneration}
    pure (state {eventBarriers = Map.insert key next state.eventBarriers},
      if open then route (activeGroups state) (OpenBarrier key next.barrierGeneration) else [])
  FinishWindow key -> do
    old <- maybe (Left BarrierNotOpen) Right $ Map.lookup key state.eventBarriers
    require old.barrierOpened BarrierNotOpen
    let barrier = old {barrierFinished = Set.insert origin old.barrierFinished}
        ready = activeGroups state `Set.isSubsetOf` barrier.barrierFinished
        release = ready && not barrier.barrierReleased
        next = barrier {barrierReleased = barrier.barrierReleased || ready}
    pure (state {eventBarriers = Map.insert key next state.eventBarriers},
      if release then route (activeGroups state) (ReleaseBarrier key next.barrierGeneration) else [])
  SetDoom n -> do
    require (n >= 0) InvalidCounter
    pure (modifyGroup origin (\g -> g {groupDoom = n}) state, [])
  SetSurviving surviving -> do
    previous <- getGroup origin state
    let changed = modifyGroup origin (\g -> g {groupSurviving = surviving}) state
        (released, deliveries) = reopenBarriers changed
    pure (released, deliveries <> [RoutedDelivery origin (ResolveTogether 1) | previous.groupSurviving && not surviving])
  SetBoss health damage -> do
    require (health >= 0 && damage >= 0) InvalidCounter
    pure (modifyGroup origin (\g -> g {groupBossHealth = health, groupBossDamage = damage}) state, [])
  SelectStory stage code -> do
    require (origin == GroupA) InvalidStory
    require (code `elem` availableStories stage) InvalidStory
    case Map.lookup stage state.eventStoryChoices of
      Just previous -> require (previous == code) InvalidStory >> pure (state, [])
      Nothing -> do
        require (code `elem` remainingStories stage state) InvalidStory
        let groups = Map.map (\g -> g {groupStories = Set.insert code g.groupStories}) state.eventGroups
        pure (state {eventGroups = groups, eventStoryChoices = Map.insert stage code state.eventStoryChoices},
              route (Set.fromList allGroups) (DrawSharedStory code))
  SetSecretChamber code -> do
    require (origin == GroupA && code `elem` ["70016", "70017", "70018"]) InvalidStory
    require (isNothing state.eventSecretChamber || state.eventSecretChamber == Just code) InvalidStory
    pure (state {eventSecretChamber = Just code}, [])
  InspectSecret -> do
    require (origin == GroupC && maybe False barrierReleased (Map.lookup (StageBarrier 1) state.eventBarriers)) InvalidStory
    code <- maybe (Left InvalidStory) Right state.eventSecretChamber
    pure (modifyGroup GroupC (\g -> g {groupSawSecret = True}) state, [RoutedDelivery GroupC $ SecretRevealed code])
  AssignJailor destination -> do
    require (origin == GroupA) InvalidStory
    _ <- getGroup destination state
    case state.eventJailorGroup of
      Just chosen -> require (chosen == destination) InvalidStory >> pure (state, [])
      Nothing -> pure (state {eventJailorGroup = Just destination}, [RoutedDelivery destination ShuffleJailor])
  DecodeRunes -> do
    group <- hasStory origin "70033" state
    let n = group.groupRunes + 1
    pure (modifyGroup origin (\g -> g {groupRunes = n, groupDecodedRunes = True}) state,
      [RoutedDelivery origin $ SetRuneResources n])
  AidRunes destination -> do
    group <- hasStory origin "70033" state
    require group.groupDecodedRunes RunesNotDecoded
    require (destination /= origin) SameDestination
    recipient <- hasStory destination "70033" state
    let n = recipient.groupRunes + 1
    pure (modifyGroup destination (\g -> g {groupRunes = n}) state,
      [RoutedDelivery destination $ SetRuneResources n])
  ResolveRunes -> do
    group <- hasStory origin "70033" state
    require (group.groupRunes >= Set.size group.groupInvestigators) InvalidCounter
    pure (modifyGroup origin (\g -> g {groupSawSecret = g.groupSawSecret || origin == GroupC}) state,
      [RoutedDelivery origin ResolveRuneReward])
  DecodeGlyphs -> do
    group <- hasStory origin "70038" state
    pure $ resolveGlyphRewards $ modifyGroup origin (\g -> g {groupGlyphDamage = group.groupGlyphDamage + 1}) state
  OrderGlyphs -> do
    _ <- hasStory origin "70038" state
    let update g = if Set.member "70038" g.groupStories then g {groupGlyphHorror = g.groupGlyphHorror + 1} else g
    pure $ resolveGlyphRewards state {eventGroups = Map.map update state.eventGroups}
  EnterRift iid requestedId -> do
    _ <- hasStory origin "70034" state
    require (all ((>= 3) . groupDoom) $ Map.elems state.eventGroups) RiftNotReady
    requireMember origin iid state
    require (Map.notMember origin state.eventRiftParticipants) ExchangeUnavailable
    let participants = Map.insert origin iid state.eventRiftParticipants
        eid = fromMaybe requestedId state.eventRiftExchangeId
        complete = activeGroups state `Set.isSubsetOf` Map.keysSet participants
        exchange = Exchange eid RiftExchange participants False mempty
        changed = state {eventRiftParticipants = participants, eventRiftExchangeId = Just eid}
    pure (if complete then changed {eventExchanges = Map.insert eid exchange changed.eventExchanges} else changed,
      if complete then route (Map.keysSet participants) (ExchangeOpened exchange) else [])
  OpenParadox iid destination other eid -> do
    require (origin /= destination) SameDestination
    requireMember origin iid state
    requireMember destination other state
    require (Map.notMember eid state.eventExchanges) ExchangeUnavailable
    let exchange = Exchange eid ParadoxExchange (Map.fromList [(origin, iid), (destination, other)]) False mempty
    pure (state {eventExchanges = Map.insert eid exchange state.eventExchanges},
      route (Map.keysSet exchange.exchangeParticipants) (ExchangeOpened exchange))
  CloseExchange eid -> do
    exchange <- openExchange origin eid state
    let finished = Set.insert origin exchange.exchangeFinished
        closed = Map.keysSet exchange.exchangeParticipants `Set.isSubsetOf` finished
        next = exchange {exchangeFinished = finished, exchangeClosed = closed}
        changed = state {eventExchanges = Map.insert eid next state.eventExchanges}
        cleanup = if closed && exchange.exchangeKind == RiftExchange
          then changed {eventRiftParticipants = mempty, eventRiftExchangeId = Nothing} else changed
    pure (cleanup, if closed then route (Map.keysSet exchange.exchangeParticipants) (ExchangeEnded eid) else [])
  SendParcel parcel -> do
    require (parcel.parcelOrigin == origin && parcel.parcelDestination /= origin) InvalidParcel
    _ <- getGroup parcel.parcelDestination state
    require (Map.notMember parcel.parcelId state.eventParcels) ParcelAlreadyExists
    validateCargo parcel state
    let inserted = state {eventParcels = Map.insert parcel.parcelId (ParcelRecord parcel InTransit) state.eventParcels}
    pure (inserted, [RoutedDelivery origin $ CommitParcel parcel,
      RoutedDelivery parcel.parcelDestination $ ReceiveParcel parcel])
  AcknowledgeParcel pid -> do
    parcel <- maybe (Left ParcelMissing) Right $ Map.lookup pid state.eventParcels
    require (parcel.recordedParcel.parcelDestination == origin) InvalidRecipient
    if parcel.parcelStatus == Delivered then pure (state, [])
      else pure (state {eventParcels = Map.insert pid (parcel {parcelStatus = Delivered}) state.eventParcels},
        [RoutedDelivery parcel.recordedParcel.parcelOrigin $ ParcelAcknowledged pid])
  AcknowledgeDelivery did ->
    pure (state {eventDeliveries = Map.adjust (filter ((/= did) . envelopeId)) origin state.eventDeliveries}, [])
  ResolveDilemma iid -> do
    group <- hasStory origin "70036" state
    requireMember origin iid state
    if state.eventDilemmaResolved then pure (state, []) else do
      let remove g = g {groupStories = Set.delete "70036" g.groupStories}
          deliveries = [RoutedDelivery origin $ ApplyDilemmaPenalty iid group.groupDoom]
            <> concat [[RoutedDelivery g $ ReceiveDiagram (diagram g), RoutedDelivery g $ RemoveSharedStory "70036"] | g <- allGroups]
      pure (state {eventDilemmaResolved = True, eventGroups = Map.map remove state.eventGroups}, deliveries)
  MoveExcessBossDamage destination n -> do
    group <- getGroup origin state
    recipient <- getGroup destination state
    require (destination /= origin) SameDestination
    require (group.groupSurviving && recipient.groupSurviving) UnknownGroup
    require (n >= 0 && group.groupBossHealth > 0 && n <= group.groupBossDamage - group.groupBossHealth) NoExcessDamage
    let next = modifyGroup destination (\g -> g {groupBossDamage = g.groupBossDamage + n})
          $ modifyGroup origin (\g -> g {groupBossDamage = g.groupBossDamage - n}) state
    pure (next, [RoutedDelivery origin $ ChangeBossDamage (-n), RoutedDelivery destination $ ChangeBossDamage n])
  CheckEscape ->
    let survivors = activeGroups state
        done = not (Set.null survivors) && all (\g -> g.groupBossHealth > 0 && g.groupBossDamage >= g.groupBossHealth)
          [g | g <- Map.elems state.eventGroups, g.groupSurviving]
        result = 1 + Set.size survivors
     in if done && isNothing state.eventResolution
          then pure (state {eventResolution = Just result}, route survivors $ ResolveTogether result)
          else pure (state, [])
  MoveAllBossDamage destination -> do
    require (destination /= origin) SameDestination
    group <- getGroup origin state
    _ <- getGroup destination state
    let n = group.groupBossDamage
        changed = modifyGroup destination (\g -> g {groupBossDamage = g.groupBossDamage + n})
          $ modifyGroup origin (\g -> g {groupBossDamage = 0}) state
    pure (changed, [RoutedDelivery origin $ ChangeBossDamage (-n), RoutedDelivery destination $ ChangeBossDamage n])
  SendPet destination -> do
    require (origin == GroupC && destination /= origin) InvalidStory
    _ <- getGroup destination state
    pure (state, [RoutedDelivery destination SpawnPetAtRoundEnd])

validateCargo :: Parcel -> EventState -> Either RulesError ()
validateCargo parcel state = do
  let cargo = parcel.parcelCargo
      kinds = map snapshotKind cargo.cargoEntities
      identities = map snapshotCardId cargo.cargoEntities
      duplicate = any (\record -> record.parcelStatus == InTransit && any (`elem` identities)
        (map snapshotCardId record.recordedParcel.parcelCargo.cargoEntities)) $ Map.elems state.eventParcels
  require (cargo.cargoResources >= 0 && cargo.cargoClues >= 0) InvalidCounter
  require (length identities == Set.size (Set.fromList identities) && not duplicate) DuplicateEntity
  for_ parcel.parcelSender $ \iid -> requireMember parcel.parcelOrigin iid state
  for_ parcel.parcelRecipient $ \iid -> requireMember parcel.parcelDestination iid state
  case parcel.parcelPermission of
    ThroughVent -> do
      _ <- hasStory parcel.parcelOrigin "70035" state
      _ <- hasStory parcel.parcelDestination "70035" state
      require (all (== ItemAsset) kinds && isNothing parcel.parcelRecipient) InvalidParcel
    ThroughRift eid -> validateExchange RiftExchange eid True
    ThroughParadox eid -> validateExchange ParadoxExchange eid False
    MoveJailor -> require (kinds == [Jailor] && cargo.cargoResources == 0 && cargo.cargoClues == 0 && null cargo.cargoNotes) InvalidParcel
    MovePet -> require (kinds == [Pet] && cargo.cargoResources == 0 && cargo.cargoClues == 0 && null cargo.cargoNotes) InvalidParcel
 where
  validateExchange kind eid cluesAllowed = do
    exchange <- openExchange parcel.parcelOrigin eid state
    require (exchange.exchangeKind == kind && Map.member parcel.parcelDestination exchange.exchangeParticipants) ExchangeUnavailable
    require (not $ Set.member parcel.parcelDestination exchange.exchangeFinished) ExchangeUnavailable
    require (Map.lookup parcel.parcelOrigin exchange.exchangeParticipants == parcel.parcelSender) InvalidRecipient
    require (Map.lookup parcel.parcelDestination exchange.exchangeParticipants == parcel.parcelRecipient) InvalidRecipient
    require (all (`elem` [HandCard, StoryAsset]) $ map snapshotKind parcel.parcelCargo.cargoEntities) InvalidParcel
    require (cluesAllowed || parcel.parcelCargo.cargoClues == 0) InvalidParcel
    require (null parcel.parcelCargo.cargoNotes) InvalidParcel

replicaFor :: LabyrinthGroup -> EventState -> Either RulesError Replica
replicaFor group state = do
  local <- getGroup group state
  let visibleSecret = if group == GroupA || (group == GroupC && local.groupSawSecret)
        then state.eventSecretChamber else Nothing
  pure $ Replica group state.eventGroups state.eventStoryChoices visibleSecret
    [e | e <- Map.elems state.eventExchanges, Map.member group e.exchangeParticipants, not e.exchangeClosed]
    state.eventRevision

availableStories :: Int -> [CardCode]
availableStories = \case
  1 -> ["70033", "70034", "70035"]
  2 -> ["70034", "70035", "70036", "70037", "70038"]
  _ -> []

remainingStories :: Int -> EventState -> [CardCode]
remainingStories stage state = filter (`notElem` Map.elems state.eventStoryChoices) $ availableStories stage

diagram :: LabyrinthGroup -> CardCode
diagram = \case GroupA -> "70042"; GroupB -> "70044"; GroupC -> "70046"

require :: Bool -> RulesError -> Either RulesError ()
require condition err = if condition then Right () else Left err

getGroup :: LabyrinthGroup -> EventState -> Either RulesError GroupState
getGroup group state = maybe (Left UnknownGroup) Right $ Map.lookup group state.eventGroups

hasStory :: LabyrinthGroup -> CardCode -> EventState -> Either RulesError GroupState
hasStory group code state = do
  found <- getGroup group state
  require (Set.member code found.groupStories) StoryNotActive
  pure found

requireMember :: LabyrinthGroup -> InvestigatorId -> EventState -> Either RulesError ()
requireMember group iid state = getGroup group state >>= \g -> require (Set.member iid g.groupInvestigators) InvestigatorNotInGroup

modifyGroup :: LabyrinthGroup -> (GroupState -> GroupState) -> EventState -> EventState
modifyGroup group f state = state {eventGroups = Map.adjust f group state.eventGroups}

activeGroups :: EventState -> Set LabyrinthGroup
activeGroups = Map.keysSet . Map.filter groupSurviving . eventGroups

route :: Set LabyrinthGroup -> Delivery -> [RoutedDelivery]
route groups body = [RoutedDelivery group body | group <- Set.toList groups]

openExchange :: LabyrinthGroup -> ExchangeId -> EventState -> Either RulesError Exchange
openExchange group eid state = do
  found <- maybe (Left ExchangeUnavailable) Right $ Map.lookup eid state.eventExchanges
  require (not found.exchangeClosed && Map.member group found.exchangeParticipants) ExchangeUnavailable
  require (not $ Set.member group found.exchangeFinished) ExchangeUnavailable
  pure found

resolveGlyphRewards :: EventState -> (EventState, [RoutedDelivery])
resolveGlyphRewards state = foldl' resolve (state, []) allGroups
 where
  resolve (current, deliveries) group = case Map.lookup group current.eventGroups of
    Just g | Set.member "70038" g.groupStories ->
      let complete = g.groupGlyphHorror >= 1 && g.groupGlyphDamage >= Set.size g.groupInvestigators
          updated = if complete then modifyGroup group (\v -> v {groupStories = Set.delete "70038" v.groupStories}) current else current
       in (updated, deliveries <> [RoutedDelivery group $ SetGlyphCounters g.groupGlyphDamage g.groupGlyphHorror]
            <> [RoutedDelivery group $ ChooseDiagramRecipient (diagram group) | complete]
            <> [RoutedDelivery group $ RemoveSharedStory "70038" | complete])
    _ -> (current, deliveries)

-- Removing a defeated group must not leave the surviving groups parked behind
-- that group's missing arrival or finish acknowledgement.
reopenBarriers :: EventState -> (EventState, [RoutedDelivery])
reopenBarriers state = foldl' reopen (state, []) $ Map.toList state.eventBarriers
 where
  reopen (current, deliveries) (key, old) =
    let active = activeGroups current
        open = not old.barrierOpened && active `Set.isSubsetOf` old.barrierArrived
        release = (old.barrierOpened || open) && not old.barrierReleased && active `Set.isSubsetOf` old.barrierFinished
        next = old {barrierOpened = old.barrierOpened || open, barrierReleased = old.barrierReleased || release,
          barrierGeneration = if open then 1 else old.barrierGeneration}
     in (current {eventBarriers = Map.insert key next current.eventBarriers}, deliveries
          <> [RoutedDelivery g (OpenBarrier key next.barrierGeneration) | g <- Set.toList active, open]
          <> [RoutedDelivery g (ReleaseBarrier key next.barrierGeneration) | g <- Set.toList active, release])
