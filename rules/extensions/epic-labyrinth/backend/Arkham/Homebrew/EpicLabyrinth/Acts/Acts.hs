module Arkham.Homebrew.EpicLabyrinth.Acts.Acts where

import Arkham.Ability
import Arkham.Act.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Act.Cards.TheLabyrinthsOfLunacy.ThePetGroupC qualified as Native
import Arkham.Act.Import.Lifted
import Arkham.Act.Sequence qualified as Sequence
import Arkham.Card
import Arkham.Classes.HasGame (HasGame)
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyHealth, EnemyDamage))
import Arkham.Helpers.Scenario
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Name (Labeled (..))
import Arkham.Placement (Placement (AtLocation))
import Arkham.Projection
import Arkham.Question (UI (Label))
import Arkham.Scenario.Types (Field (ScenarioRemembered))
import Arkham.ScenarioLogKey

newtype LabyrinthAct = LabyrinthAct ActAttrs
  deriving anyclass (IsAct, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theLevers :: ActCard LabyrinthAct
theLevers = act (1, A) LabyrinthAct Cards.theLeversGroupCEpicMultiplayer Nothing
thePet :: ActCard LabyrinthAct
thePet = act (2, A) LabyrinthAct Cards.thePetGroupC Nothing
theEscape :: ActCard LabyrinthAct
theEscape = act (3, A) LabyrinthAct Cards.theEscapeEpicMultiplayer Nothing

instance HasAbilities LabyrinthAct where
  getAbilities (LabyrinthAct attrs)
    | toCardCode attrs == "70014" && onSide A attrs =
        [restricted attrs 1 (exists $ enemyIs Enemies.eixodolon <> EnemyWithRemainingHealth (EqualTo $ Static 0))
          $ Objective $ ReactionAbility (RoundEnds #when) Free mempty]
    | otherwise = []

instance RunMessage LabyrinthAct where
  runMessage msg entity@(LabyrinthAct attrs) = runQueueT $ case msg of
    AdvanceAct (isSide B attrs -> True) _ _ | toCardCode attrs == "70009" -> do
      pulled <- leverChoice
      case pulled of
        Nothing -> do
          nearest <- select $ NearestToLocation $ locationIs Locations.chamberOfRegret
          lead <- getLead
          chooseOrRunOneM lead $ targets nearest $ push . InvestigatorKilled (toSource attrs)
          proceed attrs "act2Setup"
        Just _ -> do
          emitOperation InspectSecret
          lead <- getLead
          chooseOne lead [Label "Waiting to inspect Group A's Chamber of Secrets" [ScenarioSpecific "epicLabyrinth.wait" Null]]
      pure entity
    ScenarioSpecific "epicLabyrinth.delivery" value
      | Just envelope <- maybeResult @DeliveryEnvelope value
      , SecretRevealed code <- envelope.envelopeBody
      , toCardCode attrs == "70009"
      , not (deliveryWasApplied envelope.envelopeId attrs.meta) -> do
          pulled <- leverChoice
          for_ pulled $ \(key, iid) -> do
            lead <- getLead
            let messages = [InvestigatorKilled (toSource attrs) iid | not $ matchingChamber key code]
                  <> [ScenarioSpecific "act2Setup" Null, AdvanceActDeck (actDeckId attrs) (toSource attrs)]
            chooseOne lead [Label ("Group A's Chamber of Secrets: " <> tshow code) messages]
          pure $ LabyrinthAct attrs {actMeta = markDeliveryApplied envelope.envelopeId attrs.meta}
    AdvanceAct (isSide B attrs -> True) _ _ | toCardCode attrs == "70013" -> do
      epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
      if not epic then LabyrinthAct . toAttrs <$> liftRunMessage msg
        (overAttrs (const attrs) $ cbCardBuilder Native.thePetGroupC (toCardId attrs) (actDeckId attrs, attrs.id))
      else do
        sent <- getScenarioMetaKeyDefault "epicLabyrinthPetSent" False
        victory <- inVictoryDisplay $ cardIs Enemies.eixodolonsPetEpicMultiplayer
        if sent
          then emitOperation . SendPet =<< sample (GroupA :| [GroupB])
          else unless victory do
            pet <- selectOne $ enemyIs Enemies.eixodolonsPetEpicMultiplayer
            for_ pet $ \eid -> do
              hunger <- selectJust $ locationIs Locations.chamberOfHunger
              push $ PlaceEnemy eid $ AtLocation hunger
              investigators <- select $ InvestigatorAt $ locationIs Locations.chamberOfHunger
              for_ investigators $ initiateEnemyAttack eid attrs
        proceed attrs "act3Setup"
        pure entity
    UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "70014" -> do
      boss <- selectJust $ enemyIs Enemies.eixodolon
      health <- fromMaybe 0 <$> field EnemyHealth boss
      damage <- field EnemyDamage boss
      emitOperation $ SetBoss health damage
      destinations <- otherGroups
      let extra = max 0 $ damage - health
      chooseOneM iid do
        i18nKeyLabeled "Advance without moving excess damage" $ advanceVia #other attrs (attrs.ability 1)
        for_ destinations $ \destination -> for_ [1 .. extra] $ \n ->
          i18nKeyLabeled ("Move " <> tshow n <> " excess damage to " <> tshow destination) do
            emitOperation $ MoveExcessBossDamage destination n
            advanceVia #other attrs (attrs.ability 1)
      pure entity
    AdvanceAct (isSide B attrs -> True) _ _ | toCardCode attrs == "70014" -> do
      emitOperation CheckEscape
      -- Each group stays on its own objective until all surviving copies have
      -- no health remaining. Resolution arrives from the locked coordinator.
      pure $ LabyrinthAct attrs {actSequence = Sequence.Sequence 3 A, actFlipped = False}
    _ -> LabyrinthAct <$> liftRunMessage msg attrs

proceed :: ReverseQueue m => ActAttrs -> Text -> m ()
proceed attrs setup = scenarioSpecific_ setup >> advanceActDeck attrs

leverChoice :: HasGame m => m (Maybe (ScenarioLogKey, InvestigatorId))
leverChoice = do
  keys <- scenarioField ScenarioRemembered
  pure $ listToMaybe [(key, iid) | key <- toList keys, Just iid <- [puller key]]
 where
  puller = \case
    PulledTheLeftLever (Labeled _ iid) -> Just iid
    PulledTheMiddleLever (Labeled _ iid) -> Just iid
    PulledTheRightLever (Labeled _ iid) -> Just iid
    _ -> Nothing

matchingChamber :: ScenarioLogKey -> CardCode -> Bool
matchingChamber key code = case key of
  PulledTheRightLever _ -> code == "70016"
  PulledTheMiddleLever _ -> code == "70017"
  PulledTheLeftLever _ -> code == "70018"
  _ -> False
