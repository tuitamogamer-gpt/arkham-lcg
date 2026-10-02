module Arkham.Homebrew.EpicLabyrinth.ReturnBridge
  ( gateOwnerReturn
  , transferOwnerReturn
  , ownerReturnRequests
  , acknowledgeOwnerReturn
  ) where

import Arkham.Card
import Arkham.Classes.Entity
import Arkham.Deck qualified as Deck
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Transfer (connectedGroup, detachReturningCards, originalOwner, requireCardIdsFree)
import Arkham.Homebrew.EpicLabyrinth.Types (LabyrinthGroup, OperationId)
import Arkham.Investigator.Types (InvestigatorAttrs (..))
import Arkham.Message
import Arkham.Prelude
import Arkham.Scenario.Types (Scenario, ScenarioAttrs (..), getMetaKeyDefault, setMetaKey)
import Data.Map.Strict qualified as Map

-- Split mixed batches: local cards keep their ordinary native message, while
-- foreign cards are addressed by owner GROUP and investigator together.
-- An investigator code shared by two tables never changes this routing.
gateOwnerReturn :: Game -> Message -> Message
gateOwnerReturn game message = fromMaybe message do
  active <- activeScenario game
  let attrs = toAttrs active
  guard $ attrs.id `elem` ["70001", "87001"] && getMetaKeyDefault "epicMultiplayer" False attrs
  currentGroup <- either (const Nothing) Just $ connectedGroup game
  let owners = getMetaKeyDefault "epicLabyrinthOwners" mempty attrs :: Map CardId LabyrinthGroup
      foreignOwner card = do
        iid <- toCardOwner card
        group <- Map.lookup (toCardId card) owners
        guard $ group /= currentGroup
        pure (group, iid)
      route destination cards retain = do
        let (local, returning) = partition (isNothing . foreignOwner) cards
            groups = Map.fromListWith (flip (<>))
              [(owner, [card]) | card <- returning, Just owner <- [foreignOwner card]]
        guard $ not $ null returning
        let intents = [ScenarioSpecific "epicLabyrinth.ownerReturn" $ toJSON $
              OwnerReturnIntent group iid batch destination | ((group, iid), batch) <- Map.toList groups]
        pure $ Run $ [retain local | not $ null local] <> intents
  case message of
    AddToDiscard iid card -> route OwnerDiscard [PlayerCard card] $ \case
      [PlayerCard local] -> AddToDiscard iid local
      _ -> Run []
    AddToHand iid cards -> route OwnerHand cards $ AddToHand iid
    Do (AddToHand iid cards) -> route OwnerHand cards $ Do . AddToHand iid
    ShuffleCardsIntoDeck deck@(Deck.InvestigatorDeck _) cards ->
      route OwnerDeckShuffle cards $ ShuffleCardsIntoDeck deck
    PutCardOnTopOfDeck iid deck@(Deck.InvestigatorDeck _) card ->
      route OwnerDeckTop [card] $ \case [local] -> PutCardOnTopOfDeck iid deck local; _ -> Run []
    PutCardOnBottomOfDeck iid deck@(Deck.InvestigatorDeck _) card ->
      route OwnerDeckBottom [card] $ \case [local] -> PutCardOnBottomOfDeck iid deck local; _ -> Run []
    _ -> Nothing

-- The server persists both native games and the receiver's queue together.
-- Receiver-side native messages own hand/discard hooks and deck shuffling;
-- they run with the receiving game's RNG and preserve an unrelated question.
transferOwnerReturn :: OwnerReturnRequest -> Game -> Game -> Either Text (Game, Game, [Message])
transferOwnerReturn request current receiver = do
  let intent = ownerReturnIntent request
      cards = returnCards intent
      iid = returnOwnerInvestigator intent
  require (not $ null cards) "Empty owner return"
  destination <- groupOf receiver
  source <- groupOf current
  require (destination == returnOwnerGroup intent && source /= destination) "Wrong owner-return groups"
  require (Map.member iid $ entitiesInvestigators $ gameEntities receiver) "Original owner is absent from receiving group"
  for_ cards $ \card -> do
    actual <- originalOwner card current
    require (actual == Just (destination, iid)) "Card does not belong to the return recipient"
  changed <- detachReturningCards cards current
  -- Reserve the exact physical cards immediately so deferred native messages
  -- cannot collide with a later transfer into this recipient.
  let known = gameCards receiver
  requireCardIdsFree (map toCardId cards) receiver
  let reserved = receiver {gameCards = foldl' (\values card -> Map.insert (toCardId card) card values) known cards}
      messages = case returnDestination intent of
        OwnerDiscard -> [AddToDiscard iid pc | PlayerCard pc <- cards]
        OwnerHand -> [AddToHand iid cards]
        OwnerDeckTop -> [PutCardOnTopOfDeck iid (Deck.InvestigatorDeck iid) card | card <- reverse cards]
        OwnerDeckBottom -> [PutCardOnBottomOfDeck iid (Deck.InvestigatorDeck iid) card | card <- cards]
        OwnerDeckShuffle -> [ShuffleCardsIntoDeck (Deck.InvestigatorDeck iid) cards]
  require (all (\case PlayerCard _ -> True; _ -> False) cards) "Only owned player cards return to an investigator"
  pure (changed, reserved, messages)

ownerReturnRequests :: Game -> [OwnerReturnRequest]
ownerReturnRequests game = maybe [] (getMetaKeyDefault "epicLabyrinthOwnerReturns" [] . toAttrs) $ activeScenario game

acknowledgeOwnerReturn :: OperationId -> Game -> Game
acknowledgeOwnerReturn identifier game = case activeScenario game of
  Nothing -> game
  Just active ->
    let remaining = filter ((/= identifier) . ownerReturnId) $ ownerReturnRequests game
        changed = overAttrs (setMetaKey "epicLabyrinthOwnerReturns" remaining) active
    in game {gameMode = case gameMode game of
      That _ -> That changed
      These campaign _ -> These campaign changed
      This campaign -> This campaign}

activeScenario :: Game -> Maybe Scenario
activeScenario game = case gameMode game of That active -> Just active; These _ active -> Just active; _ -> Nothing

groupOf :: Game -> Either Text LabyrinthGroup
groupOf = connectedGroup

require :: Bool -> Text -> Either Text ()
require True _ = Right ()
require False message = Left message
