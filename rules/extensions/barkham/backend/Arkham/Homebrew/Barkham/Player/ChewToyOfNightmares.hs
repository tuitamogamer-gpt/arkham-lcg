module Arkham.Homebrew.Barkham.Player.ChewToyOfNightmares (chewToyOfNightmares) where

import Arkham.Asset.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Modifiers
import Arkham.Investigator.Types (Field (InvestigatorCardsUnderneath))
import Arkham.Projection

newtype ChewToyOfNightmares = ChewToyOfNightmares AssetAttrs
  deriving anyclass (IsAsset, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

chewToyOfNightmares :: AssetCard ChewToyOfNightmares
chewToyOfNightmares = asset ChewToyOfNightmares Cards.chewToyOfNightmares

instance HasModifiersFor ChewToyOfNightmares where
  getModifiersFor (ChewToyOfNightmares a) = for_ a.controller \iid -> do
    cards <- field InvestigatorCardsUnderneath iid
    modified_ a iid $ map CanCommitToSkillTestsAsIfInHand cards

instance RunMessage ChewToyOfNightmares where
  runMessage msg (ChewToyOfNightmares a) = ChewToyOfNightmares <$> runMessage msg a
