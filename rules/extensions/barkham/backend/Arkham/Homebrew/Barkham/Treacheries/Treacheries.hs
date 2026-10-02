module Arkham.Homebrew.Barkham.Treacheries.Treacheries where

import Arkham.Ability
import Arkham.Attack (enemyAttack)
import Arkham.Card (toCardCode)
import Arkham.Enemy.Types qualified as EnemyField
import Arkham.Helpers.Modifiers
import Arkham.Helpers.Query (getInvestigators)
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Homebrew.Barkham.CardDefs.Treacheries qualified as Cards
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Investigator.Types (Field (InvestigatorResources))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Placement
import Arkham.Projection
import Arkham.Treachery.Import.Lifted
import Data.Aeson qualified as Aeson

newtype BarkhamTreachery = BarkhamTreachery TreacheryAttrs
  deriving anyclass IsTreachery
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

squirrel :: TreacheryCard BarkhamTreachery
squirrel = treachery BarkhamTreachery Cards.squirrel
huntedByByakats :: TreacheryCard BarkhamTreachery
huntedByByakats = treachery BarkhamTreachery Cards.huntedByByakats
onYourTail :: TreacheryCard BarkhamTreachery
onYourTail = treachery BarkhamTreachery Cards.onYourTail
catsInTheMist :: TreacheryCard BarkhamTreachery
catsInTheMist = treachery BarkhamTreachery Cards.catsInTheMist
scratchingPaws :: TreacheryCard BarkhamTreachery
scratchingPaws = treachery BarkhamTreachery Cards.scratchingPaws
meowsksOfMeowlathotep :: TreacheryCard BarkhamTreachery
meowsksOfMeowlathotep = treachery BarkhamTreachery Cards.meowsksOfMeowlathotep
stubbornCat :: TreacheryCard BarkhamTreachery
stubbornCat = treachery BarkhamTreachery Cards.stubbornCat
mischiefAndChaos :: TreacheryCard BarkhamTreachery
mischiefAndChaos = treachery BarkhamTreachery Cards.mischiefAndChaos
gazeOfTheCeilingCat :: TreacheryCard BarkhamTreachery
gazeOfTheCeilingCat = treachery BarkhamTreachery Cards.gazeOfTheCeilingCat

instance HasModifiersFor BarkhamTreachery where
  getModifiersFor (BarkhamTreachery a) = case toCardCode a of
    ":barkham:050" -> inThreatAreaGets a
      [AdditionalCostToPerformAction (IsAction action) (ResourceCost 1) | action <- [#move, #fight, #investigate]]
    ":barkham:055" -> case a.placement of
      AttachedToLocation lid -> modified_ a lid [CannotInvestigate]
      _ -> pure mempty
    _ -> pure mempty

instance HasAbilities BarkhamTreachery where
  getAbilities (BarkhamTreachery a) = case toCardCode a of
    ":barkham:050" -> [skillTestAbility $ restricted a 1 (InThreatAreaOf You) $ forced $ TurnEnds #when You]
    ":barkham:055" -> [skillTestAbility $ restricted a 1 OnSameLocation actionAbility]
    _ -> []

instance RunMessage BarkhamTreachery where
  runMessage msg t@(BarkhamTreachery attrs) = runQueueT $ case msg of
    Revelation iid (isSource attrs -> True) -> do
      sid <- getRandom
      case toCardCode attrs of
        ":barkham:049" -> revelationSkillTest sid iid attrs #agility (Fixed 4) >> pure t
        ":barkham:050" -> placeInThreatArea attrs iid >> pure t
        ":barkham:051" -> do
          enemies <- select $ NearestEnemyTo iid AnyEnemy
          if null enemies
            then gainSurge attrs >> pure t
            else do
              chooseOrRunOneM iid $ targets enemies \eid ->
                push $ HandleTargetChoice iid (toSource attrs) (toTarget eid)
              pure t
        ":barkham:052" -> revelationSkillTest sid iid attrs #willpower (Fixed 3) >> pure t
        ":barkham:053" -> revelationSkillTest sid iid attrs #agility (Fixed 3) >> pure t
        ":barkham:054" -> do
          bosses <- select (enemyIs Enemies.meowlathotep)
          if not (null bosses)
            then do
              investigators <- getInvestigators
              for_ bosses \eid -> for_ investigators \who -> push $ EnemyWillAttack $ enemyAttack eid attrs who
            else do
              locations <- select lousyWithCats
              if null locations
                then gainSurge attrs
                else chooseOrRunOneM iid $ targets locations \lid -> exposeMeowsk iid attrs lid False
          pure t
        ":barkham:055" -> do
          locations <- select $ LocationWithMostClues Anywhere
          chooseOrRunOneM iid $ targets locations $ attachTreachery attrs
          pure t
        ":barkham:056" -> revelationSkillTest sid iid attrs #willpower (Fixed 4) >> pure t
        ":barkham:057" -> revelationSkillTest sid iid attrs #willpower (Fixed 5) >> pure t
        _ -> pure t
    HandleTargetChoice iid (isSource attrs -> True) (EnemyTarget eid) | toCardCode attrs == ":barkham:051" -> do
      sid <- getRandom
      placeDoom attrs eid 1
      evade <- fromMaybe 0 <$> field EnemyField.EnemyEvade eid
      revelationSkillTest sid iid attrs #agility (Fixed evade)
      pure $ setMeta eid t
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      sid <- getRandom
      case toCardCode attrs of
        ":barkham:050" -> beginSkillTest sid iid (attrs.ability 1) iid #intellect (Fixed 3)
        ":barkham:055" -> chooseOneM iid $ for_ [#willpower, #agility] \skill ->
          skillLabeled skill $ beginSkillTest sid iid (attrs.ability 1) attrs skill (Fixed 4)
        _ -> pure ()
      pure t
    PassedThisSkillTest iid (isAbilitySource attrs 1 -> True) -> do
      when (toCardCode attrs `elem` [":barkham:050", ":barkham:055"]) $ toDiscardBy iid (attrs.ability 1) attrs
      pure t
    FailedThisSkillTestBy iid (isSource attrs -> True) n -> do
      case toCardCode attrs of
        ":barkham:049" -> loseActions iid attrs n
        ":barkham:052" -> assignHorror iid attrs n
        ":barkham:053" -> assignDamage iid attrs n
        ":barkham:057" -> ceilingCatPayment iid attrs n
        _ -> pure ()
      pure t
    FailedThisSkillTest iid (isSource attrs -> True) -> do
      case toCardCode attrs of
        ":barkham:051" -> case Aeson.fromJSON attrs.meta of
          Aeson.Success eid -> push $ EnemyWillAttack $ enemyAttack (eid :: EnemyId) attrs iid
          _ -> error "On Your Tail is missing its selected enemy"
        ":barkham:056" -> do
          assets <- select $ assetControlledBy iid
          if null assets
            then assignDamage iid attrs 2
            else chooseOrRunOneM iid $ targets assets removeFromGame
        _ -> pure ()
      pure t
    DoStep remaining (Revelation iid (isSource attrs -> True)) | toCardCode attrs == ":barkham:057" -> do
      ceilingCatPayment iid attrs remaining
      pure t
    _ -> BarkhamTreachery <$> liftRunMessage msg attrs

-- Pay each failed point explicitly. A chosen discard reduces the remaining
-- count once; it cannot be replaced by repeatedly choosing an empty pool.
ceilingCatPayment :: ReverseQueue m => InvestigatorId -> TreacheryAttrs -> Int -> m ()
ceilingCatPayment _ _ n | n <= 0 = pure ()
ceilingCatPayment iid attrs n = do
  resources <- field InvestigatorResources iid
  hand <- select $ inHandOf NotForPlay iid <> basic DiscardableCard <> CardWithoutModifier CannotLeaveYourHand
  let continue = DoStep (n - 1) (Revelation iid $ toSource attrs)
      options =
        [Label "Lose 1 resource" [LoseResources iid (toSource attrs) 1, continue] | resources > 0]
        <> [targetLabel card [DiscardCard iid (toSource attrs) card.id, continue] | card <- hand]
  unless (null options) $ chooseOne iid options
