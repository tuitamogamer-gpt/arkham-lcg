module Arkham.Homebrew.Barkham.Player.OutOfDoggieTreats (outOfDoggieTreats) where

import Arkham.Treachery.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Asset.Uses
import Arkham.Matcher

newtype OutOfDoggieTreats = OutOfDoggieTreats TreacheryAttrs
  deriving anyclass (IsTreachery, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

outOfDoggieTreats :: TreacheryCard OutOfDoggieTreats
outOfDoggieTreats = treachery OutOfDoggieTreats Cards.outOfDoggieTreats

instance RunMessage OutOfDoggieTreats where
  runMessage msg t@(OutOfDoggieTreats a) = runQueueT $ case msg of
    Revelation iid (isSource a -> True) -> do
      selectEach (assetIs Cards.friendlyHuman <> assetControlledBy iid) $ removeAllOfTokenOn a Supply
      pure t
    _ -> OutOfDoggieTreats <$> liftRunMessage msg a
