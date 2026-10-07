module Arkham.Homebrew.EpicLabyrinth.Types where

import Arkham.Card.CardCode
import Arkham.Card.Id
import Arkham.Id
import Arkham.Prelude

data LabyrinthGroup = GroupA | GroupB | GroupC
  deriving stock (Show, Eq, Ord, Enum, Bounded, Generic)
  deriving anyclass (ToJSON, FromJSON, ToJSONKey, FromJSONKey)

allGroups :: [LabyrinthGroup]
allGroups = [GroupA, GroupB, GroupC]

-- The native event creator previously persisted Show's quoted Text form.
-- Accept that exact legacy spelling as well as the canonical raw code, using
-- Text equality so a scenario's back face cannot become an event identity.
matchesStoredScenarioId :: ScenarioId -> Maybe Text -> Bool
matchesStoredScenarioId expected stored = stored `elem`
  [Just $ unCardCode $ toCardCode expected, Just $ tshow expected]

newtype OperationId = OperationId UUID
  deriving stock Show
  deriving newtype (Eq, Ord, ToJSON, FromJSON, ToJSONKey, FromJSONKey)

newtype ParcelId = ParcelId UUID
  deriving stock Show
  deriving newtype (Eq, Ord, ToJSON, FromJSON, ToJSONKey, FromJSONKey)

newtype ExchangeId = ExchangeId UUID
  deriving stock Show
  deriving newtype (Eq, Ord, ToJSON, FromJSON, ToJSONKey, FromJSONKey)

newtype DeliveryId = DeliveryId Text
  deriving stock Show
  deriving newtype (Eq, Ord, ToJSON, FromJSON, ToJSONKey, FromJSONKey)

data EntityKind = HandCard | ItemAsset | StoryAsset | Jailor | Pet
  deriving stock (Show, Eq, Ord, Generic)
  deriving anyclass (ToJSON, FromJSON)

-- The transport does not rebuild a card from its name. Its original identity,
-- owner and complete native attributes travel together. The server adapter
-- decodes the attributes using the entity kind before accepting the operation.
data EntitySnapshot = EntitySnapshot
  { snapshotKind :: EntityKind
  , snapshotCardId :: CardId
  , snapshotCardCode :: CardCode
  , snapshotOwner :: Maybe InvestigatorId
  , snapshotOwnerGroup :: Maybe LabyrinthGroup
  , snapshotController :: Maybe InvestigatorId
  , snapshotAttachments :: Set CardId
  , snapshotAttachedEntities :: [Value]
  , snapshotNative :: Value
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Cargo = Cargo
  { cargoResources :: Int
  , cargoClues :: Int
  , cargoEntities :: [EntitySnapshot]
  , cargoNotes :: [Text]
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

emptyCargo :: Cargo
emptyCargo = Cargo 0 0 [] []

data Permission
  = ThroughVent
  | ThroughRift ExchangeId
  | ThroughParadox ExchangeId
  | MoveJailor
  | MovePet
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Parcel = Parcel
  { parcelId :: ParcelId
  , parcelOrigin :: LabyrinthGroup
  , parcelDestination :: LabyrinthGroup
  , parcelSender :: Maybe InvestigatorId
  , parcelRecipient :: Maybe InvestigatorId
  , parcelPermission :: Permission
  , parcelCargo :: Cargo
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data ParcelStatus = InTransit | Delivered | Recalled
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data ParcelRecord = ParcelRecord
  { recordedParcel :: Parcel
  , parcelStatus :: ParcelStatus
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data ExchangeKind = RiftExchange | ParadoxExchange
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Exchange = Exchange
  { exchangeId :: ExchangeId
  , exchangeKind :: ExchangeKind
  , exchangeParticipants :: Map LabyrinthGroup InvestigatorId
  , exchangeClosed :: Bool
  , exchangeFinished :: Set LabyrinthGroup
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data BarrierKey = RoundBarrier Int | StageBarrier Int
  deriving stock (Show, Eq, Ord, Generic)
  deriving anyclass (ToJSON, FromJSON, ToJSONKey, FromJSONKey)

data Barrier = Barrier
  { barrierArrived :: Set LabyrinthGroup
  , barrierFinished :: Set LabyrinthGroup
  , barrierOpened :: Bool
  , barrierReleased :: Bool
  , barrierGeneration :: Int
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

emptyBarrier :: Barrier
emptyBarrier = Barrier mempty mempty False False 0

data GroupState = GroupState
  { groupInvestigators :: Set InvestigatorId
  , groupSurviving :: Bool
  , groupDoom :: Int
  , groupBossHealth :: Int
  , groupBossDamage :: Int
  , groupRunes :: Int
  , groupDecodedRunes :: Bool
  , groupSawSecret :: Bool
  , groupGlyphDamage :: Int
  , groupGlyphHorror :: Int
  , groupStories :: Set CardCode
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

initialGroup :: Set InvestigatorId -> GroupState
initialGroup investigators = GroupState investigators True 0 0 0 0 False False 0 0 mempty

data EventState = EventState
  { eventGroups :: Map LabyrinthGroup GroupState
  , eventBarriers :: Map BarrierKey Barrier
  , eventParcels :: Map ParcelId ParcelRecord
  , eventExchanges :: Map ExchangeId Exchange
  , eventRiftParticipants :: Map LabyrinthGroup InvestigatorId
  , eventRiftExchangeId :: Maybe ExchangeId
  , eventStoryChoices :: Map Int CardCode
  , eventAppliedOperations :: Set OperationId
  , eventDilemmaResolved :: Bool
  , eventSecretChamber :: Maybe CardCode
  , eventJailorGroup :: Maybe LabyrinthGroup
  , eventDeliveries :: Map LabyrinthGroup [DeliveryEnvelope]
  , eventResolution :: Maybe Int
  , eventRevision :: Int
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

-- No other group's hidden card attributes, hands or parcels are replicated.
-- The secret chamber is included for C only after the runes permit inspection.
data Replica = Replica
  { replicaGroup :: LabyrinthGroup
  , replicaGroups :: Map LabyrinthGroup GroupState
  , replicaStoryChoices :: Map Int CardCode
  , replicaSecretChamber :: Maybe CardCode
  , replicaExchanges :: [Exchange]
  , replicaRevision :: Int
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Operation
  = Arrive BarrierKey
  | FinishWindow BarrierKey
  | SetDoom Int
  | SetSurviving Bool
  | SetBoss Int Int
  | SelectStory Int CardCode
  | SetSecretChamber CardCode
  | InspectSecret
  | AssignJailor LabyrinthGroup
  | DecodeRunes
  | ResolveRunes
  | AidRunes LabyrinthGroup
  | DecodeGlyphs
  | OrderGlyphs
  | EnterRift InvestigatorId ExchangeId
  | OpenParadox InvestigatorId LabyrinthGroup InvestigatorId ExchangeId
  | CloseExchange ExchangeId
  | SendParcel Parcel
  | AcknowledgeParcel ParcelId
  | AcknowledgeDelivery DeliveryId
  | ResolveDilemma InvestigatorId
  | MoveExcessBossDamage LabyrinthGroup Int
  | MoveAllBossDamage LabyrinthGroup
  | SendPet LabyrinthGroup
  | CheckEscape
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Request = Request
  { requestId :: OperationId
  , requestOrigin :: LabyrinthGroup
  , requestOperation :: Operation
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data Delivery
  = OpenBarrier BarrierKey Int
  | ReleaseBarrier BarrierKey Int
  | DrawSharedStory CardCode
  | SetRuneResources Int
  | ResolveRuneReward
  | SetGlyphCounters Int Int
  | ChooseDiagramRecipient CardCode
  | RemoveSharedStory CardCode
  | ExchangeOpened Exchange
  | ExchangeEnded ExchangeId
  | ReceiveParcel Parcel
  | CommitParcel Parcel
  | ParcelAcknowledged ParcelId
  | ChangeBossDamage Int
  | ResolveTogether Int
  | SecretRevealed CardCode
  | ShuffleJailor
  | SpawnPetAtRoundEnd
  | ApplyDilemmaPenalty InvestigatorId Int
  | ReceiveDiagram CardCode
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data RoutedDelivery = RoutedDelivery
  { deliveryGroup :: LabyrinthGroup
  , deliveryBody :: Delivery
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data DeliveryEnvelope = DeliveryEnvelope
  { envelopeId :: DeliveryId
  , envelopeBody :: Delivery
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data RulesError
  = InvalidGroups
  | InvalidInvestigatorCount LabyrinthGroup
  | InvestigatorInSeveralGroups
  | UnknownGroup
  | InvalidCounter
  | BarrierNotOpen
  | StoryNotActive
  | InvalidStory
  | RunesNotDecoded
  | SameDestination
  | InvestigatorNotInGroup
  | RiftNotReady
  | ExchangeUnavailable
  | InvalidParcel
  | DuplicateEntity
  | ParcelAlreadyExists
  | ParcelMissing
  | InvalidRecipient
  | NoExcessDamage
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)
