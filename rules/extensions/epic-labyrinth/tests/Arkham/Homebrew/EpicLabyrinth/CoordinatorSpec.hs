module Arkham.Homebrew.EpicLabyrinth.CoordinatorSpec (spec) where

import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Homebrew.EpicLabyrinth.Coordinator
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Homebrew.EpicLabyrinth.UndoBoundary
import Arkham.Id
import Arkham.Prelude
import Data.Aeson qualified as Aeson
import Data.List.NonEmpty qualified as NE
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import Data.UUID qualified as UUID
import Test.Hspec qualified as H

spec :: H.Spec
spec = H.describe "Epic Labyrinth coordinator" do
  H.describe "shared participant undo boundaries used by both Epic adapters" do
    let origin = "past-game" :: Text
        participant = "present-game" :: Text
        third = "future-game" :: Text
        expected = [(origin, 11), (participant, 21), (third, 31)]
        journal = (origin, expected)
        rejection = Left "Cannot undo another group's shared effect; undo from the originating group"

    H.it "rejects a sibling's exact synthetic step even without its own origin journal" do
      validateParticipantUndo participant [21] [journal] `H.shouldBe` rejection

    H.it "rejects a multi-step range that crosses a foreign synthetic step" do
      validateParticipantUndo participant [24, 23, 22, 21, 20] [journal] `H.shouldBe` rejection

    H.it "allows local steps on either side when the requested range does not cross the foreign step" do
      validateParticipantUndo participant [24, 23, 22] [journal] `H.shouldBe` Right ()
      validateParticipantUndo participant [20, 19] [journal] `H.shouldBe` Right ()

    H.it "uses the physical game identity and exact cursor, rather than another table's matching step" do
      validateParticipantUndo third [21] [journal] `H.shouldBe` Right ()
      validateParticipantUndo participant [31] [journal] `H.shouldBe` Right ()
      validateParticipantUndo ("unrelated-game" :: Text) [21] [journal] `H.shouldBe` Right ()

    H.it "allows an origin journal but still checks foreign journals in a mixed undo range" do
      let second = (participant, [(origin, 12), (participant, 22), (third, 32)])
      validateParticipantUndo participant [22] [journal, second] `H.shouldBe` Right ()
      validateParticipantUndo participant [22, 21] [second, journal] `H.shouldBe` rejection
      validateParticipantUndo origin [11] [journal, second] `H.shouldBe` Right ()
      validateParticipantUndo origin [12, 11] [journal, second] `H.shouldBe` rejection

    H.it "does not block a game with no journal in its selected event" do
      validateParticipantUndo participant [21] [] `H.shouldBe` Right ()

    H.it "allows the initiating group's coupled restore while sibling cursors and revision are unchanged" do
      validateParticipantUndo origin [11] [journal] `H.shouldBe` Right ()
      coupledUndoAllowed origin 7 7 expected [(origin, 10), (participant, 21), (third, 31)]
        `H.shouldBe` True

    H.it "rejects an origin restore after a sibling acts or the shared revision changes" do
      coupledUndoAllowed origin 7 7 expected [(origin, 10), (participant, 22), (third, 31)]
        `H.shouldBe` False
      coupledUndoAllowed origin 7 8 expected expected `H.shouldBe` False

    H.it "requires every current sibling to have its recorded cursor" do
      coupledUndoAllowed origin 7 7 [(origin, 11), (participant, 21)] expected `H.shouldBe` False
      coupledUndoAllowed origin 7 7 expected [(origin, 10), (participant, 20), (third, 31)]
        `H.shouldBe` False

  H.it "requires exactly three groups with one to four investigators each" do
    initialEvent (Map.delete GroupC rosters) `H.shouldBe` Left InvalidGroups
    initialEvent (Map.insert GroupB mempty rosters) `H.shouldBe` Left (InvalidInvestigatorCount GroupB)
    initialEvent (Map.insert GroupB (Set.fromList $ map InvestigatorId ["01001", "01002", "01003", "01004", "01005"]) rosters)
      `H.shouldBe` Left (InvalidInvestigatorCount GroupB)

  H.it "allows the same investigator in separate independent groups" do
    Map.map groupInvestigators (eventGroups base) `H.shouldBe` rosters

  H.it "holds the end-round window until all groups arrive, then releases only after all finish" do
    let one = step 1 GroupA (Arrive $ RoundBarrier 1) base
        two = step 2 GroupB (Arrive $ RoundBarrier 1) one
        opened = step 3 GroupC (Arrive $ RoundBarrier 1) two
        doneA = step 4 GroupA (FinishWindow $ RoundBarrier 1) opened
        doneB = step 5 GroupB (FinishWindow $ RoundBarrier 1) doneA
        released = step 6 GroupC (FinishWindow $ RoundBarrier 1) doneB
    barrierOpened (barrierAt one) `H.shouldBe` False
    barrierOpened (barrierAt two) `H.shouldBe` False
    barrierOpened (barrierAt opened) `H.shouldBe` True
    barrierReleased (barrierAt doneB) `H.shouldBe` False
    barrierReleased (barrierAt released) `H.shouldBe` True
    for_ allGroups \group -> bodies group opened `H.shouldBe` [OpenBarrier (RoundBarrier 1) 1]
    for_ allGroups \group -> bodies group released `H.shouldBe`
      [OpenBarrier (RoundBarrier 1) 1, ReleaseBarrier (RoundBarrier 1) 1]

  H.it "rejects a finish acknowledgement before the window opens" do
    applyOperation GroupA (FinishWindow $ RoundBarrier 1) base `H.shouldBe` Left BarrierNotOpen

  H.it "does not hold surviving groups behind a defeated group" do
    let waiting = step 2 GroupB (Arrive $ RoundBarrier 1) $ step 1 GroupA (Arrive $ RoundBarrier 1) base
        opened = step 3 GroupC (SetSurviving False) waiting
    barrierOpened (barrierAt opened) `H.shouldBe` True
    bodies GroupC opened `H.shouldBe` [ResolveTogether 1]
    bodies GroupA opened `H.shouldBe` [OpenBarrier (RoundBarrier 1) 1]

  H.it "retries an operation without changing state, revision, or pending deliveries" do
    let request = Request (operationId 1) GroupA (SelectStory 1 "70035")
        applied = must $ applyRequest request base
    applyRequest request applied `H.shouldBe` Right applied

  H.it "selects one shared story for each stage and cannot select the first card again" do
    let chosen = step 1 GroupA (SelectStory 1 "70035") base
    remainingStories 2 chosen `H.shouldBe` ["70034", "70036", "70037", "70038"]
    applyOperation GroupA (SelectStory 2 "70035") chosen `H.shouldBe` Left InvalidStory
    applyOperation GroupB (SelectStory 2 "70034") chosen `H.shouldBe` Left InvalidStory
    for_ allGroups \group -> bodies group chosen `H.shouldBe` [DrawSharedStory "70035"]

  H.it "keeps Group A's secret hidden from B and C until C earns inspection" do
    let secret = step 1 GroupA (SetSecretChamber "70017") base
        runes = step 2 GroupA (SelectStory 1 "70033") secret
        decoded = step 3 GroupC DecodeRunes runes
        rewarded = step 4 GroupC ResolveRunes decoded
    replicaSecretChamber (must $ replicaFor GroupA secret) `H.shouldBe` Just "70017"
    replicaSecretChamber (must $ replicaFor GroupB secret) `H.shouldBe` Nothing
    replicaSecretChamber (must $ replicaFor GroupC secret) `H.shouldBe` Nothing
    replicaSecretChamber (must $ replicaFor GroupC rewarded) `H.shouldBe` Just "70017"

  H.it "allows the lever act to inspect the actual secret only after the stage barrier releases" do
    let secret = step 1 GroupA (SetSecretChamber "70018") base
        released = openAndFinish (StageBarrier 1) secret
    applyOperation GroupC InspectSecret secret `H.shouldBe` Left InvalidStory
    let inspected = step 20 GroupC InspectSecret released
    NE.last (fromJustNote "inspection delivery" $ nonEmpty $ bodies GroupC inspected) `H.shouldBe` SecretRevealed "70018"

  H.it "requires a local Rune success before aiding another group and retains counters after a reward" do
    let runes = step 1 GroupA (SelectStory 1 "70033") base
    applyOperation GroupA (AidRunes GroupB) runes `H.shouldBe` Left RunesNotDecoded
    let decoded = step 2 GroupA DecodeRunes runes
        aided = step 3 GroupA (AidRunes GroupB) decoded
        first = step 4 GroupB ResolveRunes aided
        second = step 5 GroupB ResolveRunes first
    groupRunes (groupAt GroupB second) `H.shouldBe` 1
    length (filter (== ResolveRuneReward) $ bodies GroupB second) `H.shouldBe` 2

  H.it "Glyph ordering adds horror to all active copies and rewards each group's own player threshold" do
    let glyphs = step 1 GroupA (SelectStory 2 "70038") base
        decoded = step 2 GroupA DecodeGlyphs glyphs
        ordered = step 3 GroupB OrderGlyphs decoded
    groupStories (groupAt GroupA ordered) `H.shouldBe` mempty
    groupStories (groupAt GroupB ordered) `H.shouldBe` Set.singleton "70038"
    groupGlyphHorror (groupAt GroupC ordered) `H.shouldBe` 1
    bodies GroupA ordered `H.shouldSatisfy` elem (ChooseDiagramRecipient "70042")

  H.it "requires three doom in each group and one chosen participant per Rift" do
    let rift = step 1 GroupA (SelectStory 1 "70034") base
        withDoom = foldl' (\state (n, group) -> step n group (SetDoom 3) state) rift $ zip [2 ..] allGroups
        enteredA = step 5 GroupA (EnterRift investigator $ fixtureExchangeId 1) withDoom
        enteredB = step 6 GroupB (EnterRift investigator $ fixtureExchangeId 2) enteredA
        opened = step 7 GroupC (EnterRift investigator $ fixtureExchangeId 3) enteredB
    applyOperation GroupA (EnterRift investigator $ fixtureExchangeId 1) rift `H.shouldBe` Left RiftNotReady
    eventExchanges enteredB `H.shouldBe` mempty
    Map.keys (eventExchanges opened) `H.shouldBe` [fixtureExchangeId 1]
    applyOperation GroupA (EnterRift investigator $ fixtureExchangeId 4) opened `H.shouldBe` Left ExchangeUnavailable

  H.it "lets each Rift participant finish and closes only after all three finish" do
    let opened = openedRift
        finishedA = step 20 GroupA (CloseExchange $ fixtureExchangeId 1) opened
        finishedB = step 21 GroupB (CloseExchange $ fixtureExchangeId 1) finishedA
        closed = step 22 GroupC (CloseExchange $ fixtureExchangeId 1) finishedB
    exchangeClosed (exchangeAt finishedB) `H.shouldBe` False
    exchangeClosed (exchangeAt closed) `H.shouldBe` True
    eventRiftParticipants closed `H.shouldBe` mempty
    applyOperation GroupA (CloseExchange $ fixtureExchangeId 1) finishedA `H.shouldBe` Left ExchangeUnavailable

  H.it "keeps a two-person Paradox exchange private and forbids clue transfers" do
    let opened = step 1 GroupA (OpenParadox investigator GroupB investigator $ fixtureExchangeId 1) base
        parcel = (riftParcel 1) {parcelPermission = ThroughParadox $ fixtureExchangeId 1, parcelCargo = emptyCargo {cargoClues = 1}}
    replicaExchanges (must $ replicaFor GroupC opened) `H.shouldBe` []
    applyOperation GroupA (SendParcel parcel) opened `H.shouldBe` Left InvalidParcel

  H.it "emits commit and receive together and preserves native identity, owner group, and attachments" do
    let snapshot = EntitySnapshot StoryAsset (cardId 1) "70040" (Just investigator) (Just GroupA)
          (Just investigator) (Set.singleton $ cardId 2) [Aeson.object ["kind" Aeson..= ("event" :: Text)]]
          (Aeson.object ["damage" Aeson..= (2 :: Int), "exhausted" Aeson..= True])
        parcel = (riftParcel 1) {parcelCargo = emptyCargo {cargoResources = 2, cargoEntities = [snapshot]}}
        sent = step 20 GroupA (SendParcel parcel) openedRift
    NE.last (fromJustNote "commit" $ nonEmpty $ bodies GroupA sent) `H.shouldBe` CommitParcel parcel
    NE.last (fromJustNote "receive" $ nonEmpty $ bodies GroupB sent) `H.shouldBe` ReceiveParcel parcel
    recordedParcel (fromJustNote "parcel" $ Map.lookup (parcelId parcel) sent.eventParcels) `H.shouldBe` parcel

  H.it "rejects the same entity in two pending parcels and acknowledges receipt once" do
    let snapshot = EntitySnapshot HandCard (cardId 1) "01016" (Just investigator) (Just GroupA) Nothing mempty [] Null
        parcel = (riftParcel 1) {parcelCargo = emptyCargo {cargoEntities = [snapshot]}}
        sent = step 20 GroupA (SendParcel parcel) openedRift
        acknowledged = step 21 GroupB (AcknowledgeParcel $ parcelId parcel) sent
    applyOperation GroupA (SendParcel $ parcel {parcelId = ParcelId $ uuid 2}) sent `H.shouldBe` Left DuplicateEntity
    applyOperation GroupC (AcknowledgeParcel $ parcelId parcel) sent `H.shouldBe` Left InvalidRecipient
    applyOperation GroupB (AcknowledgeParcel $ parcelId parcel) acknowledged `H.shouldBe` Right (acknowledged, [])

  H.it "removes only an acknowledged delivery from the recipient's persistent outbox" do
    let chosen = step 1 GroupA (SelectStory 1 "70035") base
        envelope = fromJustNote "first delivery" $ listToMaybe $ Map.findWithDefault [] GroupA chosen.eventDeliveries
        acknowledged = step 2 GroupA (AcknowledgeDelivery envelope.envelopeId) chosen
    bodies GroupA acknowledged `H.shouldBe` []
    bodies GroupB acknowledged `H.shouldBe` [DrawSharedStory "70035"]

  H.it "resolves Dilemma once, uses the triggering group's doom, and grants each correct diagram" do
    let selected = step 1 GroupA (SelectStory 2 "70036") base
        doomed = step 2 GroupB (SetDoom 4) selected
        resolved = step 3 GroupB (ResolveDilemma investigator) doomed
    bodies GroupB resolved `H.shouldSatisfy` elem (ApplyDilemmaPenalty investigator 4)
    for_ allGroups \group -> bodies group resolved `H.shouldSatisfy` elem (ReceiveDiagram $ diagram group)
    applyOperation GroupB (ResolveDilemma investigator) resolved `H.shouldBe` Left StoryNotActive

  H.it "moves only excess boss damage, preserving total damage across groups" do
    let started = step 2 GroupB (SetBoss 12 2) $ step 1 GroupA (SetBoss 12 17) base
        moved = step 3 GroupA (MoveExcessBossDamage GroupB 5) started
    map (groupBossDamage . (`groupAt` moved)) [GroupA, GroupB] `H.shouldBe` [12, 7]
    applyOperation GroupA (MoveExcessBossDamage GroupB 6) started `H.shouldBe` Left NoExcessDamage

  H.it "resolves all surviving bosses together, once, using the number of survivors" do
    for_ [([], 4), ([GroupC], 3), ([GroupB, GroupC], 2)] \(defeated, result) -> do
      let dead = foldl' (\state (n, group) -> step n group (SetSurviving False) state) base $ zip [1 ..] defeated
          health = foldl' (\state (n, group) -> step n group (SetBoss 12 12) state) dead $ zip [3 ..] allGroups
          won = step 6 GroupA CheckEscape health
          retried = step 7 GroupB CheckEscape won
      eventResolution won `H.shouldBe` Just result
      eventResolution retried `H.shouldBe` Just result
      bodies GroupA retried `H.shouldBe` [ResolveTogether result]

  H.it "roundtrips barriers, in-flight parcels, hidden secret, and delivery receipts" do
    let sent = step 20 GroupA (SendParcel $ riftParcel 1) openedRift
    Aeson.eitherDecode (Aeson.encode sent) `H.shouldBe` Right sent

investigator :: InvestigatorId
investigator = InvestigatorId "01001"

rosters :: Map LabyrinthGroup (Set InvestigatorId)
rosters = Map.fromList [(group, Set.singleton investigator) | group <- allGroups]

base :: EventState
base = must $ initialEvent rosters

uuid n = UUID.fromWords 0 0 0 (fromIntegral n)
operationId n = OperationId $ uuid n
fixtureExchangeId n = ExchangeId $ uuid n
cardId n = unsafeMakeCardId $ uuid n

must :: Show err => Either err a -> a
must = either (error . show) id

step :: Int -> LabyrinthGroup -> Operation -> EventState -> EventState
step n group operation = must . applyRequest (Request (operationId n) group operation)

bodies group state = map envelopeBody $ Map.findWithDefault [] group state.eventDeliveries
groupAt group state = fromJustNote "test group" $ Map.lookup group state.eventGroups
barrierAt state = fromJustNote "round barrier" $ Map.lookup (RoundBarrier 1) state.eventBarriers
exchangeAt state = fromJustNote "Rift exchange" $ Map.lookup (fixtureExchangeId 1) state.eventExchanges

openAndFinish key state = foldl' (\current (n, group, operation) -> step n group operation current) state $
  zipWith (\n group -> (n, group, Arrive key)) [2 ..] allGroups
    <> zipWith (\n group -> (n, group, FinishWindow key)) [5 ..] allGroups

openedRift :: EventState
openedRift = foldl' (\state (n, group) -> step n group (EnterRift investigator $ fixtureExchangeId 1) state) doomed $ zip [5 ..] allGroups
 where
  selected = step 1 GroupA (SelectStory 1 "70034") base
  doomed = foldl' (\state (n, group) -> step n group (SetDoom 3) state) selected $ zip [2 ..] allGroups

riftParcel n = Parcel (ParcelId $ uuid n) GroupA GroupB (Just investigator) (Just investigator)
  (ThroughRift $ fixtureExchangeId 1) emptyCargo
