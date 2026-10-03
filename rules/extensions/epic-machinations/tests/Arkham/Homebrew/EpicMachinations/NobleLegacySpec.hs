module Arkham.Homebrew.EpicMachinations.NobleLegacySpec (spec) where

import Arkham.Ability (abilityCost, abilityIndex)
import Arkham.Card
import Arkham.Classes.HasGame (getGame)
import Arkham.Cost (Cost (ActionCost, GroupClueCost), Payment (NoPayment))
import Arkham.GameValue (GameValue (PerPlayer))
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault, scenarioField)
import Arkham.Homebrew.EpicLabyrinth.Types (DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Location.CardDefs.MachinationsThroughTime qualified as Locations
import Arkham.Location.Types (Field (LocationCardId))
import Arkham.Matcher
import Arkham.Message.Story qualified as StoryMessage
import Arkham.Placement (Placement (Unplaced))
import Arkham.Projection (field)
import Arkham.Scenario.Types (Field (ScenarioSetAsideCards), setMetaKey)
import Arkham.ScenarioLogKey
import Arkham.SkillTest.Type (SkillTestType (..))
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Stories
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import TestImport.New

spec :: Spec
spec = describe "Printed Epic Noble Legacy branches" do
  it "requires the printed four clues per local investigator in the Present"
    . scenarioTest "87001" $ \self -> do
      setupEra PresentEra self
      payment <- presentPayment
      payment `shouldBe` (ActionCost 1 <> GroupClueCost (PerPlayer 4) Anywhere)

  it "retains the ordinary Present payment without an Epic replica"
    . gameTest $ \_ -> do
      _ <- putStory Stories.aNobleLegacyPresent
      payment <- presentPayment
      payment `shouldBe` (ActionCost 1 <> GroupClueCost (PerPlayer 2) Anywhere)

  it "announces founding from the Present without searching its absent Future location"
    . scenarioTest "87001" $ \self -> do
      setupEra PresentEra self
      run $ UseCardAbility self.id (StorySource $ StoryId "87015") 3 [] NoPayment
      selectCount (locationIs Locations.corriganIndustries) `shouldReturn` 0
      pendingOperations `shouldReturn` [Announce CorriganIndustriesHasBeenFounded]

  it "places the same set-aside Future Corrigan Industries exactly once on the founding receipt"
    . scenarioTest "87001" $ \self -> do
      setupEra FutureEra self
      pool <- scenarioField ScenarioSetAsideCards
      let original = fromJustNote "the Future owns its set-aside physical Corrigan Industries" $
            find ((== toCardCode Locations.corriganIndustries) . toCardCode) pool
          delivery = ScenarioSpecific "epicMachinations.delivery" $ toJSON $
            MachinationsEnvelope (DeliveryId "noble:founding:1") $ ReceiveAnnouncement CorriganIndustriesHasBeenFounded
      run delivery
      run delivery
      locations <- select $ locationIs Locations.corriganIndustries
      length locations `shouldBe` 1
      for_ locations $ \lid -> field LocationCardId lid `shouldReturn` toCardId original
      remaining <- scenarioField ScenarioSetAsideCards
      map toCardId remaining `shouldSatisfy` notElem (toCardId original)

  it "refuses seven clues and consumes the printed eight after a successful Future test"
    . scenarioTest "87001" $ \self -> do
      setupEra FutureEra self
      withProp @"clues" 7 self
      passFutureTest self
      self.clues `shouldReturn` 7
      pendingOperations `shouldReturn` []
      withProp @"clues" 8 self
      passFutureTest self
      self.clues `shouldReturn` 0
      pendingOperations `shouldReturn` [Announce ThomasAndMaryHaveMadeAHistoricDiscovery]

  it "keeps the ordinary Future success payment at two clues"
    . gameTest $ \self -> do
      _ <- putStory Stories.aNobleLegacyFuture
      withProp @"clues" 2 self
      passFutureTest self
      self.clues `shouldReturn` 0
      pendingOperations `shouldReturn` []

setupEra :: Era -> Investigator -> TestAppT ()
setupEra era self = do
  void $ genPlayerCard $ fromJustNote "native investigator definition" $ lookupCardDef $ toCardCode self
  let state = either (error . show) id $ initialMachinations $ Map.fromList [(group, Set.singleton self.id) | group <- allEras]
      replica = either (error . show) id $ machinationsReplicaFor era state
      change = overAttrs $ setMetaKey "epicMultiplayer" True . setMetaKey "epicMachinationsReplica" replica
  overTest $ modeL %~ \case
    That scenario -> That $ change scenario
    These campaign scenario -> These campaign $ change scenario
    _ -> error "native Noble test needs its scenario"
  run Setup
  chooseOnlyOption "start this era at Tindalos"
  chooseOnlyOption "flip this era's Noble Legacy"

presentPayment :: TestAppT Cost
presentPayment = do
  game <- getGame
  let entity = fromJustNote "the physical Present Noble Legacy" $ Map.lookup (StoryId "87015") $ entitiesStories game.gameEntities
      ability = fromJustNote "printed teleportation research ability" $ find ((== 2) . abilityIndex) $ getAbilities entity
  pure $ abilityCost ability

putStory :: CardDef -> TestAppT StoryId
putStory definition = do
  card <- genCard definition
  run $ StoryMessage $ StoryMessage.PlaceStory card Unplaced
  pure $ StoryId $ toCardCode definition

passFutureTest :: Investigator -> TestAppT ()
passFutureTest self = run $ PassedSkillTest self.id Nothing
  (toAbilitySource (StoryId "87024") 2) (SkillTestInitiatorTarget $ InvestigatorTarget self.id)
  (SkillSkillTest #intellect) 1

pendingOperations :: TestAppT [MachinationsOperation]
pendingOperations = map machinationsRequestOperation <$> (getScenarioMetaKeyDefault "epicMachinationsOutbox" [] :: TestAppT [MachinationsRequest])
