module Arkham.Homebrew.Barkham.Agendas.MeowlathotepsScheme (meowlathotepsScheme) where

import Arkham.Agenda.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Agendas qualified as Cards

newtype MeowlathotepsScheme = MeowlathotepsScheme AgendaAttrs
  deriving anyclass (IsAgenda, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

meowlathotepsScheme :: AgendaCard MeowlathotepsScheme
meowlathotepsScheme = agenda (2, A) MeowlathotepsScheme Cards.meowlathotepsScheme (Static 8)

instance RunMessage MeowlathotepsScheme where
  runMessage msg a@(MeowlathotepsScheme attrs) = runQueueT $ case msg of
    AdvanceAgenda (isSide B attrs -> True) -> a <$ push R2
    _ -> MeowlathotepsScheme <$> liftRunMessage msg attrs
