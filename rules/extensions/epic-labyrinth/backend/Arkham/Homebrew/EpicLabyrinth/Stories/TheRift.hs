module Arkham.Homebrew.EpicLabyrinth.Stories.TheRift (theRift) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Card
import {-# SOURCE #-} Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets (getNativeAsset, getNativeAttachments)
import Arkham.Helpers.Query
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id (InvestigatorId, getId)
import Arkham.Investigator.Types (Field (InvestigatorClues, InvestigatorResources, InvestigatorHand))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Arkham.Placement
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token
import Arkham.Trait (Trait (Distortion))
import Data.Map.Strict qualified as Map

newtype TheRift = TheRift StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theRift :: StoryCard TheRift
theRift = story TheRift Cards.theRift & persistStory

instance HasAbilities TheRift where
  getAbilities (TheRift a) =
    [mkAbility a 1 $ forced $ RoundEnds #when | riftMinimumDoom (memory a) >= 3]

instance RunMessage TheRift where
  runMessage msg s@(TheRift a) = runQueueT $ case msg of
    _ | Just iid <- readInvestigator a msg -> do
      act <- selectJust AnyAct
      group <- getEpicGroup
      firstAct <- selectAny $ ActWithStep 1
      when (firstAct && group /= GroupA) do
        locations <- select $ LocationWithTrait Distortion
        chooseOneM iid $ targets locations \lid ->
          withSetAsideCard Assets.keyOfMysteries $ \key -> void $ createAssetAt key $ AtLocation lid
      pure $ TheRift a {storyPlacement = AttachedToAct act}
    ScenarioSpecific "epicLabyrinth.replica" value -> case maybeResult value of
      Just replica -> pure $ TheRift $ remember
        ((memory a) {riftMinimumDoom = fromMaybe 0 $ minimumMay $ map groupDoom $ Map.elems $ replicaGroups replica}) a
      Nothing -> pure s
    UseThisAbility iid (isSource a -> True) 1 -> do
      investigators <- select UneliminatedInvestigator
      replica <- getEpicReplica
      identifier <- case find (\exchange -> exchangeKind exchange == RiftExchange && not (exchangeClosed exchange)) (replicaExchanges replica) of
        Just exchange -> pure $ exchangeId exchange
        Nothing -> ExchangeId <$> getId
      chooseOneM iid $ targets investigators $ \entrant -> emitOperation $ EnterRift entrant identifier
      pure s
    _ | Just (ExchangeOpened exchange, updated) <- newDelivery a msg, exchangeKind exchange == RiftExchange -> do
      group <- getEpicGroup
      for_ (Map.lookup group $ exchangeParticipants exchange) $ \iid ->
        push $ storyCommand updated $ OpenRiftExchange iid $ exchangeId exchange
      pure $ TheRift updated
    _ | Just (OpenRiftExchange iid identifier) <- commandFor a msg -> do
      replica <- getEpicReplica
      group <- getEpicGroup
      case find ((== identifier) . exchangeId) (replicaExchanges replica) of
        Just exchange | not (exchangeClosed exchange) && Map.lookup group (exchangeParticipants exchange) == Just iid -> do
          chooseOneM iid do
            i18nKeyLabeled "Finish private exchange and return to your original group" $ emitOperation $ CloseExchange identifier
            for_ (Map.toList $ Map.delete group $ exchangeParticipants exchange) \(destination, recipient) ->
              i18nKeyLabeled ("Offer resources, clues, cards or story assets to " <> tshow destination) $
                push $ storyCommand a $ OfferExchange iid identifier destination recipient
        _ -> pure ()
      pure s
    _ | Just (OfferExchange iid identifier destination recipient) <- commandFor a msg -> do
      resources <- field InvestigatorResources iid
      clues <- field InvestigatorClues iid
      hand <- field InvestigatorHand iid
      assets <- select $ AssetControlledBy (InvestigatorWithId iid) <> not_ AssetNonStory
      chooseOneM iid do
        i18nKeyLabeled "Return to the private exchange" $ push $ storyCommand a $ OpenRiftExchange iid identifier
        for_ [(Resource, resources), (Clue, clues)] \(token, maximum) -> for_ [1 .. maximum] \amount ->
          i18nKeyLabeled ("Give " <> tshow amount <> " " <> tshow token <> " token(s)")
            $ push $ storyCommand a $ OfferExchangeToken iid identifier destination recipient token amount
        targets hand $ \card -> push $ storyCommand a $ OfferExchangeHandCard iid identifier destination recipient $ toCardId card
        targets assets $ \asset -> push $ storyCommand a $ OfferExchangeStoryAsset iid identifier destination recipient asset
      pure s
    _ | Just (OfferExchangeToken iid identifier destination recipient token amount) <- commandFor a msg,
        token `elem` [Resource, Clue], amount > 0 -> do
      let cargo = if token == Resource then emptyCargo {cargoResources = amount} else emptyCargo {cargoClues = amount}
      emitExchangeParcel a iid identifier destination recipient cargo
    _ | Just (OfferExchangeHandCard iid identifier destination recipient cid) <- commandFor a msg -> do
      hand <- field InvestigatorHand iid
      case find ((== cid) . toCardId) hand of
        Nothing -> pure s
        Just card -> do
          ownerGroup <- originalOwnerGroup card $ toCardOwner card
          let snapshot = EntitySnapshot HandCard cid (toCardCode card) (toCardOwner card) ownerGroup Nothing mempty [] (toJSON card)
          emitExchangeParcel a iid identifier destination recipient $ emptyCargo {cargoEntities = [snapshot]}
    _ | Just (OfferExchangeStoryAsset iid identifier destination recipient aid) <- commandFor a msg -> do
      permitted <- aid `matches` (AssetControlledBy (InvestigatorWithId iid) <> not_ AssetNonStory)
      if not permitted then pure s else do
        asset <- getNativeAsset aid
        ownerGroup <- originalOwnerGroup asset $ toCardOwner asset
        attachments <- getNativeAttachments $ toTarget asset
        let snapshot = (storyAssetSnapshot ownerGroup asset)
              {snapshotAttachments = setFromList $ map fst attachments, snapshotAttachedEntities = map snd attachments}
        emitExchangeParcel a iid identifier destination recipient $ emptyCargo {cargoEntities = [snapshot]}
    _ | Just (ParcelAcknowledged pid, updated) <- newDelivery a msg -> do
      for_ (Map.lookup pid $ pendingExchangeParcels $ memory updated) \(iid, identifier) ->
        push $ storyCommand updated $ OpenRiftExchange iid identifier
      pure $ TheRift $ remember ((memory updated) {pendingExchangeParcels = Map.delete pid $ pendingExchangeParcels $ memory updated}) updated
    _ -> TheRift <$> liftRunMessage msg a

emitExchangeParcel
  :: ReverseQueue m
  => StoryAttrs -> InvestigatorId -> ExchangeId -> LabyrinthGroup -> InvestigatorId -> Cargo -> m TheRift
emitExchangeParcel attrs iid identifier destination recipient cargo = do
  origin <- getEpicGroup
  pid <- ParcelId <$> getId
  emitOperation $ SendParcel $ Parcel pid origin destination (Just iid) (Just recipient) (ThroughRift identifier) cargo
  pure $ TheRift $ remember ((memory attrs)
    {pendingExchangeParcels = Map.insert pid (iid, identifier) $ pendingExchangeParcels $ memory attrs}) attrs
