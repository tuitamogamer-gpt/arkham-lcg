module Arkham.Homebrew.Barkham.Player.FoulOdor (foulOdor) where

import Arkham.Ability
import Arkham.Treachery.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Investigator.Types (Field (InvestigatorLocation, InvestigatorMeta))
import Arkham.Matcher
import Arkham.Placement
import Arkham.Projection
import Data.Aeson.Types (parseMaybe)

newtype FoulOdor = FoulOdor TreacheryAttrs
  deriving anyclass (IsTreachery, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

foulOdor :: TreacheryCard FoulOdor
foulOdor = treachery FoulOdor Cards.foulOdor

instance HasAbilities FoulOdor where
  getAbilities (FoulOdor a) = [restricted a 1 OnSameLocation actionAbility]

instance RunMessage FoulOdor where
  runMessage msg t@(FoulOdor a) = runQueueT $ case msg of
    Revelation iid (isSource a -> True) -> placeInThreatArea a iid >> pure t
    SkillTestEnds _ iid _ | a.placement == InThreatArea iid -> do
      here <- field InvestigatorLocation iid
      meta <- field InvestigatorMeta iid
      let sniffed = fromMaybe [] $ parseMaybe (withObject "Kate" $ \o -> o .:? "sniffedLocations" .!= []) meta
      when (maybe False (`elem` (sniffed :: [LocationId])) here) $ assignHorror iid a 1
      pure t
    UseThisAbility iid (isSource a -> True) 1 -> do
      toDiscardBy iid (a.ability 1) a
      case a.placement of
        InThreatArea bearer ->
          push $ HandleTargetChoice bearer (InvestigatorSource bearer) (CardCodeTarget ":barkham:unsniff")
        _ -> pure ()
      pure t
    _ -> FoulOdor <$> liftRunMessage msg a
