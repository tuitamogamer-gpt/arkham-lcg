module Arkham.Homebrew.EpicMachinations.Coordinator where

import Arkham.Card.CardCode
import Arkham.Homebrew.EpicLabyrinth.Types (OperationId, DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Prelude
import Arkham.ScenarioLogKey
import Arkham.Token
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set

initialMachinations :: Map Era (Set InvestigatorId) -> Either MachinationsError MachinationsState
initialMachinations rosters = do
  require (Map.keysSet rosters == Set.fromList allEras) WrongEraGroups
  for_ (Map.toList rosters) \(era, investigators) ->
    require (Set.size investigators >= 1 && Set.size investigators <= 4) $ InvalidEraCount era
  let players = sum $ map Set.size $ Map.elems rosters
      groups = Map.map (\ids -> EraProgress ids False mempty 0 False False) rosters
  pure $ MachinationsState groups players Nothing Nothing mempty mempty mempty
    (6 * players) (6 * players) Nothing mempty mempty 0

applyMachinationsRequest :: MachinationsRequest -> MachinationsState -> Either MachinationsError MachinationsState
applyMachinationsRequest request before
  | request.machinationsRequestId `Set.member` before.machinationsApplied = Right before
  | otherwise = do
      require (Map.member request.machinationsRequestEra before.machinationsEras) WrongEraGroups
      (changed, deliveries) <- applyMachinationsOperation request.machinationsRequestEra request.machinationsRequestOperation before
      let envelopes = zipWith (\n (era, body) -> (era, MachinationsEnvelope
            (DeliveryId $ tshow request.machinationsRequestId <> ":" <> tshow (n :: Int)) body)) [0 ..] deliveries
          boxes = foldl' (\current (era, envelope) -> Map.insertWith (flip (<>)) era [envelope] current)
            changed.machinationsDeliveries envelopes
      pure changed {machinationsApplied = Set.insert request.machinationsRequestId changed.machinationsApplied,
        machinationsDeliveries = boxes, machinationsRevision = before.machinationsRevision + 1}

applyMachinationsOperation :: Era -> MachinationsOperation -> MachinationsState -> Either MachinationsError (MachinationsState, [(Era, MachinationsDelivery)])
applyMachinationsOperation origin operation state = case operation of
  SelectMachination code -> selectShared True code
  SelectPlot code -> selectShared False code
  Announce key -> do
    require (announcementEra key == Just origin) WrongAnnouncement
    if key `Set.member` state.machinationsAnnouncements then pure (state, [])
      else pure (state {machinationsAnnouncements = Set.insert key state.machinationsAnnouncements}, broadcast $ ReceiveAnnouncement key)
  ReportProgress progress -> do
    original <- groupAt origin state
    require (original.eraInvestigators == progress.eraInvestigators) InvalidEraParticipant
    require (progress.eraTindalosClues >= 0) InvalidEraCounter
    pure (state {machinationsEras = Map.insert origin progress state.machinationsEras}, [])
  CompleteStory code -> do
    require (code == fromMaybe "" state.machinationsMachination || code == fromMaybe "" state.machinationsPlot) WrongStory
    if code `elem` ["87038", "87039"] then do
      let previous = Map.findWithDefault mempty origin state.machinationsLocalCompleted
      if code `Set.member` previous then pure (state, []) else
        let completed = Map.insert origin (Set.insert code previous) state.machinationsLocalCompleted
            allDone = all (Set.member code . (\era -> Map.findWithDefault mempty era completed)) allEras
            changed = updateEra origin (\g -> g {eraStories = Set.delete code g.eraStories}) state {machinationsLocalCompleted = completed,
              machinationsCompletedStories = if allDone then Set.insert code state.machinationsCompletedStories else state.machinationsCompletedStories}
         in pure (changed, [(origin, FinishSharedStory code)])
    else if code `Set.member` state.machinationsCompletedStories then pure (state, [])
      else pure (state {machinationsCompletedStories = Set.insert code state.machinationsCompletedStories,
        machinationsEras = Map.map (\g -> g {eraStories = Set.delete code g.eraStories}) state.machinationsEras}, broadcast $ FinishSharedStory code)
  DepositTindalosClue iid -> do
    participant origin iid state
    let changed = updateEra origin (\g -> g {eraTindalosClues = g.eraTindalosClues + 1}) state
    pure (changed, [(origin, SpendInvestigatorClue iid), (origin, ChangeTindalosClues 1)])
  TakeTindalosClue iid source -> do
    participant origin iid state
    group <- groupAt source state
    require (group.eraTindalosClues > 0) NoTindalosClue
    pure (updateEra source (\g -> g {eraTindalosClues = g.eraTindalosClues - 1}) state,
      [(source, ChangeTindalosClues (-1)), (origin, GiveInvestigatorClue iid)])
  DamageTyrthrha amount -> do
    require (amount >= 0) InvalidEraCounter
    let remaining = max 0 $ state.machinationsBossRemaining - amount
    pure (state {machinationsBossRemaining = remaining}, broadcast $ SetTyrthrhaRemaining remaining)
  HealTyrthrha amount -> do
    require (amount >= 0) InvalidEraCounter
    let remaining = min state.machinationsBossHealth $ state.machinationsBossRemaining + amount
    pure (state {machinationsBossRemaining = remaining}, broadcast $ SetTyrthrhaRemaining remaining)
  SendLocationToken destination code token amount -> do
    require (amount == 1 && (origin, destination, code, token) `elem` legalLocationEffects) UnauthorizedEraEffect
    pure (state, [(destination, PlaceRemoteToken code token amount)])
  RemoveRemoteAnomaly destination title -> do
    require (origin /= destination && CorriganIndustriesHasBeenFounded `Set.member` state.machinationsAnnouncements) UnauthorizedEraEffect
    require (title `elem` ["Miskatonic University", "River Docks", "Arkham Advertiser", "Tick-Tock Club"]) UnauthorizedEraEffect
    pure (state, [(destination, RemoveAnomalyByTitle title)])
  BringEdwin iid lid -> participant origin iid state >> pure (state, [(origin, MoveActualEdwin iid lid)])
  CheckTimeline ->
    let complete g = g.eraScientistsEscorted && Set.null g.eraStories
     in if isNothing state.machinationsResolution && isJust state.machinationsMachination && isJust state.machinationsPlot
          && all complete (Map.elems state.machinationsEras)
          then pure (state {machinationsResolution = Just 1}, broadcast $ ResolveTimeline 1 False)
          else pure (state, [])
  FailTimeline ->
    if isJust state.machinationsResolution then pure (state, []) else
      let groups = Map.elems state.machinationsEras
          result | any eraEdwinAsset groups = 2
                 | any eraEdwinEnemy groups = 3
                 | otherwise = 4
       in pure (state {machinationsResolution = Just result}, broadcast $ ResolveTimeline result True)
  AcknowledgeMachinationsDelivery identifier -> pure (state
    {machinationsDeliveries = Map.adjust (filter ((/= identifier) . machinationsDeliveryId)) origin state.machinationsDeliveries}, [])
 where
  selectShared machination code = do
    require (origin == PastEra) WrongStory
    require (code `elem` if machination then ["87033", "87034", "87035"] else ["87038", "87039", "87042"]) WrongStory
    let previous = if machination then state.machinationsMachination else state.machinationsPlot
    case previous of
      Just old -> require (old == code) WrongStory >> pure (state, [])
      Nothing ->
        let changed = if machination then state {machinationsMachination = Just code} else state {machinationsPlot = Just code}
         in pure (changed, broadcast $ InstallSharedStory code)

machinationsReplicaFor :: Era -> MachinationsState -> Either MachinationsError MachinationsReplica
machinationsReplicaFor era state = do
  _ <- groupAt era state
  pure $ MachinationsReplica era state.machinationsGlobalPlayers state.machinationsMachination state.machinationsPlot
    state.machinationsAnnouncements state.machinationsCompletedStories state.machinationsEras
    state.machinationsBossHealth state.machinationsBossRemaining state.machinationsResolution state.machinationsRevision

announcementEra :: ScenarioLogKey -> Maybe Era
announcementEra = \case
  ThomasAndMaryHaveMet -> Just PastEra
  ThomasAndMaryAreInspiredByNikolaTesla -> Just PastEra
  FundingForAnObservatoryHasBegun -> Just PastEra
  ATreeSeedHasBeenPlanted -> Just PastEra
  ThomasAndMaryHaveMarried -> Just PastEra
  TheObservatoryIsBuilt -> Just PresentEra
  TeleportationResearchHasBegun -> Just PresentEra
  CorriganIndustriesHasBeenFounded -> Just PresentEra
  TheDebtHasBeenPaid -> Just PresentEra
  ThomasAndMaryHaveMadeAHistoricDiscovery -> Just FutureEra
  ThomasAndMaryHaveWonANobelPrize -> Just FutureEra
  _ -> Nothing

legalLocationEffects :: [(Era, Era, CardCode, Token)]
legalLocationEffects =
  [ (PastEra, PresentEra, "87018", Shipment), (PastEra, FutureEra, "87027", Shipment)
  , (PresentEra, FutureEra, "87027", Shipment)
  , (PastEra, PresentEra, "87017", Time)
  , (PastEra, FutureEra, "87029", TimeCapsule)
  , (FutureEra, PastEra, "87007", Newspaper), (FutureEra, PresentEra, "87016", Newspaper)
  , (FutureEra, FutureEra, "87025", Newspaper)
  ]

require :: Bool -> MachinationsError -> Either MachinationsError ()
require condition problem = if condition then Right () else Left problem

groupAt era state = maybe (Left WrongEraGroups) Right $ Map.lookup era state.machinationsEras
participant era iid state = groupAt era state >>= \group -> require (iid `Set.member` group.eraInvestigators) InvalidEraParticipant
updateEra era f state = state {machinationsEras = Map.adjust f era state.machinationsEras}
broadcast body = [(era, body) | era <- allEras]
