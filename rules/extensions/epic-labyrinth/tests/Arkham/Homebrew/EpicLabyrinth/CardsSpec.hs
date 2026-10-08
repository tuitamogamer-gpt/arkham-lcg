module Arkham.Homebrew.EpicLabyrinth.CardsSpec (spec) where

import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Asset.Types (Field (AssetCardId))
import Arkham.Action qualified as Action
import Arkham.Agenda.Sequence qualified as Agenda
import Arkham.Agenda.Types (Field (AgendaSequence))
import Arkham.Card
import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Classes.HasGame (getGame)
import Arkham.Cost (Payment (NoPayment))
import Arkham.Difficulty (Difficulty (Standard))
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.Enemy.Types (EnemyAttrs (..), Field (EnemyPlacement))
import Arkham.Homebrew.EpicLabyrinth.Assets.DecayDiagram qualified as Decay
import Arkham.Homebrew.EpicLabyrinth.Assets.HungerDiagram qualified as Hunger
import Arkham.Homebrew.EpicLabyrinth.Assets.RotDiagram qualified as Rot
import Arkham.Homebrew.EpicLabyrinth.Enemies.EixodolonsPet qualified as Pet
import Arkham.Homebrew.EpicLabyrinth.Enemies.TheJailor qualified as Jailor
import Arkham.Homebrew.EpicLabyrinth.Coordinator (initialEvent, replicaFor)
import Arkham.Homebrew.EpicLabyrinth.Helpers (getEpicGroup, seedEpicReplicaMessages, resumeBarrierQueue)
import Arkham.Homebrew.EpicLabyrinth.Types (LabyrinthGroup (..), allGroups)
import Arkham.Homebrew.EpicLabyrinth.Types qualified as Epic
import Arkham.Homebrew.EpicLabyrinth.Treacheries.ParadoxEffect qualified as Paradox
import Arkham.Id
import Arkham.Game.Base (Game (..))
import Arkham.Game.State (GameState (..))
import Arkham.Helpers.Log (getHasRecord)
import Arkham.Helpers.Scenario (getVictoryDisplay, getScenarioMetaKeyDefault, scenarioField)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Investigator.Types qualified as Investigator
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Location.Types (LocationAttrs (..), Field (LocationDoom))
import Arkham.Matcher qualified as Matcher
import Arkham.Message.Story (StoryMessage (PlaceStory))
import Arkham.Placement
import Arkham.Phase (Phase (CampaignPhase, MythosPhase))
import Arkham.Projection
import Arkham.Source
import Arkham.Scenario.Types (Field (ScenarioSetAsideCards), setMetaKey)
import Arkham.Scenarios.TheLabyrinthsOfLunacy.Key qualified as Log
import Arkham.Scenarios.TheLabyrinthsOfLunacy.Meta qualified as NativeMeta
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Stories
import Arkham.Treachery.CardDefs.TheLabyrinthsOfLunacy qualified as Treacheries
import Arkham.Zone (OutOfPlayZone (SetAsideZone))
import Data.UUID qualified as UUID
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import Data.Text qualified as Text
import TestImport qualified as TI
import TestImport.New

spec :: Spec
spec = describe "Epic Labyrinth original player interactions and encounter cards" do
  for_ allGroups $ \group ->
    it ("seeds the locked " <> show group <> " replica before native PreScenarioSetup in a fresh Epic game")
      . scenarioTestWithDifficulty Investigators.jennyBarnes Standard "70001" $ \self -> do
        let change = overAttrs $ setMetaKey "epicMultiplayer" True
              . setMetaKey "epicLabyrinthOutbox" ([] :: [Text])
        overTest $ modeL %~ fmap change
        getScenarioMetaKeyDefault "epicLabyrinthReplica" Null `shouldReturn` Null
        fresh <- getGame
        let state = either (error . show) id $ initialEvent $ Map.fromList
              [(table, Set.singleton self.id) | table <- allGroups]
            replica = either (error . show) id $ replicaFor group state
            synchronized = seedEpicReplicaMessages [ScenarioSpecific "epicLabyrinth.replica" $ toJSON replica] fresh
        overTest $ const synchronized
        -- The actual handler reads the authoritative group before merging its
        -- native scenario metadata. It must succeed without a queued pull first.
        run PreScenarioSetup
        getEpicGroup `shouldReturn` group
        getScenarioMetaKeyDefault "epicMultiplayer" False `shouldReturn` True
        getScenarioMetaKeyDefault "epicLabyrinthOutbox" ([] :: [Text]) `shouldReturn` []

  it "resumes round barrier windows and the saved finish through the actual native message loop"
    . scenarioTestWithDifficulty Investigators.jennyBarnes Standard "70001" $ \self -> do
      void $ genPlayerCard $ toCardDef $ toAttrs self
      void $ testAgenda "01105" id
      let state = either (error . show) id $ initialEvent $ Map.fromList
            [(group, Set.singleton self.id) | group <- allGroups]
          replica = either (error . show) id $ replicaFor GroupA state
          change = overAttrs $ setMetaKey "epicMultiplayer" True
            . setMetaKey "epicLabyrinthReplica" replica
      overTest $ modeL %~ fmap change
      chamber <- testLocation
      self `moveTo` chamber
      vent <- genCard Stories.theVent
      run $ StoryMessage $ PlaceStory vent $ AtLocation chamber.id
      -- This runs Game.runMessages, rather than calling the gate or the
      -- ScenarioSpecific handler directly. The original window must wait.
      run EndRoundWindow
      pending <- getScenarioMetaKeyDefault "epicLabyrinthOutbox" [] :: TestAppT [Epic.Request]
      map Epic.requestOperation pending `shouldBe` [Epic.SetDoom 0, Epic.Arrive $ Epic.RoundBarrier 1]
      continuations <- getScenarioMetaKeyDefault "epicLabyrinthContinuations" mempty
        :: TestAppT (Map.Map Epic.BarrierKey Message)
      Map.lookup (Epic.RoundBarrier 1) continuations `shouldBe` Just EndRoundWindow
      waiting <- getGame
      let opened = ScenarioSpecific "epicLabyrinth.delivery" $ toJSON $
            Epic.DeliveryEnvelope (Epic.DeliveryId "native-round:open") (Epic.OpenBarrier (Epic.RoundBarrier 1) 1)
          resumed = fromJustNote "an opened barrier resumes the real native tail" $
            resumeBarrierQueue waiting [EndRound] [opened]
          unrelated = waiting {gameQuestion = Map.map (const $ ChooseOne [Label "Unrelated decision" [Noop]]) waiting.gameQuestion}
      resumeBarrierQueue unrelated [EndRound] [opened] `shouldBe` Nothing
      resumeBarrierQueue waiting [EndRound] [ScenarioSpecific "unrelated" Null] `shouldBe` Nothing
      runAll resumed
      -- The printed Vent reaction must pause the resumed native work first.
      chooseOptionMatching "decline the real Vent round-end trigger" \case
        SkipTriggersButton {} -> True
        _ -> False
      finished <- getScenarioMetaKeyDefault "epicLabyrinthOutbox" [] :: TestAppT [Epic.Request]
      map Epic.requestOperation finished `shouldSatisfy` elem (Epic.FinishWindow $ Epic.RoundBarrier 1)
      after <- getScenarioMetaKeyDefault "epicLabyrinthContinuations" mempty
        :: TestAppT (Map.Map Epic.BarrierKey Message)
      Map.lookup (Epic.RoundBarrier 1) after `shouldBe` Just EndRound

  it "keeps a stage checkpoint until release resumes the actual agenda before its saved phase tail"
    . scenarioTestWithDifficulty Investigators.jennyBarnes Standard "70001" $ \self -> do
      void $ genPlayerCard $ toCardDef $ toAttrs self
      agenda <- testAgenda "01105" id
      let state = either (error . show) id $ initialEvent $ Map.fromList
            [(group, Set.singleton self.id) | group <- allGroups]
          replica = either (error . show) id $ replicaFor GroupA state
          change = overAttrs $ setMetaKey "epicMultiplayer" True
            . setMetaKey "epicLabyrinthReplica" replica
          stage = Epic.StageBarrier 1
          envelope label body = ScenarioSpecific "epicLabyrinth.delivery" $ toJSON $
            Epic.DeliveryEnvelope (Epic.DeliveryId label) body
          savedTail = [Begin MythosPhase]
      overTest $ modeL %~ fmap change
      run $ AdvanceAgendaBy agenda.id AgendaAdvancedWithDoom
      waiting <- getGame
      let opened = envelope "native-stage:open" $ Epic.OpenBarrier stage 1
      resumeBarrierQueue waiting savedTail [opened] `shouldBe` Nothing
      -- Use the adapter's preserved checkpoint path for a stage opening.
      runAll [opened, AskMap waiting.gameQuestion]
      acknowledged <- getScenarioMetaKeyDefault "epicLabyrinthOutbox" [] :: TestAppT [Epic.Request]
      map Epic.requestOperation acknowledged `shouldSatisfy` elem (Epic.FinishWindow stage)
      checkpoint <- getGame
      checkpoint.gameQuestion `shouldBe` waiting.gameQuestion
      checkpoint.gamePhase `shouldBe` CampaignPhase
      Agenda.agendaSide <$> field AgendaSequence agenda.id `shouldReturn` Agenda.A
      let released = envelope "native-stage:release" $ Epic.ReleaseBarrier stage 1
          resumed = fromJustNote "stage release resumes the native agenda continuation" $
            resumeBarrierQueue checkpoint savedTail [released]
      runAll resumed
      -- The real agenda flips and asks its native confirmation before the
      -- pending Mythos tail can run or create an unrelated encounter question.
      Agenda.agendaSide <$> field AgendaSequence agenda.id `shouldReturn` Agenda.B
      after <- getGame
      after.gamePhase `shouldBe` CampaignPhase
      after.gameQuestion `shouldNotBe` waiting.gameQuestion

  it "registers the six printed Epic identities instead of single-group substitutes" do
    map toCardCode [Assets.rotDiagramEpicMultiplayer, Assets.hungerDiagramEpicMultiplayer, Assets.decayDiagramEpicMultiplayer,
      Enemies.eixodolonsPetEpicMultiplayer, Enemies.theJailor, Treacheries.paradoxEffectEpicMultiplayer]
      `TI.shouldBe` ["70042", "70044", "70046", "70049", "70051", "70059"]
    [toCardCode Rot.rotDiagram, toCardCode Hunger.hungerDiagram, toCardCode Decay.decayDiagram]
      `TI.shouldBe` ["70042", "70044", "70046"]
    toCardCode Pet.eixodolonsPet `TI.shouldBe` "70049"
    toCardCode Jailor.theJailor `TI.shouldBe` "70051"
    toCardCode Paradox.paradoxEffect `TI.shouldBe` "70059"

  it "only adds the Chamber of Hunger send action while the Pet is locked away" do
    let builder = cbCardBuilder Pet.eixodolonsPet (unsafeMakeCardId UUID.nil) (EnemyId UUID.nil)
        locked = overAttrs (\a -> a {enemyPlacement = Global}) builder
        free = overAttrs (\a -> a {enemyPlacement = AtLocation $ LocationId UUID.nil}) builder
    any ((== 1) . (.index)) (getAbilities locked) `TI.shouldBe` True
    any ((== 1) . (.index)) (getAbilities free) `TI.shouldBe` False

  for_ [(Locations.chamberOfHunger, Assets.hungerDiagram, Assets.hungerDiagramEpicMultiplayer),
        (Locations.chamberOfDecay, Assets.decayDiagram, Assets.decayDiagramEpicMultiplayer),
        (Locations.chamberOfRot, Assets.rotDiagram, Assets.rotDiagramEpicMultiplayer)] $
    \(definition, singleDiagram, epicDiagram) -> for_ [False, True] $ \epic ->
      it ("clearing chamber " <> show (toCardCode definition) <> " enables its printed diagram pickup in " <> if epic then "Epic mode" else "Single mode")
        . scenarioTestWithDifficulty Investigators.jennyBarnes Standard "70001" $ \self -> do
          void $ genPlayerCard $ toCardDef $ toAttrs self
          overTest $ modeL %~ fmap (overAttrs $ setMetaKey "epicMultiplayer" epic)
          chamber <- testLocationWithDef definition $ \attrs -> attrs {locationRevealed = True}
          self `moveTo` chamber
          diagram <- genCard $ if epic then epicDiagram else singleDiagram
          run $ SetAsideCards [diagram]
          -- Native performability checks must reject the same printed fast
          -- action while clues remain, rather than merely expose a builder.
          run $ PlaceClues GameSource (LocationTarget chamber.id) 1
          let pickup = Matcher.AbilityIs (LocationSource chamber.id) 1
                <> Matcher.PerformableAbilityBy (Matcher.InvestigatorWithId self.id) []
          select pickup `shouldReturn` []
          run $ RemoveClues GameSource (LocationTarget chamber.id) 1
          abilities <- select pickup
          length abilities `shouldBe` 1
          case abilities of
            [ability] -> self `useAbility` ability
            _ -> expectationFailure "the cleared chamber must have exactly one printed pickup"
          assets <- select $ Matcher.AssetControlledBy (Matcher.InvestigatorWithId self.id)
            <> Matcher.assetIs (if epic then epicDiagram else singleDiagram)
          length assets `shouldBe` 1
          traverse (field AssetCardId) assets `shouldReturn` [toCardId diagram]
          map toCardId <$> scenarioField ScenarioSetAsideCards `shouldReturn` []
          select pickup `shouldReturn` []

  for_ [(1, GroupA, [GroupB, GroupC]), (2, GroupB, [GroupB]),
        (3, GroupC, [GroupA, GroupC]), (4, GroupA, allGroups)] $ \(result, group, survivors) ->
    it ("global Labyrinth R" <> show result <> " reads its printed ending, records actual group outcomes and finishes the native game once")
      . scenarioTestWithDifficulty Investigators.jennyBarnes Standard "70001" $ \self -> do
        void $ genPlayerCard $ toCardDef $ toAttrs self
        let initial = either (error . show) id $ initialEvent $ Map.fromList
              [(table, Set.singleton self.id) | table <- allGroups]
            state = initial {Epic.eventGroups = Map.mapWithKey
              (\table entry -> entry {Epic.groupSurviving = table `elem` survivors}) initial.eventGroups}
            replica = either (error . show) id $ replicaFor group state
            receipt = ScenarioSpecific "epicLabyrinth.delivery" $ toJSON $
              Epic.DeliveryEnvelope (Epic.DeliveryId "native-labyrinth:resolution") (Epic.ResolveTogether result)
        overTest $ modeL %~ fmap (overAttrs $ setMetaKey "epicMultiplayer" True
          . setMetaKey "epicLabyrinthReplica" replica)
        run PreScenarioSetup
        -- R1 starts with a genuinely live investigator, so its native kill
        -- and possible last-investigator queue transition execute here.
        Investigator.investigatorKilled . toAttrs <$> getInvestigator self.id `shouldReturn` False
        run receipt
        reading <- getGame
        tshow (toJSON reading.gameQuestion) `shouldSatisfy` Text.isInfixOf
          ("$standalone.theLabyrinthsOfLunacy.resolutions.resolution" <> tshow result <> ".title")
        reading.gameGameState `shouldBe` IsActive
        Investigator.investigatorKilled . toAttrs <$> getInvestigator self.id `shouldReturn` (result == 1)
        for_ allGroups $ \table -> do
          let outcome = if table `elem` survivors then Log.TheGroupEscapedTheLabyrinth else Log.TheGroupPerished
          getHasRecord (case table of GroupA -> Log.GroupA outcome; GroupB -> Log.GroupB outcome; GroupC -> Log.GroupC outcome)
            `shouldReturn` (result /= 1 || table == group)
        let nativeGroup = case group of GroupA -> NativeMeta.GroupA; GroupB -> NativeMeta.GroupB; GroupC -> NativeMeta.GroupC
        getScenarioMetaKeyDefault "playedGroups" ([] :: [NativeMeta.Group]) `shouldReturn` [nativeGroup]
        getScenarioMetaKeyDefault "survivedGroups" ([] :: [NativeMeta.Group]) `shouldReturn`
          [nativeGroup | result /= 1]
        getScenarioMetaKeyDefault "epicLabyrinthResolution" (0 :: Int) `shouldReturn` result
        before <- getScenarioMetaKeyDefault "epicLabyrinthOutbox" [] :: TestAppT [Epic.Request]
        length (filter ((== Epic.SetSurviving False) . Epic.requestOperation) before) `shouldBe` if result == 1 then 1 else 0
        runAll [receipt, AskMap reading.gameQuestion]
        replayed <- getGame
        replayed.gameQuestion `shouldBe` reading.gameQuestion
        getScenarioMetaKeyDefault "epicLabyrinthOutbox" [] `shouldReturn` before
        Investigator.investigatorKilled . toAttrs <$> getInvestigator self.id `shouldReturn` (result == 1)
        chooseFirstOption "continue the printed Labyrinth resolution"
        gameGameState <$> getGame `shouldReturn` IsOver

  it "Rot Diagram adds one doom and flips exactly the selected number of clues" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfDecay id
    self `moveTo` chamber
    withProp @"clues" 3 self
    diagram <- self `putAssetIntoPlay` Assets.rotDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy chamber $ AssetSource diagram) 2 [] NoPayment
    -- clickLabel intentionally compares only an i18n key's first word; these
    -- literal choices share "Turn", so select the complete printed choice.
    chooseOptionMatching "convert exactly two clues" \case
      Label label _ -> label == "Turn 2 of your clues into additional doom in Chamber of Decay"
      _ -> False
    self.clues `shouldReturn` 1
    field LocationDoom chamber.id `shouldReturn` 3

  it "Rot Diagram permits retaining every clue while placing its mandatory doom" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfDecay id
    self `moveTo` chamber
    withProp @"clues" 2 self
    diagram <- self `putAssetIntoPlay` Assets.rotDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy chamber $ AssetSource diagram) 2 [] NoPayment
    chooseOptionMatching "retain all clues" \case
      Label label _ -> label == "Turn 0 of your clues into additional doom in Chamber of Decay"
      _ -> False
    self.clues `shouldReturn` 2
    field LocationDoom chamber.id `shouldReturn` 1

  it "Hunger Diagram's successful investigation gives the Syringe without discovering ordinary clues" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfRot id
    self `moveTo` chamber
    syringe <- genCard Assets.mysteriousSyringe
    run $ SetAsideCards [syringe]
    diagram <- self `putAssetIntoPlay` Assets.hungerDiagramEpicMultiplayer
    run $ Successful (Action.Investigate, LocationTarget chamber.id) self.id (AssetSource diagram) (AssetTarget diagram) 1
    assertAny $ Matcher.AssetControlledBy (Matcher.InvestigatorWithId self.id) <> Matcher.assetIs Assets.mysteriousSyringe
    self.clues `shouldReturn` 0

  it "Decay Diagram's four damage defeats the locked-away Pet with one investigator" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    self `moveTo` hunger
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    diagram <- self `putAssetIntoPlay` Assets.decayDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy hunger $ AssetSource diagram) 2 [] NoPayment
    assertNone $ Matcher.EnemyWithId pet.id
    victory <- getVictoryDisplay
    map toCardId victory `shouldContain` [toCardId pet]

  it "Decay Diagram deals four surviving damage against the two-investigator Pet" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    self `moveTo` hunger
    other <- addInvestigator Investigators.rolandBanks
    other `moveTo` hunger
    overTest $ \game -> game {gamePlayerCount = 2}
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    diagram <- self `putAssetIntoPlay` Assets.decayDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy hunger $ AssetSource diagram) 2 [] NoPayment
    assertAny $ Matcher.EnemyWithId pet.id
    pet.damage `shouldReturn` 4

  it "a locked Pet is immune to player modifiers while an unleashed Pet is not" . gameTest $ \_ -> do
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    -- Direct fixture insertion does not preload the native modifier cache.
    run Noop
    getModifiers pet >>= (`shouldContain` [CannotReceiveModifiersFromPlayerSources])
    location <- testLocation
    run $ PlaceEnemy pet.id $ AtLocation location.id
    modifiers <- getModifiers pet
    modifiers `shouldNotContain` [CannotReceiveModifiersFromPlayerSources]

  it "sending the Pet sets it aside rather than transferring a damaged enemy immediately" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    run $ UseCardAbility self.id (proxy hunger pet) 1 [] NoPayment
    field EnemyPlacement pet.id `shouldReturn` OutOfPlay SetAsideZone
