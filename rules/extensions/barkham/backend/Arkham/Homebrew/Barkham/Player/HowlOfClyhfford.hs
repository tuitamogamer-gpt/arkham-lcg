module Arkham.Homebrew.Barkham.Player.HowlOfClyhfford (howlOfClyhfford) where

import Arkham.Event.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Enemy.Types (Field (EnemyEvade))
import Arkham.Evade
import Arkham.Helpers.SkillTest (getSkillTestTarget)
import Arkham.Matcher hiding (EnemyEvaded)
import Arkham.Projection

newtype HowlOfClyhfford = HowlOfClyhfford EventAttrs
  deriving anyclass (IsEvent, HasModifiersFor, HasAbilities)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

howlOfClyhfford :: EventCard HowlOfClyhfford
howlOfClyhfford = event HowlOfClyhfford Cards.howlOfClyhfford

instance RunMessage HowlOfClyhfford where
  runMessage msg e@(HowlOfClyhfford a) = runQueueT $ case msg of
    PlayThisEvent iid (is a -> True) -> do
      enemies <- selectWithField EnemyEvade AnyEnemy
      let highest = maximumMay $ mapMaybe snd enemies
      let targets = [eid | (eid, Just value) <- enemies, Just value == highest]
      sid <- getRandom
      choice <- mkChooseEvadeMatch sid iid a (oneOf $ map EnemyWithId targets)
      push $ toMessage $ choice {chooseEvadeSkillType = #willpower, chooseEvadeOverride = True}
      pure e
    PassedThisSkillTest iid (isSource a -> True) -> do
      target <- getSkillTestTarget
      let additional = NonEliteEnemy <> case target of
            Just (EnemyTarget eid) -> not_ $ EnemyWithId eid
            _ -> AnyEnemy
      selectEach additional $ automaticallyEvadeEnemy iid
      pure e
    _ -> HowlOfClyhfford <$> liftRunMessage msg a
