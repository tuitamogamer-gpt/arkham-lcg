module Arkham.Homebrew.EpicLabyrinth.Treacheries.ParadoxEffect (paradoxEffect) where

import Arkham.Ability
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Message.Lifted.Placement (place)
import Arkham.Placement
import Arkham.Treachery.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Treachery.Import.Lifted
import Data.Map.Strict qualified as Map

newtype ParadoxEffect = ParadoxEffect TreacheryAttrs
  deriving anyclass (IsTreachery, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

paradoxEffect :: TreacheryCard ParadoxEffect
paradoxEffect = treachery ParadoxEffect Cards.paradoxEffectEpicMultiplayer

instance HasAbilities ParadoxEffect where
  getAbilities (ParadoxEffect attrs) =
    [ restricted attrs 1 InYourThreatArea $ forced $ RoundEnds #when
    | isJust attrs.placement.inThreatAreaOf
    ]

instance RunMessage ParadoxEffect where
  runMessage message card@(ParadoxEffect attrs) = runQueueT $ case message of
    Revelation iid (isSource attrs -> True) -> do
      sid <- getRandom
      revelationSkillTest sid iid attrs #willpower (Fixed 3)
      pure card
    FailedThisSkillTestBy iid (isSource attrs -> True) amount -> assignHorror iid attrs amount >> pure card
    PassedThisSkillTest iid (isSource attrs -> True) -> place attrs (InThreatArea iid) >> pure card
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      toDiscardBy iid attrs attrs
      replica <- getEpicReplica
      group <- getEpicGroup
      identifier <- ExchangeId <$> getId
      chooseOneM iid $ for_ (Map.toList $ Map.delete group $ replicaGroups replica) \(destination, state) ->
        for_ (toList $ groupInvestigators state) \recipient ->
          i18nKeyLabeled ("Talk and exchange privately with " <> tshow recipient <> " in " <> tshow destination) $
            emitOperation $ OpenParadox iid destination recipient identifier
      pure card
    _ -> ParadoxEffect <$> liftRunMessage message attrs
