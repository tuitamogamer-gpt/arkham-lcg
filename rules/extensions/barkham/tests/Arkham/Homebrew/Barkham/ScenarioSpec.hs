module Arkham.Homebrew.Barkham.ScenarioSpec (spec) where

import Arkham.Ability.Types (abilityIndex)
import Arkham.Act (lookupAct)
import Arkham.Act.Types (Field (ActCard))
import Arkham.Agenda.Types (Field (AgendaCard, AgendaDoom))
import Arkham.Classes.HasChaosTokenValue qualified as Chaos
import Arkham.Classes.HasGame (getGame)
import Arkham.Difficulty (Difficulty (..))
import Arkham.Game.State (GameState (..))
import Arkham.Enemy.Types (Field (EnemyCardsUnderneath, EnemyDamage, EnemyHealth))
import Arkham.Enemy.Types qualified as EnemyField
import Arkham.Helpers.Act (getCurrentActStep)
import Arkham.Helpers.Agenda (getCurrentAgendaStep)
import Arkham.Helpers.ChaosBag (getBagChaosTokens)
import Arkham.Helpers.Log (remembered)
import Arkham.Helpers.Scenario (getEncounterDeck, scenarioField)
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Homebrew.Barkham.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Players
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Homebrew.Barkham.Scenarios.TheMeddlingOfMeowlathotep
import Arkham.Homebrew.Barkham.Traits
import Arkham.Investigator.Types (Field (InvestigatorLocation, InvestigatorClues))
import Arkham.Location.Types (Field (LocationCardsUnderneath))
import Arkham.Matcher
import Arkham.Message.Lifted qualified as Lifted
import Arkham.Projection
import Arkham.Question
import Arkham.Resolution
import Arkham.Scenario.Types (Field (ScenarioMeta, ScenarioVictoryDisplay, ScenarioSetAsideCards))
import Arkham.Trait (HasTraits (toTraits))
import Data.Aeson qualified as Aeson
import TestImport.New

spec :: Spec
spec = describe "Barkham: The Meddling of Meowlathotep" do
  describe "printed intro and setup" do
    for_ [(0, 0, Locations.slobbertown), (0, 1, Locations.snoutside), (1, 0, Locations.beasttown), (1, 1, Locations.tailside)] \(first, second, destination) ->
      it ("starts at the intro outcome " <> show (toCardCode destination))
        . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
          run PreScenarioSetup
          chooseNumber first
          chooseNumber second
          setupBarkham
          lid <- selectJust (locationIs destination)
          field InvestigatorLocation (toId self) `shouldReturn` Just lid

    it "puts six distinct hidden Meowsks under peripheral locations and removes the seventh unseen"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \_ -> do
        setupBarkham
        locations <- select lousyWithCats
        hidden <- concatMapM (field LocationCardsUnderneath) locations
        setAside <- scenarioField ScenarioSetAsideCards
        Deck encounter <- getEncounterDeck
        liftIO do
          length locations `shouldBe` 6
          length hidden `shouldBe` 6
          length (nub $ map toCardId hidden) `shouldBe` 6
          all (elem Meowsk . toTraits) hidden `shouldBe` True
          all isFacedown hidden `shouldBe` True
          count (elem Meowsk . toTraits) setAside `shouldBe` 0
          count (elem Meowsk . toTraits) (map toCard encounter) `shouldBe` 0
          map toCardCode setAside `shouldContain` [":barkham:037"]
          length encounter `shouldBe` 28

    for_ [(Easy, easyBag), (Standard, standardBag), (Hard, hardBag), (Expert, expertBag)] \(difficulty, expected) ->
      it ("uses the printed " <> show difficulty <> " standalone chaos bag")
        . scenarioTestWithDifficulty Players.barkHarrigan difficulty ":barkham:022" $ \_ -> do
          run StandaloneSetup
          actual <- map (.face) <$> getBagChaosTokens
          liftIO $ sort actual `shouldBe` sort expected

  describe "agenda 1" do
    it "spawns the action-exposed Meowsk already exhausted and unengaged"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
        setupBarkham
        lid <- selectJust lousyWithCats
        run $ MoveAllTo GameSource lid
        runQueueT $ exposeMeowsk (toId self) GameSource lid True
        runMessages
        cat <- selectJust (EnemyWithTrait Meowsk)
        selectAny (EnemyWithId cat <> ExhaustedEnemy) `shouldReturn` True
        selectCount (enemyEngagedWith $ toId self) `shouldReturn` 0
        card <- field EnemyField.EnemyCard cat
        liftIO $ isFacedown card `shouldBe` False

    it "exposes the chosen farthest hidden cat, then returns to agenda 1a on its first cycle"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \_ -> do
        setupBarkham
        farthest <- select (FarthestLocationFromAll lousyWithCats)
        liftIO $ length farthest `shouldSatisfy` (> 1)
        aid <- selectJust AnyAgenda
        run $ PlaceDoom GameSource (AgendaTarget aid) 4
        run $ AdvanceAgendaBy aid AgendaAdvancedWithOther
        chooseFirstOption "read agenda back"
        -- The farthest-location tie is a live choice. No cat is exposed yet.
        selectCount lousyWithCats `shouldReturn` 6
        chooseTarget $ fromJustNote "setup supplies farthest hidden locations" $ listToMaybe farthest
        selectCount lousyWithCats `shouldReturn` 5
        getCurrentAgendaStep `shouldReturn` 1
        currentAgenda <- selectJust AnyAgenda
        field AgendaDoom currentAgenda `shouldReturn` 0
        card <- field AgendaCard =<< selectJust AnyAgenda
        liftIO $ toCardCode card `shouldBe` ":barkham:023"

    it "advances to agenda 2 when no locations remain lousy with cats"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
        setupBarkham
        pacifyAll self
        aid <- selectJust AnyAgenda
        run $ AdvanceAgendaBy aid AgendaAdvancedWithOther
        chooseFirstOption "read agenda back"
        getCurrentAgendaStep `shouldReturn` 2

  describe "act 1 and Meowlathotep" do
    it "spawns the boss at the explicitly chosen Central location and transfers live Meowsks facedown"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
        setupBarkham
        pacifyAll self
        center <- selectJust (locationIs Locations.beasttown)
        runQueueT do
          Lifted.createEnemyAt_ Enemies.catOfTindalos center
          Lifted.createEnemyAt_ Enemies.theDwellerInTheDeep center
        runMessages
        aid <- selectJust AnyAct
        run $ AdvanceAct aid GameSource AdvancedWithOther
        chooseFirstOption "read act back"
        selectAny (enemyIs Enemies.meowlathotep) `shouldReturn` False
        chooseTarget center
        boss <- selectJust (enemyIs Enemies.meowlathotep)
        attached <- field EnemyCardsUnderneath boss
        liftIO do
          length attached `shouldBe` 2
          all isFacedown attached `shouldBe` True
        selectCount (EnemyWithTrait Meowsk) `shouldReturn` 0
        getCurrentActStep `shouldReturn` 2
        getCurrentAgendaStep `shouldReturn` 2
        field EnemyHealth boss `shouldReturn` Just 6
        field EnemyField.EnemyFight boss `shouldReturn` Just 4
        field EnemyField.EnemyEvade boss `shouldReturn` Just 4

    for_ [(1, 2), (2, 1)] \(index, expectedDamage) ->
      it ("spends a clue for act ability " <> show index <> " and deals " <> show expectedDamage <> " damage")
        . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
          setupBarkham
          pacifyAll self
          center <- selectJust (locationIs Locations.beasttown)
          aid <- selectJust AnyAct
          run $ AdvanceAct aid GameSource AdvancedWithOther
          chooseFirstOption "read act back"
          chooseTarget center
          run $ MoveAllTo GameSource center
          run $ PlaceClues GameSource (toTarget self) 1
          current <- selectJust AnyAct
          actualCard <- field ActCard current
          let Right entity = lookupAct current 1 (toCardId actualCard)
              Just ability = find ((== index) . abilityIndex) (getAbilities entity)
          boss <- selectJust (enemyIs Enemies.meowlathotep)
          -- Isolate payment and damage from the separate AOO assignment UI.
          runQueueT $ Lifted.exhaustEnemy GameSource boss
          runMessages
          useAbility self ability
          field EnemyDamage boss `shouldReturn` expectedDamage
          field InvestigatorClues (toId self) `shouldReturn` 0

  describe "chaos and persistence" do
    it "counts live, victorious and attached Meowsks once and scales skull rounding by difficulty"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \self -> do
        setupBarkham
        hiddenLocations <- select lousyWithCats
        -- Move three hidden cats to victory through the actual agenda helper.
        for_ (take 3 hiddenLocations) \lid -> runQueueT $ pacifyHiddenMeowsk (toId self) lid
        runMessages
        countMeowsks `shouldReturn` 3
        soft <- Chaos.getChaosTokenValue (toId self) Skull (theMeddlingOfMeowlathotep Easy)
        hard <- Chaos.getChaosTokenValue (toId self) Skull (theMeddlingOfMeowlathotep Hard)
        chaosTokenValue soft `shouldReturn` Just (-2)
        chaosTokenValue hard `shouldReturn` Just (-3)

    it "preserves the selected intro, six hidden identities and remembered parley facts through Game JSON"
      . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \_ -> do
        run PreScenarioSetup
        chooseNumber 1
        chooseNumber 1
        setupBarkham
        run $ Remember $ barkhamKey "PossessABallOfYarn"
        before <- getGame
        hiddenBefore <- hiddenIdentities
        metaBefore <- scenarioField ScenarioMeta
        case Aeson.eitherDecode (Aeson.encode before) of
          Left err -> liftIO $ expectationFailure err
          Right restored -> do
            overTest (const restored)
            hiddenIdentities `shouldReturn` hiddenBefore
            scenarioField ScenarioMeta `shouldReturn` metaBefore
            remembered (barkhamKey "PossessABallOfYarn") `shouldReturn` True

  describe "standalone resolutions" do
    for_ [Resolution 1, Resolution 2, NoResolution] \result ->
      it ("ends the game through " <> show result)
        . scenarioTestWith Players.barkHarrigan ":barkham:022" $ \_ -> do
          run $ ScenarioResolution result
          -- The resolution prose remains a user-visible checkpoint.
          chooseFirstOption "read resolution"
          (gameGameState <$> getGame) `shouldReturn` IsOver

setupBarkham :: TestAppT ()
setupBarkham = do
  run Setup
  chooseFirstOption "enter the selected starting location"
  -- Setup marks the native game as in setup. This harness enters through
  -- Setup directly rather than the campaign's Setup/EndSetup queue, so finish
  -- that flag before testing the normal, post-setup enemy modifiers.
  overTest $ inSetupL .~ False
  run Noop

pacifyAll :: Investigator -> TestAppT ()
pacifyAll self = do
  locations <- select lousyWithCats
  for_ locations \lid -> runQueueT $ pacifyHiddenMeowsk (toId self) lid
  runMessages

hiddenIdentities :: TestAppT [CardId]
hiddenIdentities = sort . map toCardId <$> (concatMapM (field LocationCardsUnderneath) =<< select lousyWithCats)

isFacedown :: Card -> Bool
isFacedown = \case
  EncounterCard card -> ecFacedown card == Just True
  PlayerCard card -> pcFacedown card == Just True
  VengeanceCard card -> isFacedown card

chooseNumber :: Int -> TestAppT ()
chooseNumber n = do
  questions <- mapToList . gameQuestion <$> getGame
  case questions of
    [(_, ChooseOne choices)] -> case drop n choices of
      choice : _ -> run (uiToRun choice)
      _ -> liftIO $ expectationFailure "Intro option index is missing"
    _ -> liftIO $ expectationFailure "The Barkham intro did not present exactly one explicit choice"

symbols :: [ChaosTokenFace]
symbols = [Skull, Skull, Cultist, Tablet, ElderThing, AutoFail, ElderSign]
easyBag, standardBag, hardBag, expertBag :: [ChaosTokenFace]
easyBag = [PlusOne, PlusOne, Zero, Zero, Zero, MinusOne, MinusOne, MinusOne, MinusTwo, MinusTwo] <> symbols
standardBag = [PlusOne, Zero, Zero, MinusOne, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusFour] <> symbols
hardBag = [Zero, Zero, Zero, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusThree, MinusFour, MinusFive] <> symbols
expertBag = [Zero, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusThree, MinusFour, MinusFour, MinusFive, MinusSix, MinusEight] <> symbols
