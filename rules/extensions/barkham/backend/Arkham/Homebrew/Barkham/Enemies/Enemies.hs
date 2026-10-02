module Arkham.Homebrew.Barkham.Enemies.Enemies where

import Arkham.Ability
import Arkham.Card (CardCode, toCardCode)
import Arkham.Enemy.Import.Lifted
import Arkham.Enemy.Types (Field (EnemyCardsUnderneath), metaL)
import Arkham.Helpers.GameValue (perPlayer)
import Arkham.Helpers.Investigator (getJustLocation)
import Arkham.Helpers.Modifiers
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Cards
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Homebrew.Barkham.Traits
import Arkham.Keyword qualified as Keyword
import Arkham.Location.Types (Field (..))
import Arkham.Matcher
import Arkham.Projection
import Arkham.ScenarioLogKey
import Arkham.Trait (HasTraits (toTraits), Trait (Central))
import Arkham.Window qualified as Window

newtype BarkhamEnemy = BarkhamEnemy EnemyAttrs
  deriving anyclass IsEnemy
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

meowlathotep :: EnemyCard BarkhamEnemy
meowlathotep = enemy BarkhamEnemy Cards.meowlathotep
theHisserInTheDark :: EnemyCard BarkhamEnemy
theHisserInTheDark = enemy BarkhamEnemy Cards.theHisserInTheDark
catOfTindalos :: EnemyCard BarkhamEnemy
catOfTindalos = enemy BarkhamEnemy Cards.catOfTindalos
theDwellerInTheDeep :: EnemyCard BarkhamEnemy
theDwellerInTheDeep = enemy BarkhamEnemy Cards.theDwellerInTheDeep
theMewlingHunger :: EnemyCard BarkhamEnemy
theMewlingHunger = enemy BarkhamEnemy Cards.theMewlingHunger
ghostCat :: EnemyCard BarkhamEnemy
ghostCat = enemy BarkhamEnemy Cards.ghostCat
catRidingOnAByakat :: EnemyCard BarkhamEnemy
catRidingOnAByakat = enemy BarkhamEnemy Cards.catRidingOnAByakat
pouncerInTheNight :: EnemyCard BarkhamEnemy
pouncerInTheNight = enemy BarkhamEnemy Cards.pouncerInTheNight
estrangedCat :: EnemyCard BarkhamEnemy
estrangedCat = enemy BarkhamEnemy Cards.estrangedCat & setSpawnAt EmptyLocation
rodentKiller :: EnemyCard BarkhamEnemy
rodentKiller = enemy BarkhamEnemy Cards.rodentKiller & setPrey (NearestToLocation $ oneOf
  [ lousyWithCats
  , LocationWithEnemy (enemyIs Cards.meowlathotep <> EnemyWithAnyCardsUnderneath)
  ])
orderCultist :: EnemyCard BarkhamEnemy
orderCultist = enemy BarkhamEnemy Cards.orderCultist & setSpawnAt EmptyLocation
servantOfDogSothoth :: EnemyCard BarkhamEnemy
servantOfDogSothoth = enemy BarkhamEnemy Cards.servantOfDogSothoth

instance HasModifiersFor BarkhamEnemy where
  getModifiersFor (BarkhamEnemy a) = case toCardCode a of
    ":barkham:037" -> do
      let n = count (elem Meowsk . toTraits) (enemyCardsUnderneath a)
      bonus <- perPlayer n
      modifySelf a $ [HealthModifier bonus, EnemyFight (n `div` 2), EnemyEvade (n `div` 2)]
        <> [AddKeyword Keyword.Retaliate | n >= 3]
        <> [AddKeyword Keyword.Alert | n >= 3]
    c | c `elem` [":barkham:038", ":barkham:039", ":barkham:040", ":barkham:041", ":barkham:042", ":barkham:043", ":barkham:044"] -> do
      bonus <- perPlayer 1
      modifySelf a [HealthModifier bonus]
    ":barkham:048" -> do
      locations <- select Anywhere
      totals <- for locations \lid -> do
        revealedEnemies <- select (EnemyAt $ LocationWithId lid)
        hidden <- length <$> field LocationCardsUnderneath lid
        attached <- concatMapM (field EnemyCardsUnderneath) revealedEnemies
        pure (lid, length revealedEnemies + hidden + count (elem Meowsk . toTraits) attached)
      let largest = foldr max 0 (map snd totals)
      modifySelf a [ForceSpawnLocation $ oneOf [LocationWithId lid | (lid, n) <- totals, n == largest]]
    _ -> pure mempty

instance HasAbilities BarkhamEnemy where
  getAbilities (BarkhamEnemy a) = extend a $ case toCardCode a of
    ":barkham:038" ->
      [ mkAbility a 1 $ forced $ Enters #after (investigatorEngagedWith a) (LocationWithTrait Central)
      , mkAbility a 2 $ forced $ Leaves #after (investigatorEngagedWith a) (LocationWithTrait Central)
      ]
    ":barkham:045" -> [restricted a 1 CanPlaceDoomOnThis $ forced $ EnemyEntersPlay #after (be a)]
    ":barkham:047" -> [restricted a 1 CanPlaceDoomOnThis $ forced $ PhaseEnds #when #mythos]
    c -> case parleyKey c of
      Just key -> [restricted a 1 (OnSameLocation <> Remembered (barkhamKey key)) $ parleyAction Free]
      Nothing -> []

instance RunMessage BarkhamEnemy where
  runMessage msg e@(BarkhamEnemy attrs) = runQueueT $ case msg of
    BeginTurn _ | toCardCode attrs == ":barkham:038" ->
      pure $ BarkhamEnemy $ attrs & metaL .~ toJSON (mempty :: Trails)
    EndTurn _ | toCardCode attrs == ":barkham:038" ->
      pure $ BarkhamEnemy $ attrs & metaL .~ toJSON (mempty :: Trails)
    UseCardAbility iid (isSource attrs -> True) n windows _
      | toCardCode attrs == ":barkham:038" && n `elem` [1, 2] -> do
          let trails = getEnemyMetaDefault (mempty :: Trails) attrs
              (entered, left) = findWithDefault ([], []) iid trails
              moved = mapMaybe (movementLocation n . Window.windowType) windows
              entered' = if n == 1 then nub (entered <> moved) else entered
              left' = if n == 2 then nub (left <> moved) else left
              updated = insertMap iid (entered', left') trails
          centers <- select (LocationWithTrait Central)
          when (all (`elem` entered') centers && all (`elem` left') centers) $ addToVictory iid attrs
          pure $ BarkhamEnemy $ attrs & metaL .~ toJSON updated
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      case toCardCode attrs of
        ":barkham:045" -> placeDoom attrs attrs 1
        ":barkham:047" -> placeDoom (attrs.ability 1) attrs 1
        c | isJust (parleyKey c) -> do
          addToVictory iid attrs
          when (c == ":barkham:043") $ findEncounterCard iid attrs (cardIs Cards.estrangedCat)
        _ -> pure ()
      pure e
    FoundEncounterCard iid (isTarget attrs -> True) card | toCardCode attrs == ":barkham:043" -> do
      lid <- getJustLocation iid
      createEnemyAt_ card lid
      pure e
    _ -> BarkhamEnemy <$> liftRunMessage msg attrs

type Trails = Map InvestigatorId ([LocationId], [LocationId])

movementLocation :: Int -> Window.WindowType -> Maybe LocationId
movementLocation n = \case
  Window.Entering _ lid | n == 1 -> Just lid
  Window.Leaving _ lid | n == 2 -> Just lid
  _ -> Nothing

parleyKey :: CardCode -> Maybe Text
parleyKey = \case
  ":barkham:039" -> Just "PossessABallOfYarn"
  ":barkham:040" -> Just "BrushedUpOnCatPhysiology"
  ":barkham:041" -> Just "ScoredSomeTastyFood"
  ":barkham:042" -> Just "BuriedTheBonesAFewMetersFromWhereYouFoundThem"
  ":barkham:043" -> Just "LearnedTheBarkOfTheOuterGods"
  ":barkham:044" -> Just "ACatHasAnAppointmentWithTheVet"
  _ -> Nothing
