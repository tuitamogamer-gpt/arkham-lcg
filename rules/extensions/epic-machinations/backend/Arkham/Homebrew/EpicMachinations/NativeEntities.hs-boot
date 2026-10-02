module Arkham.Homebrew.EpicMachinations.NativeEntities where

import Arkham.Classes.HasGame
import Arkham.Prelude
import Arkham.Target

getDirectAttachmentTargets :: HasGame m => Target -> m [Target]
