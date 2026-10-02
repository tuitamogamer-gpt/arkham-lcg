module Arkham.Homebrew.Barkham.Player.DogMonocle (dogMonocle) where

import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Modifiers
import Arkham.Helpers.SkillTest (getSkillTest, isParley)

newtype DogMonocle = DogMonocle AssetAttrs
  deriving anyclass (IsAsset, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

dogMonocle :: AssetCard DogMonocle
dogMonocle = assetWith DogMonocle Cards.dogMonocle $ (healthL ?~ 1) . (sanityL ?~ 2)

instance HasModifiersFor DogMonocle where
  getModifiersFor (DogMonocle a) = getSkillTest >>= traverse_ \st -> do
    when (controlledBy a st.investigator) do
      parley <- isParley
      modified_ a st.investigator $ [SkillModifier #intellect 1 | st.action == Just #investigate] <> [AnySkillValue 1 | parley]

instance RunMessage DogMonocle where
  runMessage msg (DogMonocle a) = DogMonocle <$> runMessage msg a
