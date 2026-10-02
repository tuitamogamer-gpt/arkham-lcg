module Arkham.Homebrew.EpicLabyrinth.Stories.TheVent (theVent) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Card
import {-# SOURCE #-} Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets (getNativeAsset, getNativeCard)
import Arkham.Helpers.Query
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id (getId, HasPlayer (getPlayer))
import Arkham.Investigator.Types (Field (InvestigatorClues, InvestigatorResources))
import Arkham.Matcher hiding (ItemAsset)
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Arkham.Question (Question (PickScenarioSpecific))
import Arkham.Placement
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token
import Arkham.Trait (Trait (Item))
import Data.Map.Strict qualified as Map

newtype TheVent = TheVent StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theVent :: StoryCard TheVent
theVent = story TheVent Cards.theVent & persistStory

instance HasAbilities TheVent where
  getAbilities (TheVent a) =
    if null $ pendingVentParcels $ memory a
      then [ restricted a 1 OnSameLocation $ FastAbility Free
           , restricted a 2 OnSameLocation actionAbility
           , mkAbility a 3 $ ReactionAbility (RoundEnds #when) Free mempty
           ]
      else []

instance RunMessage TheVent where
  runMessage msg s@(TheVent a) = runQueueT $ case msg of
    _ | Just iid <- readInvestigator a msg -> attachToDistortion iid a False >> pure s
    _ | Just (PlaceStoryAt placement) <- commandFor a msg -> do
      group <- getEpicGroup
      firstAct <- selectAny $ ActWithStep 1
      when (firstAct && group /= GroupA) $ for_ (case placement of AtLocation lid -> Just lid; _ -> Nothing) \lid ->
        withSetAsideCard Assets.keyOfMysteries $ \key -> void $ createAssetAt key $ AtLocation lid
      pure $ TheVent a {storyPlacement = placement}
    UseThisAbility iid (isSource a -> True) 1 -> push (storyCommand a $ DepositVent iid) >> pure s
    UseThisAbility iid (isSource a -> True) 2 -> push (storyCommand a $ ClaimVent iid) >> pure s
    UseThisAbility iid (isSource a -> True) 3 -> do
      destinations <- otherGroups
      chooseOneM iid $ for_ destinations \group ->
        i18nKeyLabeled ("Send the Vent's contents to " <> tshow group) $ push $ storyCommand a $ SendVent iid group
      pure s
    _ | Just (DepositVent iid) <- commandFor a msg -> do
      resources <- field InvestigatorResources iid
      clues <- field InvestigatorClues iid
      items <- select $ AssetControlledBy (InvestigatorWithId iid) <> AssetWithTrait Item
      chooseOneM iid do
        i18nKeyLabeled "Finish placing objects in the Vent" nothing
        for_ [(Resource, resources), (Clue, clues)] \(token, maximum) -> for_ [1 .. maximum] \amount ->
          i18nKeyLabeled ("Place " <> tshow amount <> " " <> tshow token <> " token(s)")
            $ push $ storyCommand a $ DepositVentToken iid token amount
        targets items $ \aid -> push $ storyCommand a $ DepositVentItem iid aid
        i18nKeyLabeled "Write a private note for another group" do
          player <- getPlayer iid
          push $ Ask player $ PickScenarioSpecific "epicLabyrinth.note" $ object
            ["story" .= a.id, "investigator" .= iid]
      pure s
    _ | Just (DepositVentToken iid token amount) <- commandFor a msg, token `elem` [Resource, Clue] -> do
      available <- field (if token == Resource then InvestigatorResources else InvestigatorClues) iid
      when (amount > 0 && amount <= available) do
        removeTokens a iid token amount
        placeTokens a a token amount
      push $ storyCommand a $ DepositVent iid
      pure s
    _ | Just (DepositVentItem iid aid) <- commandFor a msg -> do
      permitted <- aid `matches` (AssetControlledBy (InvestigatorWithId iid) <> AssetWithTrait Item)
      if not permitted then pure s else do
        asset <- getNativeAsset aid
        known <- getNativeCard $ toCardId asset
        ownerGroup <- originalOwnerGroup asset $ toCardOwner asset
        let original = fromMaybe (toCard asset) known
            snapshot = (storyAssetSnapshot ownerGroup asset) {snapshotKind = ItemAsset, snapshotNative = toJSON original}
            updated = (memory a) {ventItems = ventItems (memory a) <> [snapshot]}
        placeUnderneath a [original]
        push $ storyCommand a $ DepositVent iid
        pure $ TheVent $ remember updated a
    _ | Just (WriteVentNote iid note) <- commandFor a msg -> do
      push $ storyCommand a $ DepositVent iid
      pure $ TheVent $ remember ((memory a) {ventNotes = ventNotes (memory a) <> [note]}) a
    _ | Just (ClaimVent iid) <- commandFor a msg -> do
      chooseOneM iid do
        i18nKeyLabeled "Finish taking objects from the Vent" nothing
        for_ [Resource, Clue] \token -> for_ [1 .. a.token token] \amount ->
          i18nKeyLabeled ("Take " <> tshow amount <> " " <> tshow token <> " token(s)")
            $ push $ storyCommand a $ ClaimVentToken iid token amount
        targets a.storyCardsUnderneath $ \card -> push $ storyCommand a $ ClaimVentItem iid $ toCardId card
        for_ (zip [0 ..] $ ventNotes $ memory a) \(index, _) ->
          i18nKeyLabeled ("Take and read note " <> tshow (index + 1)) $ push $ storyCommand a $ ClaimVentNote iid index
      pure s
    _ | Just (ClaimVentToken iid token amount) <- commandFor a msg, token `elem` [Resource, Clue] -> do
      when (amount > 0 && amount <= a.token token) $ moveTokens a a iid token amount
      push $ storyCommand a $ ClaimVent iid
      pure s
    _ | Just (ClaimVentItem iid cid) <- commandFor a msg -> do
      case find ((== cid) . toCardId) a.storyCardsUnderneath of
        Nothing -> pure s
        Just card -> do
          void $ createAssetAt card $ InPlayArea iid
          push $ storyCommand a $ ClaimVent iid
          let updated = (memory a) {ventItems = filter ((/= cid) . snapshotCardId) $ ventItems $ memory a}
          pure $ TheVent $ remember updated a {storyCardsUnderneath = filter ((/= cid) . toCardId) a.storyCardsUnderneath}
    _ | Just (ClaimVentNote iid index) <- commandFor a msg -> do
      let notes = ventNotes $ memory a
      case drop index notes of
        note : _ | index >= 0 -> do
          chooseOneM iid $ i18nKeyLabeled note nothing
          push $ storyCommand a $ ClaimVent iid
          pure $ TheVent $ remember ((memory a) {ventNotes = take index notes <> drop (index + 1) notes}) a
        _ -> pure s
    _ | Just (SendVent iid destination) <- commandFor a msg, null (pendingVentParcels $ memory a) -> do
      origin <- getEpicGroup
      pid <- ParcelId <$> getId
      let cargo = Cargo (a.token Resource) (a.token Clue) (ventItems $ memory a) (ventNotes $ memory a)
          parcel = Parcel pid origin destination (Just iid) Nothing ThroughVent cargo
      emitOperation $ SendParcel parcel
      pure $ TheVent $ remember ((memory a) {pendingVentParcels = Map.singleton pid cargo}) a
    _ | Just (CommitParcel parcel, updated) <- newDelivery a msg, parcelPermission parcel == ThroughVent -> do
      -- The pure atomic adapter already debited this native story before it
      -- dispatched the delivery. This card records the receipt only.
      pure $ TheVent updated
    _ | Just (ReceiveParcel parcel, updated) <- newDelivery a msg, parcelPermission parcel == ThroughVent -> do
      pure $ TheVent updated
    _ | Just (ParcelAcknowledged pid, updated) <- newDelivery a msg ->
      pure $ TheVent $ remember ((memory updated) {pendingVentParcels = Map.delete pid $ pendingVentParcels $ memory updated}) updated
    _ -> TheVent <$> liftRunMessage msg a
