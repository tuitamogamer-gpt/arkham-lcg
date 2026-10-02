module Arkham.Homebrew.EpicMachinations.CoordinatorSpec (spec) where

import Arkham.Homebrew.EpicLabyrinth.Types (OperationId (..))
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Prelude hiding (group)
import Arkham.ScenarioLogKey
import Arkham.Token
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import Data.UUID qualified as UUID
import Test.Hspec qualified as H

spec :: H.Spec
spec = H.describe "Epic Machinations coordinator" do
  H.it "requires all three eras with one to four investigators each" do
    initialMachinations (Map.delete PastEra rosters) `H.shouldBe` Left WrongEraGroups
    initialMachinations (Map.insert FutureEra mempty rosters) `H.shouldBe` Left (InvalidEraCount FutureEra)
    initialMachinations (Map.insert FutureEra (Set.fromList $ map InvestigatorId ["01001", "01002", "01003", "01004", "01005"]) rosters)
      `H.shouldBe` Left (InvalidEraCount FutureEra)

  H.it "scopes duplicate investigator codes to their own era and freezes the total player count" do
    machinationsGlobalPlayers base `H.shouldBe` 4
    machinationsBossHealth base `H.shouldBe` 24
    machinationsBossRemaining base `H.shouldBe` 24
    Map.map eraInvestigators base.machinationsEras `H.shouldBe` rosters

  H.it "lets only the Past choose one common machination and one common plot" do
    applyMachinationsOperation PresentEra (SelectMachination "87033") base `H.shouldBe` Left WrongStory
    applyMachinationsOperation PastEra (SelectPlot "87033") base `H.shouldBe` Left WrongStory
    let selected = step 2 PastEra (SelectPlot "87038") $ step 1 PastEra (SelectMachination "87033") base
    for_ allEras $ \era -> bodies era selected `H.shouldBe` [InstallSharedStory "87033", InstallSharedStory "87038"]
    applyMachinationsOperation PastEra (SelectMachination "87034") selected `H.shouldBe` Left WrongStory

  H.it "retries the same native operation without redelivering or incrementing revision" do
    let request = MachinationsRequest (identifier 1) PastEra $ SelectMachination "87033"
        selected = must $ applyMachinationsRequest request base
    applyMachinationsRequest request selected `H.shouldBe` Right selected

  H.it "shares a printed announcement only from its owning era" do
    applyMachinationsOperation FutureEra (Announce ThomasAndMaryHaveMet) base `H.shouldBe` Left WrongAnnouncement
    let announced = step 1 PastEra (Announce ThomasAndMaryHaveMet) base
        duplicate = step 2 PastEra (Announce ThomasAndMaryHaveMet) announced
    for_ allEras $ \era -> bodies era duplicate `H.shouldBe` [ReceiveAnnouncement ThomasAndMaryHaveMet]
    announcements (must $ machinationsReplicaFor FutureEra duplicate) `H.shouldBe` Set.singleton ThomasAndMaryHaveMet

  H.it "routes all eleven printed historical announcements to the correct era" do
    let keys = [(PastEra, ThomasAndMaryHaveMet), (PastEra, ThomasAndMaryAreInspiredByNikolaTesla),
          (PastEra, FundingForAnObservatoryHasBegun), (PastEra, ATreeSeedHasBeenPlanted), (PastEra, ThomasAndMaryHaveMarried),
          (PresentEra, TheObservatoryIsBuilt), (PresentEra, TeleportationResearchHasBegun),
          (PresentEra, CorriganIndustriesHasBeenFounded), (PresentEra, TheDebtHasBeenPaid),
          (FutureEra, ThomasAndMaryHaveMadeAHistoricDiscovery), (FutureEra, ThomasAndMaryHaveWonANobelPrize)]
    for_ keys $ \(era, key) -> announcementEra key `H.shouldBe` Just era

  H.it "lets an era progress independently without forcing a round barrier" do
    let before = group PastEra base
        progressed = step 1 PastEra (ReportProgress before {eraScientistsEscorted = True}) base
    eraScientistsEscorted (group PastEra progressed) `H.shouldBe` True
    group PresentEra progressed `H.shouldBe` group PresentEra base
    bodies PresentEra progressed `H.shouldBe` []

  H.it "rejects roster changes and negative shared clue counts after the event starts" do
    applyMachinationsOperation PastEra (ReportProgress (group PastEra base) {eraInvestigators = mempty}) base
      `H.shouldBe` Left InvalidEraParticipant
    applyMachinationsOperation PastEra (ReportProgress (group PastEra base) {eraTindalosClues = -1}) base
      `H.shouldBe` Left InvalidEraCounter

  H.it "deposits a real participant's clue through paired investigator and location effects" do
    let deposited = step 1 PresentEra (DepositTindalosClue investigator) base
    eraTindalosClues (group PresentEra deposited) `H.shouldBe` 1
    bodies PresentEra deposited `H.shouldBe` [SpendInvestigatorClue investigator, ChangeTindalosClues 1]
    bodies PastEra deposited `H.shouldBe` []
    applyMachinationsOperation FutureEra (DepositTindalosClue $ InvestigatorId "01005") base
      `H.shouldBe` Left InvalidEraParticipant

  H.it "takes a clue from another era without allowing the pool below zero" do
    let deposited = step 1 PresentEra (DepositTindalosClue investigator) base
        taken = step 2 FutureEra (TakeTindalosClue investigator PresentEra) deposited
    eraTindalosClues (group PresentEra taken) `H.shouldBe` 0
    bodies PresentEra taken `H.shouldBe` [SpendInvestigatorClue investigator, ChangeTindalosClues 1, ChangeTindalosClues (-1)]
    bodies FutureEra taken `H.shouldBe` [GiveInvestigatorClue investigator]
    applyMachinationsOperation PastEra (TakeTindalosClue investigator PresentEra) taken `H.shouldBe` Left NoTindalosClue

  H.it "shares Tyr'thrha's health across all three groups using the frozen global player count" do
    let damaged = step 1 PastEra (DamageTyrthrha 7) base
        healed = step 2 FutureEra (HealTyrthrha 4) damaged
        defeated = step 3 PresentEra (DamageTyrthrha 99) healed
    machinationsBossRemaining damaged `H.shouldBe` 17
    machinationsBossRemaining healed `H.shouldBe` 21
    machinationsBossRemaining defeated `H.shouldBe` 0
    for_ allEras $ \era -> bodies era defeated `H.shouldBe` [SetTyrthrhaRemaining 17, SetTyrthrhaRemaining 21, SetTyrthrhaRemaining 0]
    applyMachinationsOperation PastEra (HealTyrthrha (-1)) base `H.shouldBe` Left InvalidEraCounter

  H.it "never heals shared boss health above its printed global maximum" do
    machinationsBossRemaining (step 1 FutureEra (HealTyrthrha 99) base) `H.shouldBe` 24

  H.it "routes only the printed cross-era shipment, time, capsule and newspaper effects" do
    for_ legalLocationEffects $ \(origin, destination, code, token) ->
      applyMachinationsOperation origin (SendLocationToken destination code token 1) base
        `H.shouldBe` Right (base, [(destination, PlaceRemoteToken code token 1)])
    applyMachinationsOperation FutureEra (SendLocationToken PastEra "87009" Doom 1) base `H.shouldBe` Left UnauthorizedEraEffect
    applyMachinationsOperation PastEra (SendLocationToken FutureEra "87027" Shipment 2) base `H.shouldBe` Left UnauthorizedEraEffect

  H.it "requires the Corrigan announcement before removing an anomaly in another era" do
    applyMachinationsOperation PresentEra (RemoveRemoteAnomaly PastEra "River Docks") base `H.shouldBe` Left UnauthorizedEraEffect
    let founded = step 1 PresentEra (Announce CorriganIndustriesHasBeenFounded) base
    applyMachinationsOperation PresentEra (RemoveRemoteAnomaly PastEra "River Docks") founded
      `H.shouldBe` Right (founded, [(PastEra, RemoveAnomalyByTitle "River Docks")])
    applyMachinationsOperation PresentEra (RemoveRemoteAnomaly PresentEra "River Docks") founded `H.shouldBe` Left UnauthorizedEraEffect

  H.it "finishes a shared machination in every era without replaying its victory effect" do
    let selected = step 1 PastEra (SelectMachination "87034") base
        withCopies = selected {machinationsEras = Map.map (\g -> g {eraStories = Set.singleton "87034"}) selected.machinationsEras}
        completed = step 2 PresentEra (CompleteStory "87034") withCopies
        retried = step 3 FutureEra (CompleteStory "87034") completed
    for_ allEras $ \era -> do
      eraStories (group era retried) `H.shouldBe` mempty
      bodies era retried `H.shouldBe` [InstallSharedStory "87034", FinishSharedStory "87034"]

  H.it "keeps Mob and Anomalies copies local until each era completes its own plot" do
    let selected = step 1 PastEra (SelectPlot "87038") base
        withCopies = selected {machinationsEras = Map.map (\g -> g {eraStories = Set.singleton "87038"}) selected.machinationsEras}
        first = step 2 PastEra (CompleteStory "87038") withCopies
        second = step 3 PresentEra (CompleteStory "87038") first
        allDone = step 4 FutureEra (CompleteStory "87038") second
    machinationsCompletedStories first `H.shouldBe` mempty
    eraStories (group PresentEra first) `H.shouldBe` Set.singleton "87038"
    bodies PresentEra first `H.shouldBe` [InstallSharedStory "87038"]
    machinationsCompletedStories allDone `H.shouldBe` Set.singleton "87038"

  H.it "routes Edwin to the requesting era for atomic native graph transport" do
    let location = LocationId $ UUID.fromWords 0 0 0 42
    applyMachinationsOperation FutureEra (BringEdwin investigator location) base
      `H.shouldBe` Right (base, [(FutureEra, MoveActualEdwin investigator location)])

  H.it "requires both scientists and zero stories in every era before resolution one" do
    let selected = step 2 PastEra (SelectPlot "87038") $ step 1 PastEra (SelectMachination "87034") base
        ready = selected {machinationsEras = Map.map (\g -> g {eraScientistsEscorted = True}) selected.machinationsEras,
          machinationsDeliveries = mempty}
        waiting = ready {machinationsEras = Map.adjust (\g -> g {eraStories = Set.singleton "87038"}) PresentEra ready.machinationsEras}
        won = step 3 PastEra CheckTimeline ready
    machinationsResolution (step 3 PastEra CheckTimeline waiting) `H.shouldBe` Nothing
    machinationsResolution won `H.shouldBe` Just 1
    bodies FutureEra (step 4 FutureEra CheckTimeline won) `H.shouldBe` [ResolveTimeline 1 False]

  H.it "chooses global failure resolution from the actual Edwin state and resolves once" do
    for_ [(True, False, 2), (False, True, 3), (False, False, 4)] $ \(asset, enemy, result) -> do
      let edwin = base {machinationsEras = Map.adjust (\g -> g {eraEdwinAsset = asset, eraEdwinEnemy = enemy}) PresentEra base.machinationsEras}
          failed = step 1 FutureEra FailTimeline edwin
      machinationsResolution failed `H.shouldBe` Just result
      for_ allEras $ \era -> bodies era (step 2 PastEra FailTimeline failed) `H.shouldBe` [ResolveTimeline result True]

  H.it "persists only unacknowledged delivery envelopes across save and reload" do
    let selected = step 1 PastEra (SelectPlot "87039") base
        envelope = fromJustNote "test delivery" $ listToMaybe $ Map.findWithDefault [] PresentEra selected.machinationsDeliveries
        acknowledged = step 2 PresentEra (AcknowledgeMachinationsDelivery envelope.machinationsDeliveryId) selected
    bodies PresentEra acknowledged `H.shouldBe` []
    bodies FutureEra acknowledged `H.shouldBe` [InstallSharedStory "87039"]
    Aeson.eitherDecode (Aeson.encode acknowledged) `H.shouldBe` Right acknowledged

investigator :: InvestigatorId
investigator = InvestigatorId "01001"

rosters :: Map Era (Set InvestigatorId)
rosters = Map.fromList [(PastEra, Set.fromList [investigator, InvestigatorId "01002"]),
  (PresentEra, Set.singleton investigator), (FutureEra, Set.singleton investigator)]

base :: MachinationsState
base = must $ initialMachinations rosters

identifier :: Int -> OperationId
identifier n = OperationId $ UUID.fromWords 0 0 0 $ fromIntegral n

must :: Show problem => Either problem a -> a
must = either (error . show) id

step :: Int -> Era -> MachinationsOperation -> MachinationsState -> MachinationsState
step n era operation = must . applyMachinationsRequest (MachinationsRequest (identifier n) era operation)

bodies era state = map machinationsDeliveryBody $ Map.findWithDefault [] era state.machinationsDeliveries
group era state = fromJustNote "test era" $ Map.lookup era state.machinationsEras
