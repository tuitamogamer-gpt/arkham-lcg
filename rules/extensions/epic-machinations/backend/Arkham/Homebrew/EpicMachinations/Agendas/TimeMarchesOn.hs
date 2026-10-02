module Arkham.Homebrew.EpicMachinations.Agendas.TimeMarchesOn (timeMarchesOn) where

import Arkham.Agenda.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Agenda.Cards.MachinationsThroughTime.TimeMarchesOn qualified as Native
import Arkham.Agenda.Import.Lifted
import Arkham.Agenda.Sequence qualified as Sequence
import Arkham.Card
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)

newtype EpicTimeMarchesOn = EpicTimeMarchesOn AgendaAttrs
  deriving anyclass (IsAgenda, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

timeMarchesOn :: AgendaCard EpicTimeMarchesOn
timeMarchesOn = agenda (2, A) EpicTimeMarchesOn Cards.timeMarchesOn (Static 9)

nativeAgenda attrs = overAttrs (const attrs) $ cbCardBuilder Native.timeMarchesOn (toCardId attrs) (agendaDeckId attrs, attrs.id)

instance HasAbilities EpicTimeMarchesOn where
  getAbilities (EpicTimeMarchesOn attrs) = getAbilities $ nativeAgenda attrs

instance RunMessage EpicTimeMarchesOn where
  runMessage message entity@(EpicTimeMarchesOn attrs) = runQueueT $ case message of
    ScenarioSpecific "epicMachinations.forceAgendaFailure" _ -> do
      epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
      if epic then do
        scenarioSpecific_ "epicMachinations.failure"
        pure $ EpicTimeMarchesOn attrs
          {agendaSequence = Sequence.Sequence 2 B, agendaFlipped = True}
      else pure entity
    AdvanceAgenda (isSide B attrs -> True) -> do
      epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
      if epic then entity <$ scenarioSpecific_ "epicMachinations.failure"
        else EpicTimeMarchesOn . toAttrs <$> liftRunMessage message (nativeAgenda attrs)
    _ -> EpicTimeMarchesOn . toAttrs <$> liftRunMessage message (nativeAgenda attrs)
