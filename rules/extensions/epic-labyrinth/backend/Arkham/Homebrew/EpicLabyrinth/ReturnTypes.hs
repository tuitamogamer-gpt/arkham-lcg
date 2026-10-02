module Arkham.Homebrew.EpicLabyrinth.ReturnTypes where

import {-# SOURCE #-} Arkham.Card (Card)
import Arkham.Homebrew.EpicLabyrinth.Types (LabyrinthGroup, OperationId)
import Arkham.Id
import Arkham.Prelude

data OwnerReturnDestination = OwnerDiscard | OwnerHand | OwnerDeckTop | OwnerDeckBottom | OwnerDeckShuffle
  deriving stock (Show, Eq, Ord, Generic)
  deriving anyclass (ToJSON, FromJSON)

data OwnerReturnIntent = OwnerReturnIntent
  { returnOwnerGroup :: LabyrinthGroup
  , returnOwnerInvestigator :: InvestigatorId
  , returnCards :: [Card]
  , returnDestination :: OwnerReturnDestination
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data OwnerReturnRequest = OwnerReturnRequest
  { ownerReturnId :: OperationId
  , ownerReturnIntent :: OwnerReturnIntent
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)
