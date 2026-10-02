module Arkham.Homebrew.EpicLabyrinth.GateConnections (filterGateConnections) where

import Arkham.Agenda.Types (Field (AgendaDoom))
import Arkham.Classes.HasGame
import Arkham.Classes.Query (selectOne)
import Arkham.Helpers.Scenario
import Arkham.Id
import Arkham.Matcher
import Arkham.Prelude
import Arkham.Projection

-- Connection filtering applies in both directions and to distance queries as
-- well as ordinary moves. It does not prohibit a card effect's direct move.
filterGateConnections :: HasGame m => LocationId -> LocationMatcher -> m LocationMatcher
filterGateConnections from connections = do
  active <- getScenarioMetaKeyDefault "epicMultiplayer" False
  isolated <- getScenarioMetaKeyDefault "epicLabyrinthIsolated" []
  agenda <- selectOne UnflippedAgenda
  doom <- maybe (pure 0) (field AgendaDoom) agenda
  pure $ if not active || doom >= 5 then connections else
    if from `elem` isolated then Nowhere else connections <> not_ (oneOf $ map LocationWithId isolated)
