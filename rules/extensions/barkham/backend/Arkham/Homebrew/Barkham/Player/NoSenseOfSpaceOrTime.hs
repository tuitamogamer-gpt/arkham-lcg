module Arkham.Homebrew.Barkham.Player.NoSenseOfSpaceOrTime (noSenseOfSpaceOrTime) where

import Arkham.Card
import Arkham.Treachery.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Investigator.Types (Field (InvestigatorCardsUnderneath))
import Arkham.Message.Lifted.Choose
import Arkham.Projection

newtype NoSenseOfSpaceOrTime = NoSenseOfSpaceOrTime TreacheryAttrs
  deriving anyclass (IsTreachery, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

noSenseOfSpaceOrTime :: TreacheryCard NoSenseOfSpaceOrTime
noSenseOfSpaceOrTime = treachery NoSenseOfSpaceOrTime Cards.noSenseOfSpaceOrTime

instance RunMessage NoSenseOfSpaceOrTime where
  runMessage msg t@(NoSenseOfSpaceOrTime a) = runQueueT $ case msg of
    Revelation iid (isSource a -> True) -> do
      buried <- field InvestigatorCardsUnderneath iid
      for_ buried \card -> focusCards [card] do
        chooseOneM iid do
          i18nKeyLabeled "Keep this buried card and take 1 horror" $ assignHorror iid a 1
          for_ (preview _PlayerCard card) \playerCard ->
            i18nKeyLabeled "Discard this buried card" $ addToDiscard iid [playerCard]
        unfocusCards
      pure t
    _ -> NoSenseOfSpaceOrTime <$> liftRunMessage msg a
