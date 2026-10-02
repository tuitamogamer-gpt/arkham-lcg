module Arkham.Homebrew.EpicLabyrinth.Agendas.Agendas where

import Arkham.Ability
import Arkham.Agenda.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Agenda.Cards.TheLabyrinthsOfLunacy.TheMastermind qualified as Native
import Arkham.Agenda.Import.Lifted
import Arkham.Card
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyHealth, EnemyDamage))
import Arkham.Helpers.Query
import Arkham.Helpers.Doom (getDoomCount)
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Coordinator (availableStories)
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Data.Map.Strict qualified as Map

newtype LabyrinthAgenda = LabyrinthAgenda AgendaAttrs
  deriving anyclass (IsAgenda, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

awakening :: AgendaCard LabyrinthAgenda
awakening = agenda (1, A) LabyrinthAgenda Cards.awakeningEpicMultiplayer (Static 6)
agonyAndDespair :: AgendaCard LabyrinthAgenda
agonyAndDespair = agenda (2, A) LabyrinthAgenda Cards.agonyAndDespairEpicMultiplayer (Static 7)
theMastermind :: AgendaCard LabyrinthAgenda
theMastermind = agenda (3, A) LabyrinthAgenda Cards.theMastermind (Static 7)

nativeMastermind attrs = overAttrs (const attrs) $ cbCardBuilder Native.theMastermind (toCardId attrs) (agendaDeckId attrs, attrs.id)

instance HasAbilities LabyrinthAgenda where
  getAbilities (LabyrinthAgenda attrs)
    | toCardCode attrs == "70006" = getAbilities $ nativeMastermind attrs
    | onSide A attrs && agendaDoom attrs >= 1 && not (toResultDefault False attrs.meta) =
        [mkAbility attrs 1 $ forced $ RoundEnds #when]
    | otherwise = []

instance RunMessage LabyrinthAgenda where
  runMessage msg agendaEntity@(LabyrinthAgenda attrs) = runQueueT $ case msg of
    UseThisAbility _ (isSource attrs -> True) 1 | toCardCode attrs /= "70006" -> do
      replica <- getEpicReplica
      let stage = if toCardCode attrs == "70002" then 1 else 2
      when (replica.replicaGroup == GroupA && Map.notMember stage replica.replicaStoryChoices) do
        code <- sample $ fromJustNote "the next Labyrinth stage has set-aside story cards" $ nonEmpty $
          filter (`notElem` Map.elems replica.replicaStoryChoices) $ availableStories stage
        emitOperation $ SelectStory stage code
      pure $ LabyrinthAgenda attrs {agendaMeta = toJSON True}
    ScenarioSpecific "epicLabyrinth.delivery" value
      | Just envelope <- maybeResult @DeliveryEnvelope value
      , DrawSharedStory _ <- envelope.envelopeBody
      , toCardCode attrs /= "70006" -> pure $ LabyrinthAgenda attrs {agendaMeta = toJSON True}
    ForTarget (isTarget attrs -> True) AdvanceAgendaIfThresholdSatisfied | toCardCode attrs == "70004" -> do
      doom <- getDoomCount
      when (doom >= 11) $ scenarioSpecific_ "doomThresholdMet"
      LabyrinthAgenda <$> liftRunMessage msg attrs
    AdvanceAgenda (isSide B attrs -> True) | toCardCode attrs `elem` ["70002", "70004"] -> do
      lead <- getLead
      actId <- selectJust AnyAct
      push $ AdvanceAct actId (toSource lead) #other
      advanceAgendaDeck attrs
      pure agendaEntity
    AdvanceAgenda (isSide B attrs -> True) | toCardCode attrs == "70006" -> do
      epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
      when epic do
        boss <- selectOne $ enemyIs Enemies.eixodolon
        for_ boss $ \eid -> do
          health <- fromMaybe 0 <$> field EnemyHealth eid
          damage <- field EnemyDamage eid
          emitOperation $ SetBoss health damage
          lead <- getLead
          destinations <- otherGroups
          chooseOneM lead $ for_ destinations $ \destination ->
            i18nKeyLabeled ("Move Eixodolon's damage to " <> tshow destination) do
              emitOperation $ MoveAllBossDamage destination
              selectEach UneliminatedInvestigator $ push . InvestigatorKilled (toSource attrs)
              push R1
      unless epic $ push R1
      pure agendaEntity
    _ | toCardCode attrs == "70006" -> LabyrinthAgenda . toAttrs <$> liftRunMessage msg (nativeMastermind attrs)
    _ -> LabyrinthAgenda <$> liftRunMessage msg attrs
