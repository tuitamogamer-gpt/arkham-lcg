module Arkham.Homebrew.Barkham.Player.TakeTheWheel (takeTheWheel) where

import Arkham.Event.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Modifier

newtype TakeTheWheel = TakeTheWheel EventAttrs
  deriving anyclass (IsEvent, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

takeTheWheel :: EventCard TakeTheWheel
takeTheWheel = event TakeTheWheel Cards.takeTheWheel

instance RunMessage TakeTheWheel where
  runMessage msg e@(TakeTheWheel a) = runQueueT $ case msg of
    PlayThisEvent iid (is a -> True) -> do
      turnModifier iid a iid (InvestigatorModifier "barkhamTakeTheWheel")
      pure e
    _ -> TakeTheWheel <$> liftRunMessage msg a
