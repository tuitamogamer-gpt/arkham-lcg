module Arkham.Homebrew.EpicMachinations.Transactions
  ( depositTindalosClue
  , takeTindalosClue
  , setSharedTyrthrha
  , nativeEraProgress
  ) where

import Arkham.Asset.Types (AssetAttrs (..))
import Arkham.Card
import Arkham.Classes.Entity
import Arkham.Enemy.Types (EnemyAttrs (..))
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id
import Arkham.Investigator.Types (InvestigatorAttrs (..))
import Arkham.Location.Types (LocationAttrs (..))
import Arkham.Placement
import Arkham.Prelude
import Arkham.Token (Token (Clue, Damage))
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set

-- The coordinator and both native token maps are committed together. The
-- corresponding scenario deliveries only acknowledge this physical transfer.
depositTindalosClue :: InvestigatorId -> Game -> Either Text Game
depositTindalosClue iid game = do
  investigator <- maybe (Left "Clue donor is absent") Right $ Map.lookup iid $ entitiesInvestigators $ gameEntities game
  require (not $ investigatorEliminated $ toAttrs investigator) "Clue donor has been eliminated"
  let attrs = toAttrs investigator
  require (Map.findWithDefault 0 Clue attrs.investigatorTokens > 0) "Clue donor has no clue"
  location <- tindalos game
  let lid = toId location
      donor = overAttrs (\a -> a {investigatorTokens = change Clue (-1) a.investigatorTokens}) investigator
      receiver = overAttrs (\a -> a {locationTokens = change Clue 1 a.locationTokens}) location
      entities = gameEntities game
  pure game {gameEntities = entities
    {entitiesInvestigators = Map.insert iid donor entities.entitiesInvestigators,
     entitiesLocations = Map.insert lid receiver entities.entitiesLocations}}

takeTindalosClue :: InvestigatorId -> Game -> Game -> Either Text (Game, Game)
takeTindalosClue iid source destination = do
  location <- tindalos source
  require (Map.findWithDefault 0 Clue (toAttrs location).locationTokens > 0) "Source era has no Tindalos clue"
  investigator <- maybe (Left "Clue recipient is absent") Right $ Map.lookup iid $ entitiesInvestigators $ gameEntities destination
  require (not $ investigatorEliminated $ toAttrs investigator) "Clue recipient has been eliminated"
  let removed = overAttrs (\a -> a {locationTokens = change Clue (-1) a.locationTokens}) location
      given = overAttrs (\a -> a {investigatorTokens = change Clue 1 a.investigatorTokens}) investigator
      a = gameEntities source
      b = gameEntities destination
  pure (source {gameEntities = a {entitiesLocations = Map.insert (toId removed) removed a.entitiesLocations}},
    destination {gameEntities = b {entitiesInvestigators = Map.insert iid given b.entitiesInvestigators}})

-- Absolute mirroring is safe even while another table has a pending decision.
-- Its native enemy runner subsequently handles the printed defeat window.
setSharedTyrthrha :: Int -> Int -> Game -> Game
setSharedTyrthrha maximum remaining game = game {gameEntities = entities
  {entitiesEnemies = Map.map update entities.entitiesEnemies}}
 where
  entities = gameEntities game
  update enemy | toCardCode enemy == "87043" = overAttrs (\attrs -> attrs
    {enemyTokens = Map.insert Damage (max 0 $ maximum - remaining) attrs.enemyTokens}) enemy
  update enemy = enemy

nativeEraProgress :: Era -> Game -> EraProgress
nativeEraProgress era game = EraProgress
  (Map.keysSet entities.entitiesInvestigators) escorted
  (Set.fromList $ map toCardCode $ Map.elems entities.entitiesStories)
  (sum [Map.findWithDefault 0 Clue (toAttrs location).locationTokens |
    location <- Map.elems entities.entitiesLocations, toCardCode location == "87005b"])
  (any (\asset -> toCardCode asset == "87037b" && asset.placement.isInPlay) $ Map.elems entities.entitiesAssets)
  (any (\enemy -> toCardCode enemy `elem` ["87037", "87037a"] && enemy.placement.isInPlay)
    $ Map.elems entities.entitiesEnemies)
 where
  -- Native removal and flipping retain entity records for historical
  -- references. Only Edwin's live face determines the shared ending and
  -- cross-era action availability, as in the native play-area matchers.
  entities = gameEntities game
  scientists = case era of
    PastEra -> ["87012", "87013"]
    PresentEra -> ["87021", "87022"]
    FutureEra -> ["87030", "87031"]
  outsideTindalos asset = case (toAttrs asset).assetPlacement of
    AtLocation lid -> maybe False ((/= "87005b") . toCardCode) $ Map.lookup lid entities.entitiesLocations
    InPlayArea iid -> case Map.lookup iid entities.entitiesInvestigators of
      Just investigator -> case (toAttrs investigator).investigatorPlacement of
        AtLocation lid -> maybe False ((/= "87005b") . toCardCode) $ Map.lookup lid entities.entitiesLocations
        _ -> False
      _ -> False
    _ -> False
  escorted = all (\code -> any (\asset -> toCardCode asset == code && outsideTindalos asset)
    $ Map.elems entities.entitiesAssets) scientists

tindalos game = case filter ((== "87005b") . toCardCode) $ Map.elems $ entitiesLocations $ gameEntities game of
  [location] -> Right location
  _ -> Left "An era requires exactly one Epic Tindalos location"

change token amount = Map.alter (Just . max 0 . (+ amount) . fromMaybe 0) token
require True _ = Right ()
require False message = Left message
