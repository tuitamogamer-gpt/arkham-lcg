module Arkham.Homebrew.EpicMachinations.Types where

import Arkham.Card.CardCode
import Arkham.Homebrew.EpicLabyrinth.Types (OperationId, DeliveryId)
import Arkham.Id
import Arkham.Prelude
import Arkham.ScenarioLogKey
import Arkham.Token

data Era = PastEra | PresentEra | FutureEra
  deriving stock (Show, Eq, Ord, Enum, Bounded, Generic)
  deriving anyclass (ToJSON, FromJSON, ToJSONKey, FromJSONKey)

allEras :: [Era]
allEras = [PastEra, PresentEra, FutureEra]

data EraProgress = EraProgress
  { eraInvestigators :: Set InvestigatorId
  , eraScientistsEscorted :: Bool
  , eraStories :: Set CardCode
  , eraTindalosClues :: Int
  , eraEdwinAsset :: Bool
  , eraEdwinEnemy :: Bool
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsState = MachinationsState
  { machinationsEras :: Map Era EraProgress
  , machinationsGlobalPlayers :: Int
  , machinationsMachination :: Maybe CardCode
  , machinationsPlot :: Maybe CardCode
  , machinationsAnnouncements :: Set ScenarioLogKey
  , machinationsCompletedStories :: Set CardCode
  , machinationsLocalCompleted :: Map Era (Set CardCode)
  , machinationsBossHealth :: Int
  , machinationsBossRemaining :: Int
  , machinationsResolution :: Maybe Int
  , machinationsApplied :: Set OperationId
  , machinationsDeliveries :: Map Era [MachinationsEnvelope]
  , machinationsRevision :: Int
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsReplica = MachinationsReplica
  { currentEra :: Era
  , globalPlayers :: Int
  , chosenMachination :: Maybe CardCode
  , chosenPlot :: Maybe CardCode
  , announcements :: Set ScenarioLogKey
  , completedStories :: Set CardCode
  , eraProgress :: Map Era EraProgress
  , tyrthrhaMaxHealth :: Int
  , tyrthrhaRemainingHealth :: Int
  , globalResolution :: Maybe Int
  , replicaRevision :: Int
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsOperation
  = SelectMachination CardCode
  | SelectPlot CardCode
  | Announce ScenarioLogKey
  | ReportProgress EraProgress
  | CompleteStory CardCode
  | DepositTindalosClue InvestigatorId
  | TakeTindalosClue InvestigatorId Era
  | DamageTyrthrha Int
  | HealTyrthrha Int
  | SendLocationToken Era CardCode Token Int
  | RemoveRemoteAnomaly Era Text
  | BringEdwin InvestigatorId LocationId
  | CheckTimeline
  | FailTimeline
  | AcknowledgeMachinationsDelivery DeliveryId
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsRequest = MachinationsRequest
  { machinationsRequestId :: OperationId
  , machinationsRequestEra :: Era
  , machinationsRequestOperation :: MachinationsOperation
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsDelivery
  = InstallSharedStory CardCode
  | ReceiveAnnouncement ScenarioLogKey
  | FinishSharedStory CardCode
  | ChangeTindalosClues Int
  | SpendInvestigatorClue InvestigatorId
  | GiveInvestigatorClue InvestigatorId
  | SetTyrthrhaRemaining Int
  | PlaceRemoteToken CardCode Token Int
  | RemoveAnomalyByTitle Text
  | MoveActualEdwin InvestigatorId LocationId
  | ResolveTimeline Int Bool
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsEnvelope = MachinationsEnvelope
  { machinationsDeliveryId :: DeliveryId
  , machinationsDeliveryBody :: MachinationsDelivery
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data MachinationsError
  = WrongEraGroups
  | InvalidEraCount Era
  | WrongStory
  | WrongAnnouncement
  | InvalidEraCounter
  | InvalidEraParticipant
  | NoTindalosClue
  | UnauthorizedEraEffect
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)
