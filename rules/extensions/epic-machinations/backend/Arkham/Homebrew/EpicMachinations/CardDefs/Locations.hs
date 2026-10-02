module Arkham.Homebrew.EpicMachinations.CardDefs.Locations where

import Arkham.Location.CardDefs.Import

tindalosEpic :: CardDef
tindalosEpic = (location "87005b" ("Tindalos" <:> "Maze of Infinite Depths") [Past, Present, Future]
  NoSymbol [] MachinationsThroughTimeEpicMultiplayer)
    -- Common encounter cards name Tindalos without naming a mode-specific face.
    -- Preserve that matcher identity while the registry keeps the Epic face and
    -- its independently scripted printed abilities under the exact 87005b code.
    {cdReplacementCardCode = Just "87005"}
