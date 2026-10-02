module Arkham.Homebrew.EpicLabyrinth.Locations.Locations where

import Arkham.Ability
import Arkham.Card (toCardCode)
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Location.Import.Lifted
import Arkham.Matcher
import Arkham.ScenarioLogKey

newtype LabyrinthLocation = LabyrinthLocation LocationAttrs
  deriving anyclass (IsLocation, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

chamberOfSorrows :: LocationCard LabyrinthLocation
chamberOfSorrows = location LabyrinthLocation Cards.chamberOfSorrowsEpicMultiplayer 2 (PerPlayer 1)
chamberOfNight :: LocationCard LabyrinthLocation
chamberOfNight = location LabyrinthLocation Cards.chamberOfNightEpicMultiplayer 3 (PerPlayer 2)

instance HasAbilities LabyrinthLocation where
  getAbilities (LabyrinthLocation attrs) = extendRevealed1 attrs $ restricted attrs 1 Here actionAbility

instance RunMessage LabyrinthLocation where
  runMessage message entity@(LabyrinthLocation attrs) = runQueueT $ case message of
    UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "70020" -> do
      sid <- getRandom
      beginSkillTest sid iid (attrs.ability 1) attrs #combat (Fixed 1)
      pure entity
    PassedThisSkillTest _ (isAbilitySource attrs 1 -> True) | toCardCode attrs == "70020" -> do
      push $ Remember $ HomebrewScenarioLogKey "epicLabyrinth.TriedYourBest"
      pure entity
    FailedThisSkillTest _ (isAbilitySource attrs 1 -> True) | toCardCode attrs == "70020" -> do
      push $ Remember $ HomebrewScenarioLogKey "epicLabyrinth.TriedYourBest"
      pure entity
    UseThisAbility _ (isSource attrs -> True) 1 -> pure entity
    _ -> LabyrinthLocation <$> liftRunMessage message attrs
