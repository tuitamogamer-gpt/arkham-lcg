module Arkham.Homebrew.EpicLabyrinth.Stories.Shared where

import Arkham.Asset.Types (Asset, AssetAttrs (..))
import Arkham.Card
import Arkham.Classes.HasGame
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicLabyrinth.Helpers (getEpicGroup)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Matcher hiding (StoryAsset)
import Arkham.Message.Lifted.Choose
import Arkham.Placement
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token
import Arkham.Trait (Trait (Distortion))
import Data.Map.Strict qualified as Map

data StoryMemory = StoryMemory
  { appliedStoryDeliveries :: Set DeliveryId
  , decodedOwnRunes :: Bool
  , ventItems :: [EntitySnapshot]
  , ventNotes :: [Text]
  , pendingVentParcels :: Map ParcelId Cargo
  , riftMinimumDoom :: Int
  , pendingExchangeParcels :: Map ParcelId (InvestigatorId, ExchangeId)
  }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

emptyMemory :: StoryMemory
emptyMemory = StoryMemory mempty False [] [] mempty 0 mempty

memory :: StoryAttrs -> StoryMemory
memory attrs = fromMaybe emptyMemory $ maybeResult attrs.meta

remember :: StoryMemory -> StoryAttrs -> StoryAttrs
remember value attrs = attrs {storyMeta = toJSON value}

data StoryCommand
  = PlaceStoryAt Placement
  | TradeClues InvestigatorId
  | TradeClueAmount InvestigatorId InvestigatorId InvestigatorId Int
  | MoveChamberClues InvestigatorId
  | MoveChamberClueAmount InvestigatorId LocationId LocationId Int
  | DepositVent InvestigatorId
  | DepositVentToken InvestigatorId Token Int
  | DepositVentItem InvestigatorId AssetId
  | WriteVentNote InvestigatorId Text
  | ClaimVent InvestigatorId
  | ClaimVentToken InvestigatorId Token Int
  | ClaimVentItem InvestigatorId CardId
  | ClaimVentNote InvestigatorId Int
  | SendVent InvestigatorId LabyrinthGroup
  | OpenRiftExchange InvestigatorId ExchangeId
  | OfferExchange InvestigatorId ExchangeId LabyrinthGroup InvestigatorId
  | OfferExchangeToken InvestigatorId ExchangeId LabyrinthGroup InvestigatorId Token Int
  | OfferExchangeHandCard InvestigatorId ExchangeId LabyrinthGroup InvestigatorId CardId
  | OfferExchangeStoryAsset InvestigatorId ExchangeId LabyrinthGroup InvestigatorId AssetId
  | FinishExchange InvestigatorId ExchangeId
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

storyCommand :: StoryAttrs -> StoryCommand -> Message
storyCommand attrs command = SendMessage (toTarget attrs) $ ScenarioSpecific "epicLabyrinth.story" (toJSON command)

commandFor :: StoryAttrs -> Message -> Maybe StoryCommand
commandFor attrs = \case
  SendMessage target (ScenarioSpecific "epicLabyrinth.story" value) | isTarget attrs target ->
    maybeResult value
  _ -> Nothing

newDelivery :: StoryAttrs -> Message -> Maybe (Delivery, StoryAttrs)
newDelivery attrs = \case
  ScenarioSpecific "epicLabyrinth.delivery" value -> do
    envelope <- maybeResult value
    guard $ envelopeId envelope `notElem` appliedStoryDeliveries (memory attrs)
    let updated = (memory attrs) {appliedStoryDeliveries = insertSet (envelopeId envelope) $ appliedStoryDeliveries (memory attrs)}
    pure (envelopeBody envelope, remember updated attrs)
  _ -> Nothing

storyLocation :: StoryAttrs -> Maybe LocationId
storyLocation attrs = case attrs.placement of
  AtLocation lid -> Just lid
  AttachedToLocation lid -> Just lid
  _ -> Nothing

attachToDistortion :: (HasGame m, ReverseQueue m) => InvestigatorId -> StoryAttrs -> Bool -> m ()
attachToDistortion iid attrs attach = do
  locations <- select $ LocationWithTrait Distortion
  chooseOneM iid $ targets locations \lid ->
    push $ storyCommand attrs $ PlaceStoryAt $ if attach then AttachedToLocation lid else AtLocation lid

readInvestigator :: StoryAttrs -> Message -> Maybe InvestigatorId
readInvestigator attrs = \case
  ResolveThisStory iid (is attrs -> True) -> Just iid
  Revelation iid (isSource attrs -> True) -> Just iid
  _ -> Nothing

originalOwnerGroup :: (HasGame m, IsCard card) => card -> Maybe InvestigatorId -> m (Maybe LabyrinthGroup)
originalOwnerGroup card owner = case owner of
  Nothing -> pure Nothing
  Just _ -> do
    owners <- getScenarioMetaKeyDefault "epicLabyrinthOwners" mempty
    group <- getEpicGroup
    pure $ Just $ Map.findWithDefault group (toCardId card) owners

storyAssetSnapshot :: Maybe LabyrinthGroup -> Asset -> EntitySnapshot
storyAssetSnapshot ownerGroup asset = EntitySnapshot
  { snapshotKind = StoryAsset
  , snapshotCardId = toCardId asset
  , snapshotCardCode = toCardCode asset
  , snapshotOwner = toCardOwner asset
  , snapshotOwnerGroup = ownerGroup
  , snapshotController = assetController $ toAttrs asset
  , snapshotAttachments = mempty
  , snapshotAttachedEntities = []
  , snapshotNative = toJSON asset
  }
