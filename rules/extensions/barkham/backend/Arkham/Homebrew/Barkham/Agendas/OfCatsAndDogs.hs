module Arkham.Homebrew.Barkham.Agendas.OfCatsAndDogs (ofCatsAndDogs) where

import Arkham.Ability
import Arkham.Agenda.Import.Lifted
import Arkham.Helpers.Investigator (getJustLocation)
import Arkham.Helpers.Query (getLead)
import Arkham.Homebrew.Barkham.CardDefs.Agendas qualified as Cards
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype OfCatsAndDogs = OfCatsAndDogs AgendaAttrs
  deriving anyclass (IsAgenda, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

ofCatsAndDogs :: AgendaCard OfCatsAndDogs
ofCatsAndDogs = agenda (1, A) OfCatsAndDogs Cards.ofCatsAndDogs (Static 4)

instance HasAbilities OfCatsAndDogs where
  getAbilities (OfCatsAndDogs a) | onSide A a =
    [ restricted a 1 (exists $ You <> at_ lousyWithCats)
        $ FastAbility (GroupClueCost (PerPlayer 2) YourLocation)
    , restricted a 2 (exists $ You <> at_ lousyWithCats) actionAbility
    ]
  getAbilities _ = []

instance RunMessage OfCatsAndDogs where
  runMessage msg a@(OfCatsAndDogs attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      pacifyHiddenMeowsk iid =<< getJustLocation iid
      pure a
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      lid <- getJustLocation iid
      exposeMeowsk iid (attrs.ability 2) lid True
      pure a
    AdvanceAgenda (isSide B attrs -> True) -> do
      remaining <- select lousyWithCats
      if null remaining
        then advanceAgendaDeck attrs
        else do
          lead <- getLead
          farthest <- select $ FarthestLocationFromAll lousyWithCats
          chooseOrRunOneM lead $ targets farthest \lid -> exposeMeowsk lead attrs lid False
          -- ResetAgendaDeckToStage cannot reset an agenda that has never left
          -- the stack. Replacing its current front preserves agenda 2 beneath
          -- it and restores side A even on the very first four-doom cycle.
          advanceToAgendaA attrs Cards.ofCatsAndDogs
      pure a
    _ -> OfCatsAndDogs <$> liftRunMessage msg attrs
