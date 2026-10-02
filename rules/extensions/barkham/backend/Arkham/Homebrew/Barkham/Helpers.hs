module Arkham.Homebrew.Barkham.Helpers where

import Arkham.Card
import Arkham.Classes
import Arkham.Classes.HasGame (HasGame)
import Arkham.Enemy.Creation (createExhausted)
import Arkham.Enemy.Types (Field (..))
import Arkham.Helpers.Scenario (scenarioField)
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Homebrew.Barkham.Traits
import Arkham.Id
import Arkham.Location.Types (Field (..))
import Arkham.Matcher
import Arkham.Message.Lifted
import Arkham.Message.Lifted.Choose
import Arkham.Prelude
import Arkham.Projection
import Arkham.Scenario.Types (Field (..))
import Arkham.ScenarioLogKey
import Arkham.Source
import Arkham.Trait (HasTraits (toTraits))

lousyWithCats :: LocationMatcher
lousyWithCats = LocationWithCardsUnderneath AnyCards

barkhamKey :: Text -> ScenarioLogKey
barkhamKey = HomebrewScenarioLogKey . ("barkham." <>)

-- Face-down enemies remain cards, not spawned enemy entities. This avoids
-- engagement, hunter movement and doom counting before a cat is exposed.
exposeMeowsk :: (ReverseQueue m, Sourceable source) => InvestigatorId -> source -> LocationId -> Bool -> m ()
exposeMeowsk _iid _source lid exhausted = do
  cards <- field LocationCardsUnderneath lid
  for_ (listToMaybe cards) \card -> do
    removeFromUnderneath lid [card]
    revealed <- setFacedown False card
    -- Exhaustion belongs in the creation request, before spawn engagement.
    -- Exhausting a ready enemy after it spawns would leave it engaged.
    createEnemyAtEdit_ revealed lid (if exhausted then createExhausted else id)

pacifyHiddenMeowsk :: ReverseQueue m => InvestigatorId -> LocationId -> m ()
pacifyHiddenMeowsk iid lid = do
  cards <- field LocationCardsUnderneath lid
  for_ (listToMaybe cards) \card -> do
    removeFromUnderneath lid [card]
    revealed <- setFacedown False card
    addToVictory iid revealed

countMeowsks :: HasGame m => m Int
countMeowsks = do
  live <- selectCount (EnemyWithTrait Meowsk)
  victory <- count (elem Meowsk . toTraits) <$> scenarioField ScenarioVictoryDisplay
  attached <- concatMapM (field EnemyCardsUnderneath) =<< select (enemyIs Enemies.meowlathotep)
  pure $ live + victory + count (elem Meowsk . toTraits) attached

doomNearestEnemy :: (ReverseQueue m, Sourceable source) => InvestigatorId -> source -> m ()
doomNearestEnemy iid source = do
  enemies <- select (NearestEnemyTo iid AnyEnemy)
  chooseOrRunOneM iid $ targets enemies \eid -> placeDoom source eid 1
