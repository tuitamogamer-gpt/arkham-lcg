module Arkham.Homebrew.EpicMachinations.Enemies.EdwinBennetEnviousRival (edwinBennetEnviousRival) where

import Arkham.Ability
import Arkham.Card
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Cards
import Arkham.Enemy.Import.Lifted
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Query (getLead)
import Arkham.Helpers.FetchCard (fetchCard)
import Arkham.Helpers.Modifiers (ModifierType (..), modifySelf, modifySelect)
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import {-# SOURCE #-} Arkham.Homebrew.EpicMachinations.NativeEntities (getDirectAttachmentTargets)
import Arkham.Placement
import Arkham.Trait (Trait (Scientist))

newtype EdwinBennetEnviousRival = EdwinBennetEnviousRival EnemyAttrs
  deriving anyclass IsEnemy
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

edwinBennetEnviousRival :: EnemyCard EdwinBennetEnviousRival
edwinBennetEnviousRival = enemy EdwinBennetEnviousRival Cards.edwinBennetEnviousRival

instance HasModifiersFor EdwinBennetEnviousRival where
  getModifiersFor (EdwinBennetEnviousRival attrs) = do
    immune <- modifySelf attrs [CannotBeDamaged]
    clues <- modifySelect attrs (InvestigatorAt $ locationWithEnemy attrs.id)
      [CannotDiscoverCluesAt $ locationWithEnemy attrs.id]
    pure $ immune <> clues

instance HasAbilities EdwinBennetEnviousRival where
  getAbilities (EdwinBennetEnviousRival attrs) = extend1 attrs $
    mkAbility attrs 1 $ forced $ PhaseEnds #when #mythos

instance RunMessage EdwinBennetEnviousRival where
  runMessage message card@(EdwinBennetEnviousRival attrs) = runQueueT $ case message of
    UseThisAbility _ (isSource attrs -> True) 1 -> do
      withLocationOf attrs $ \lid -> selectEach (AssetWithTrait Scientist <> AssetAt (LocationWithId lid)) $
        \scientist -> dealAssetDamage scientist (attrs.ability 1) 1
      lead <- getLead
      investigators <- select UneliminatedInvestigator
      chooseTargetM lead investigators $ \iid -> drawEncounterCard iid $ attrs.ability 1
      pure card
    Flip _ _ (isTarget attrs -> True) -> do
      original <- fetchCard attrs.id
      -- This physical card changes from an encounter enemy to a player story
      -- asset. Re-resolve its printed other face so the native Flipped handler
      -- sees the asset type while retaining the original physical CardId.
      let flipped = lookupCard (toCardCode $ flipCard original) (toCardId original)
      withLocationOf attrs $ \lid -> do
        aid <- createAssetAt flipped $ AtLocation lid
        -- Tokens and attachments stay on this physical card when it flips.
        -- Retarget direct children before removing its former enemy entity;
        -- nested attachments retain their unchanged parent identities.
        children <- getDirectAttachmentTargets $ toTarget attrs
        for_ children $ \case
          AssetTarget child -> push $ PlaceAsset child $ AttachedToAsset aid Nothing
          EnemyTarget child -> push $ PlaceEnemy child $ AttachedToAsset aid Nothing
          EventTarget child -> push $ PlaceEvent child $ AttachedToAsset aid Nothing
          TreacheryTarget child -> push $ PlaceTreachery child $ AttachedToAsset aid Nothing
          _ -> pure ()
        push $ SendMessage (AssetTarget aid) $ ScenarioSpecific "epicMachinations.redeemedEdwin" $
          toJSON (attrs.tokens, attrs.exhausted)
        push $ Flipped (toSource attrs) flipped
      pure card
    _ -> EdwinBennetEnviousRival <$> liftRunMessage message attrs
