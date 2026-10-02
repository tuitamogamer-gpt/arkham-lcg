module Arkham.Homebrew.EpicMachinations.Acts.WalkingThroughTime (walkingThroughTime) where

import Arkham.Ability
import Arkham.Act.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Act.Cards.MachinationsThroughTime.WalkingThroughTime qualified as Native
import Arkham.Act.Import.Lifted
import Arkham.Card
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Matcher

newtype EpicWalking = EpicWalking ActAttrs
  deriving anyclass (IsAct, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

walkingThroughTime :: ActCard EpicWalking
walkingThroughTime = act (1, A) EpicWalking Cards.walkingThroughTime Nothing

nativeAct attrs = overAttrs (const attrs) $ cbCardBuilder Native.walkingThroughTime (toCardId attrs) (actDeckId attrs, attrs.id)

instance HasAbilities EpicWalking where
  getAbilities (EpicWalking attrs)
    | toResultDefault False attrs.meta =
        filter ((== 1) . abilityIndex) (getAbilities $ nativeAct attrs)
          <> [onlyOnce $ restricted attrs 2 localObjective $ Objective $ forced AnyWindow]
    | otherwise = getAbilities $ nativeAct attrs
   where
    away = not_ $ locationIs Locations.tindalosEpic
    localObjective = exists (AssetWithTitle "Thomas Corrigan" <> AssetAt away)
      <> exists (AssetWithTitle "Mary Zielinski" <> AssetAt away)
      <> notExists (StoryMatchAll [])

instance RunMessage EpicWalking where
  runMessage message entity@(EpicWalking attrs) = runQueueT $ case message of
    ScenarioSpecific "epicMachinations.activate" _ -> pure $ EpicWalking attrs {actMeta = toJSON True}
    ScenarioSpecific "epicMachinations.replica" _ -> pure $ EpicWalking attrs {actMeta = toJSON True}
    UseThisAbility _ (isSource attrs -> True) 2 | toResultDefault False attrs.meta -> do
      scenarioSpecific_ "epicMachinations.progress"
      emitMachinations CheckTimeline
      pure entity
    AdvanceAct (isSide B attrs -> True) _ _ | toResultDefault False attrs.meta -> do
      scenarioSpecific_ "epicMachinations.progress"
      emitMachinations CheckTimeline
      pure entity
    _ -> EpicWalking . toAttrs <$> liftRunMessage message (nativeAct attrs)
