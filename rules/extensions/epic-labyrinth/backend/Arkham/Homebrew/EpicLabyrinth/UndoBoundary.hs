module Arkham.Homebrew.EpicLabyrinth.UndoBoundary
  ( validateParticipantUndo
  , coupledUndoAllowed
  ) where

import Arkham.Prelude
import Data.List qualified as List

-- A foreign table's synthetic step has no native inverse: its physical changes
-- belong to the originating table's coupled journal. Do not let an empty-patch
-- undo remove that cursor and expose older local inverses across the transfer.
-- A multi-step undo must pass the same check for every step it crosses.
validateParticipantUndo
  :: Eq game
  => game
  -> [Int]
  -> [(game, [(game, Int)])]
  -> Either Text ()
validateParticipantUndo actor steps journals =
  if any foreignBoundary journals
    then Left "Cannot undo another group's shared effect; undo from the originating group"
    else Right ()
 where
  foreignBoundary (origin, participants) = origin /= actor
    && any (\step -> (actor, step) `elem` participants) steps

-- The initiating table may rewind a coupled transaction only while every
-- sibling still has its exact committed cursor and the shared revision agrees.
-- Its own cursor may already have been decremented by the native undo handler.
coupledUndoAllowed
  :: Eq game
  => game
  -> Int
  -> Int
  -> [(game, Int)]
  -> [(game, Int)]
  -> Bool
coupledUndoAllowed actor expectedRevision currentRevision expectedSteps currentSteps =
  currentRevision == expectedRevision
    && all (\(game, step) -> game == actor || List.lookup game expectedSteps == Just step) currentSteps
