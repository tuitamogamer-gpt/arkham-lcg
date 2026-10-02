module Arkham.Homebrew.EpicMachinations.Gate (gateMachinationsMessage) where

import Arkham.Classes.Entity
import Arkham.Game.Base
import Arkham.Homebrew.EpicLabyrinth.ReturnBridge (gateOwnerReturn)
import Arkham.Homebrew.EpicMachinations.Coordinator (announcementEra)
import Arkham.Message
import Arkham.Prelude
import Arkham.Scenario.Types

-- Machinations has no round or agenda barrier. Only the common setup choices
-- and the printed announcement messages require event-wide coordination.
gateMachinationsMessage :: Game -> Message -> Message
gateMachinationsMessage game original = fromMaybe message do
  scenario <- case game.gameMode of
    That s -> Just s
    These _ s -> Just s
    _ -> Nothing
  let attrs = toAttrs scenario
  guard $ attrs.id == "87001" && getMetaKeyDefault "epicMultiplayer" False attrs
  case message of
    Remember key | isJust $ announcementEra key ->
      Just $ ScenarioSpecific "epicMachinations.announce" $ toJSON key
    EndSetup | length (getMetaKeyDefault "epicMachinationsInstalledStories" [] attrs :: [Text]) < 2 ->
      Just $ ScenarioSpecific "epicMachinations.waitSetup" Null
    _ -> Nothing
 where
  message = gateOwnerReturn game original
