module Arkham.Homebrew.EpicMachinations.Stories.MobTroubles (mobTroubles) where

import Arkham.Card (cbCardBuilder)

import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Story.Cards.MachinationsThroughTime.MobTroubles qualified as Native
import Arkham.Story.Import.Lifted

newtype MobTroubles = MobTroubles StoryAttrs
  deriving anyclass IsStory
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

mobTroubles :: StoryCard MobTroubles
mobTroubles = MobTroubles . toAttrs <$> Native.mobTroubles

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.mobTroubles attrs.cardId (Nothing, attrs.id)

instance HasAbilities MobTroubles where
  getAbilities (MobTroubles attrs) = getAbilities $ native attrs

instance HasModifiersFor MobTroubles where
  getModifiersFor (MobTroubles attrs) = getModifiersFor $ native attrs

instance RunMessage MobTroubles where
  runMessage message card@(MobTroubles attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    case message of
      UseThisAbility _ (isSource attrs -> True) 2 | epic -> emitMachinations (CompleteStory "87039") >> pure card
      _ -> MobTroubles . toAttrs <$> liftRunMessage message (native attrs)
