module Arkham.Homebrew.Barkham.Player.HairOfTheDog (hairOfTheDog) where

import Arkham.Skill.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Effect.Window
import Arkham.Helpers.Modifiers (createWindowModifierEffect, ModifierType (AnySkillValue))

newtype HairOfTheDog = HairOfTheDog SkillAttrs
  deriving anyclass (IsSkill, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

hairOfTheDog :: SkillCard HairOfTheDog
hairOfTheDog = skill HairOfTheDog Cards.hairOfTheDog

instance RunMessage HairOfTheDog where
  runMessage msg s@(HairOfTheDog a) = runQueueT $ case msg of
    SkillTestEnds _ iid _ -> do
      afterSkillTestQuiet $ pushM $ createWindowModifierEffect
        (FirstEffectWindow [EffectRoundWindow, EffectNextSkillTestWindow iid]) a iid [AnySkillValue (-2)]
      pure s
    _ -> HairOfTheDog <$> liftRunMessage msg a
