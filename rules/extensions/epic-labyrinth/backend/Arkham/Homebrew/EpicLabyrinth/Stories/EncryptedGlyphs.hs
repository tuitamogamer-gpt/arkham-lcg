module Arkham.Homebrew.EpicLabyrinth.Stories.EncryptedGlyphs (encryptedGlyphs) where

import Arkham.Ability
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token
import Data.Map.Strict qualified as Map

newtype EncryptedGlyphs = EncryptedGlyphs StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

encryptedGlyphs :: StoryCard EncryptedGlyphs
encryptedGlyphs = story EncryptedGlyphs Cards.encryptedGlyphs & persistStory

instance HasAbilities EncryptedGlyphs where
  getAbilities (EncryptedGlyphs a) =
    [ restricted a 1 OnSameLocation actionAbility
    , restricted a 2 OnSameLocation actionAbility
    ]

instance RunMessage EncryptedGlyphs where
  runMessage msg s@(EncryptedGlyphs a) = runQueueT $ case msg of
    _ | Just iid <- readInvestigator a msg -> attachToDistortion iid a True >> pure s
    _ | Just (PlaceStoryAt placement) <- commandFor a msg -> pure $ EncryptedGlyphs a {storyPlacement = placement}
    UseThisAbility iid (isSource a -> True) 1 -> do
      sid <- getRandom
      beginSkillTest sid iid (a.ability 1) iid #intellect (Fixed 2)
      pure s
    UseThisAbility iid (isSource a -> True) 2 -> do
      sid <- getRandom
      beginSkillTest sid iid (a.ability 2) iid #willpower (Fixed 4)
      pure s
    PassedThisSkillTest _ (isAbilitySource a 1 -> True) -> emitOperation DecodeGlyphs >> pure s
    PassedThisSkillTest _ (isAbilitySource a 2 -> True) -> emitOperation OrderGlyphs >> pure s
    _ | Just (SetGlyphCounters damage horror, updated) <- newDelivery a msg ->
      pure $ EncryptedGlyphs updated {storyTokens = Map.insert Damage damage $ Map.insert Horror horror updated.tokens}
    _ | Just (RemoveSharedStory "70038", updated) <- newDelivery a msg -> removeStory updated >> pure (EncryptedGlyphs updated)
    _ -> EncryptedGlyphs <$> liftRunMessage msg a
