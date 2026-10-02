module Arkham.Homebrew.EpicLabyrinth.Stories.Exchange where

import Arkham.Card
import Arkham.Helpers.Query
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicLabyrinth.Helpers
import {-# SOURCE #-} Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets (getNativeAsset, getNativeAttachments)
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared (originalOwnerGroup, storyAssetSnapshot)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id (InvestigatorId, AssetId, getId)
import Arkham.Investigator.Types (Field (InvestigatorClues, InvestigatorResources, InvestigatorHand))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Arkham.Story.Import.Lifted
import Arkham.Token
import Data.Map.Strict qualified as Map

-- These commands belong to the scenario because Paradox Effect is discarded
-- before its exchange starts. All choices are scoped to the local participant.
data ExchangeCommand
  = PrivateExchange InvestigatorId ExchangeId
  | OfferPrivate InvestigatorId ExchangeId LabyrinthGroup InvestigatorId
  | OfferPrivateToken InvestigatorId ExchangeId LabyrinthGroup InvestigatorId Token Int
  | OfferPrivateHandCard InvestigatorId ExchangeId LabyrinthGroup InvestigatorId CardId
  | OfferPrivateAsset InvestigatorId ExchangeId LabyrinthGroup InvestigatorId AssetId
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

data ExchangeResult
  = NotExchangeMessage
  | ExchangeMessageHandled
  | ExchangeParcelReserved ParcelId InvestigatorId ExchangeId
  | ExchangeParcelReleased ParcelId
  deriving stock (Show, Eq)

privateExchangeMessage :: ExchangeCommand -> Message
privateExchangeMessage = ScenarioSpecific "epicLabyrinth.exchange" . toJSON

handlePrivateExchangeDelivery :: ReverseQueue m => Delivery -> m ExchangeResult
handlePrivateExchangeDelivery = \case
  ExchangeOpened exchange | exchangeKind exchange == ParadoxExchange -> do
    group <- getEpicGroup
    for_ (Map.lookup group $ exchangeParticipants exchange) \iid ->
      push $ privateExchangeMessage $ PrivateExchange iid $ exchangeId exchange
    pure ExchangeMessageHandled
  ParcelAcknowledged pid -> do
    pending <- getScenarioMetaKeyDefault "epicLabyrinthExchangeParcels" mempty
    case Map.lookup pid pending of
      Nothing -> pure NotExchangeMessage
      Just (iid, identifier) -> do
        push $ privateExchangeMessage $ PrivateExchange iid identifier
        pure $ ExchangeParcelReleased pid
  _ -> pure NotExchangeMessage

handlePrivateExchangeMessage :: ReverseQueue m => Message -> m ExchangeResult
handlePrivateExchangeMessage = \case
  ScenarioSpecific "epicLabyrinth.exchange" value | Just command <- maybeResult value -> handle command
  _ -> pure NotExchangeMessage
 where
  handle = \case
    PrivateExchange iid identifier -> do
      allowed <- participating iid identifier
      for_ allowed \exchange -> do
        group <- getEpicGroup
        chooseOneM iid do
          i18nKeyLabeled "Finish the private exchange" $ emitOperation $ CloseExchange identifier
          for_ (Map.toList $ Map.delete group $ exchangeParticipants exchange) \(destination, recipient) ->
            i18nKeyLabeled ("Offer resources, cards or story assets to " <> tshow destination) $
              push $ privateExchangeMessage $ OfferPrivate iid identifier destination recipient
      pure ExchangeMessageHandled
    OfferPrivate iid identifier destination recipient -> do
      allowed <- recipientIsParticipant iid identifier destination recipient
      for_ allowed \exchange -> do
        resources <- field InvestigatorResources iid
        clues <- field InvestigatorClues iid
        hand <- field InvestigatorHand iid
        assets <- select $ AssetControlledBy (InvestigatorWithId iid) <> not_ AssetNonStory
        let tokens = [(Resource, resources)] <> [(Clue, clues) | exchangeKind exchange == RiftExchange]
        chooseOneM iid do
          i18nKeyLabeled "Return to the private exchange" $ push $ privateExchangeMessage $ PrivateExchange iid identifier
          for_ tokens \(token, maximum) -> for_ [1 .. maximum] \amount ->
            i18nKeyLabeled ("Give " <> tshow amount <> " " <> tshow token <> " token(s)")
              $ push $ privateExchangeMessage $ OfferPrivateToken iid identifier destination recipient token amount
          targets hand $ \card -> push $ privateExchangeMessage $ OfferPrivateHandCard iid identifier destination recipient $ toCardId card
          targets assets $ \asset -> push $ privateExchangeMessage $ OfferPrivateAsset iid identifier destination recipient asset
      pure ExchangeMessageHandled
    OfferPrivateToken iid identifier destination recipient token amount -> do
      allowed <- recipientIsParticipant iid identifier destination recipient
      case allowed of
        Just exchange | amount > 0 && (token == Resource || token == Clue && exchangeKind exchange == RiftExchange) -> do
          available <- field (if token == Resource then InvestigatorResources else InvestigatorClues) iid
          if amount > available then pure ExchangeMessageHandled else do
            let cargo = if token == Resource then emptyCargo {cargoResources = amount} else emptyCargo {cargoClues = amount}
            send exchange iid destination recipient cargo
        _ -> pure ExchangeMessageHandled
    OfferPrivateHandCard iid identifier destination recipient cid -> do
      allowed <- recipientIsParticipant iid identifier destination recipient
      hand <- field InvestigatorHand iid
      case (allowed, find ((== cid) . toCardId) hand) of
        (Just exchange, Just card) -> do
          ownerGroup <- originalOwnerGroup card $ toCardOwner card
          let snapshot = EntitySnapshot HandCard cid (toCardCode card) (toCardOwner card) ownerGroup Nothing mempty [] (toJSON card)
          send exchange iid destination recipient $ emptyCargo {cargoEntities = [snapshot]}
        _ -> pure ExchangeMessageHandled
    OfferPrivateAsset iid identifier destination recipient aid -> do
      allowed <- recipientIsParticipant iid identifier destination recipient
      controlled <- aid `matches` (AssetControlledBy (InvestigatorWithId iid) <> not_ AssetNonStory)
      case allowed of
        Just exchange | controlled -> do
          asset <- getNativeAsset aid
          ownerGroup <- originalOwnerGroup asset $ toCardOwner asset
          attachments <- getNativeAttachments $ toTarget asset
          let snapshot = (storyAssetSnapshot ownerGroup asset)
                {snapshotAttachments = setFromList $ map fst attachments, snapshotAttachedEntities = map snd attachments}
          send exchange iid destination recipient $ emptyCargo {cargoEntities = [snapshot]}
        _ -> pure ExchangeMessageHandled
  participating iid identifier = do
    replica <- getEpicReplica
    group <- getEpicGroup
    pure $ find (\exchange -> exchangeId exchange == identifier && not (exchangeClosed exchange)
      && group `notElem` exchangeFinished exchange && Map.lookup group (exchangeParticipants exchange) == Just iid) $ replicaExchanges replica
  recipientIsParticipant iid identifier destination recipient = do
    exchange <- participating iid identifier
    group <- getEpicGroup
    pure $ exchange >>= \active -> do
      guard $ destination /= group && Map.lookup destination (exchangeParticipants active) == Just recipient
      pure active
  send exchange iid destination recipient cargo = do
    origin <- getEpicGroup
    pid <- ParcelId <$> getId
    let permission = case exchangeKind exchange of
          RiftExchange -> ThroughRift $ exchangeId exchange
          ParadoxExchange -> ThroughParadox $ exchangeId exchange
    emitOperation $ SendParcel $ Parcel pid origin destination (Just iid) (Just recipient) permission cargo
    pure $ ExchangeParcelReserved pid iid $ exchangeId exchange
