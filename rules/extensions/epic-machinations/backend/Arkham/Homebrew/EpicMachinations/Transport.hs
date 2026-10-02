module Arkham.Homebrew.EpicMachinations.Transport (moveEdwin, edwinInteractionPending) where

import Arkham.Asset.Types (Asset, AssetAttrs (..))
import Arkham.Card
import Arkham.Classes.Entity
import Arkham.Enemy.Types (Enemy, EnemyAttrs (..))
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicLabyrinth.Transfer (connectedGroup, moveNativeGraph, originalOwner)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Homebrew.EpicMachinations.NativeEntities (nativeAttachmentSnapshots)
import Arkham.Id
import Arkham.Investigator.Types (InvestigatorAttrs (..))
import Arkham.Message
import Arkham.Placement
import Arkham.Prelude
import Arkham.Target (Targetable, toTarget)
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Map.Strict qualified as Map

data Edwin = EdwinEnemy Enemy | EdwinAsset Asset

moveEdwin :: InvestigatorId -> LocationId -> Game -> Game -> Either Text (Game, Game)
moveEdwin iid lid sender receiver = do
  actor <- maybe (Left "Moving investigator is absent") Right $ Map.lookup iid $ entitiesInvestigators $ gameEntities receiver
  require (not $ investigatorEliminated $ toAttrs actor) "Moving investigator is eliminated"
  require (Map.member lid $ entitiesLocations $ gameEntities receiver) "Edwin destination is absent"
  require (investigatorPlacement (toAttrs actor) == AtLocation lid) "Edwin must move to the acting investigator's location"
  sourceGroup <- connectedGroup sender
  destinationGroup <- connectedGroup receiver
  entity <- case edwins sender of [one] -> Right one; _ -> Left "Origin must contain exactly one physical Edwin"
  if sourceGroup == destinationGroup then do
    require (sender == receiver) "Local Edwin move received conflicting game states"
    let moved = placeReady iid lid entity sender
    pure (moved, moved)
  else do
    require (not $ edwinInteractionPending sender []) "Edwin is part of an unresolved interaction in its current era"
    require (null $ edwins receiver) "Recipient already has a physical Edwin"
    snapshot <- snapshotEdwin sender entity
    (sent, received) <- moveNativeGraph [snapshot] Nothing (Just $ AtLocation lid) sender receiver
    pure (sent, placeReady iid lid entity received)

edwins :: Game -> [Edwin]
edwins game = [EdwinEnemy enemy | enemy <- toList $ entitiesEnemies $ gameEntities game,
    toCardCode enemy `elem` ["87037", "87037a"], enemy.placement.isInPlay]
  <> [EdwinAsset asset | asset <- toList $ entitiesAssets $ gameEntities game,
    toCardCode asset == "87037b", asset.placement.isInPlay]

snapshotEdwin :: Game -> Edwin -> Either Text EntitySnapshot
snapshotEdwin game = \case
  EdwinEnemy enemy ->
    -- moveNativeGraph uses this structural enemy tag internally; no Jailor
    -- parcel permission or printed Jailor identity is involved in this move.
    pure $ header Jailor enemy Nothing Nothing
  EdwinAsset asset -> do
    owner <- originalOwner (toCard asset) game
    pure $ header StoryAsset asset (fst <$> owner) (assetController $ toAttrs asset)
 where
  header :: (IsCard card, Targetable card, ToJSON card) => EntityKind -> card -> Maybe LabyrinthGroup -> Maybe InvestigatorId -> EntitySnapshot
  header kind card group controller =
    let attached = nativeAttachmentSnapshots game $ toTarget card
    in EntitySnapshot kind (toCardId card) (toCardCode card) (toCardOwner card) group controller
      (setFromList $ map fst attached) (map snd attached) (toJSON card)

-- Match exact native UUID values, including the physical CardId. Only an
-- interaction referencing this actual Edwin blocks transport; unrelated
-- questions/tests elsewhere in the donor game remain untouched.
edwinInteractionPending :: Game -> [Message] -> Bool
edwinInteractionPending game queued =
  let identifiers = concatMap (\case
        EdwinEnemy enemy -> [toJSON $ toId enemy, toJSON $ toCardId enemy]
        EdwinAsset asset -> [toJSON $ toId asset, toJSON $ toCardId asset]) $ edwins game
      references value
        | value `elem` identifiers = True
      references (Object values) = any references $ KeyMap.elems values
      references (Array values) = any references values
      references _ = False
  in any references [toJSON $ gameQuestion game, toJSON $ gameSkillTest game, toJSON $ gameActiveCost game,
      toJSON $ gameActiveAbilities game, toJSON queued]

placeReady :: InvestigatorId -> LocationId -> Edwin -> Game -> Game
placeReady _ lid entity game = game {gameEntities = case entity of
  EdwinEnemy enemy -> (gameEntities game) {entitiesEnemies = Map.adjust
    (overAttrs \attrs -> attrs {enemyPlacement = AtLocation lid, enemyExhausted = False,
      enemyLastKnownLocation = Just lid}) (toId enemy) $ entitiesEnemies $ gameEntities game}
  EdwinAsset asset -> (gameEntities game) {entitiesAssets = Map.adjust
    (overAttrs \attrs -> attrs {assetPlacement = AtLocation lid, assetExhausted = False})
    (toId asset) $ entitiesAssets $ gameEntities game}}

require :: Bool -> Text -> Either Text ()
require True _ = Right ()
require False message = Left message
