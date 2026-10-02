module Arkham.Homebrew.Barkham.Acts.NineLives (nineLives) where

import Arkham.Ability
import Arkham.Act.Import.Lifted
import Arkham.Card (setFacedown)
import Arkham.Enemy.Types (Field (..))
import Arkham.Homebrew.Barkham.CardDefs.Acts qualified as Cards
import Arkham.Homebrew.Barkham.CardDefs.Agendas qualified as Agendas
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Homebrew.Barkham.Traits
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Message.Lifted.Choose
import Arkham.Projection
import Arkham.Trait (Trait (Central))

newtype NineLives = NineLives ActAttrs
  deriving anyclass (IsAct, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

nineLives :: ActCard NineLives
nineLives = act (1, A) NineLives Cards.nineLives Nothing

instance HasAbilities NineLives where
  getAbilities = actAbilities \a ->
    [ restricted a 1 (notExists lousyWithCats)
        $ Objective $ forced (PhaseBegins #when #investigation)
    ]

instance RunMessage NineLives where
  runMessage msg a@(NineLives attrs) = runQueueT $ case msg of
    UseThisAbility _ (isSource attrs -> True) 1 -> a <$ advancedWithOther attrs
    AdvanceAct (isSide B attrs -> True) _ _ -> do
      lead <- getLead
      centers <- select (LocationWithTrait Central)
      chooseOrRunOneM lead $ targets centers \lid -> do
        eid <- createEnemyAt Enemies.meowlathotep lid
        -- Transfer the real cards, then remove their in-play entities. Facedown
        -- attachments cannot hunt, engage or participate in doom checks.
        cats <- select (EnemyWithTrait Meowsk)
        cards <- traverse (setFacedown True) =<< traverse (field EnemyCard) cats
        for_ cats \cat -> push $ RemoveEnemy cat
        placeUnderneath eid cards
      advanceActDeck attrs
      Lifted.advanceToAgendaA attrs Agendas.meowlathotepsScheme
      pure a
    _ -> NineLives <$> liftRunMessage msg attrs
