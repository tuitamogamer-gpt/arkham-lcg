module Arkham.Homebrew.EpicMachinations.ScenarioSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types qualified as Asset
import Arkham.Agenda.Sequence qualified as Agenda
import Arkham.Agenda.Types (Field (AgendaSequence))
import Arkham.Card
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Game.State (GameState (..))
import Arkham.Homebrew.EpicLabyrinth.Types (DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Gate
import Arkham.Homebrew.EpicMachinations.Helpers (getMachinationsReplica, resumeSharedSetupQueue)
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault, scenarioField)
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Investigator.Types qualified as Investigator
import Arkham.Location.Types (Field (LocationClues))
import Arkham.Matcher
import Arkham.Phase (Phase (..))
import Arkham.Projection (field)
import Arkham.Resolution (Resolution (..))
import Arkham.Scenario.Types (Field (ScenarioInResolution, ScenarioMeta, ScenarioSetAsideCards), setMetaKey)
import Arkham.ScenarioLogKey
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
import Data.Text qualified as Text
import TestImport.New

spec :: Spec
spec = describe "Epic Machinations native scenario" do
  for_ allEras $ \era ->
    for_ ["87033", "87034", "87035"] $ \machination ->
      it ("sets up only " <> show era <> " with machination " <> show machination)
        . scenarioTest "87001" $ \self -> do
          initializeEpic era self
          run Setup
          chooseOnlyOption "start this era at Tindalos"
          chooseOnlyOption "flip this era's Noble Legacy"
          prepared <- getGame
          pool <- scenarioField ScenarioSetAsideCards
          for_ pool $ \card -> Map.lookup (toCardId card) prepared.gameCards `shouldBe` Just card
          let edwin = fromJustNote "the Epic Rival is set aside before choosing the common machination" $
                find ((== toCardCode Enemies.edwinBennetEnviousRival) . toCardCode) pool
          receive "test:machination" $ InstallSharedStory machination
          receive "test:plot" $ InstallSharedStory "87038"
          when (era == PastEra && machination == "87035") do
            colleagues <- select $ assetIs Assets.edwinBennetEsteemedColleague
            length colleagues `shouldBe` 1
            for_ colleagues $ \aid -> do
              field Asset.AssetCardId aid `shouldReturn` toCardId edwin
              field Asset.AssetClues aid `shouldReturn` 9
            canonical <- Map.lookup (toCardId edwin) . (.gameCards) <$> getGame
            toCardCode <$> canonical `shouldBe` Just "87037b"
            canonical `shouldSatisfy` \case
              Just (PlayerCard _) -> True
              _ -> False
          selectCount Anywhere `shouldReturn` if era == FutureEra then 5 else 6
          selectCount (locationIs Locations.tindalosEpic) `shouldReturn` 1
          selectCount (LocationWithTitle "Miskatonic University") `shouldReturn` 1
          selectCount (StoryMatchAll []) `shouldReturn` 3
          let expected = case (era, machination) of
                (PastEra, "87035") -> 0
                (PastEra, _) -> 1
                _ -> 2
          abducted <- getScenarioMetaKeyDefault "epicMachinationsAbducted" [] :: TestAppT [CardId]
          length abducted `shouldBe` expected
          setAside <- scenarioField ScenarioSetAsideCards
          let ownScientists = case era of
                PastEra -> [Assets.thomasCorriganPast, Assets.maryZielinskiPast]
                PresentEra -> [Assets.thomasCorriganPresent, Assets.maryZielinskiPresent]
                FutureEra -> [Assets.thomasCorriganFuture, Assets.maryZielinskiFuture]
          for_ abducted $ \cid -> do
            let card = fromJustNote "each abducted identity is set aside" $ find ((== cid) . toCardId) setAside
            toCardCode card `shouldSatisfy` (`elem` map toCardCode ownScientists)

  it "holds setup completion until the common machination and plot are installed"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      game <- getGame
      gateMachinationsMessage game EndSetup `shouldBe` ScenarioSpecific "epicMachinations.waitSetup" Null
      gateMachinationsMessage game EndRound `shouldBe` EndRound
      run EndSetup
      getScenarioMetaKeyDefault "epicMachinationsStartPending" False `shouldReturn` True

  for_ [PresentEra, FutureEra] $ \era ->
    it ("resumes deferred shared setup deliveries through the native loop for " <> show era)
      . scenarioTest "87001" $ \self -> do
        initializeEpic era self
        overTest $ inSetupL .~ True
        run Setup
        chooseOnlyOption "start this era at Tindalos"
        chooseOnlyOption "flip this era's Noble Legacy"
        run EndSetup
        waiting <- getGame
        waiting.gameInSetup `shouldBe` True
        getScenarioMetaKeyDefault "epicMachinationsStartPending" False `shouldReturn` True
        let envelope identifier code = ScenarioSpecific "epicMachinations.delivery" $ toJSON $
              MachinationsEnvelope (DeliveryId identifier) (InstallSharedStory code)
            deferred = [envelope "native-setup:machination" "87035", envelope "native-setup:plot" "87039"]
            resumed = fromJustNote "queued shared stories resume at the native setup checkpoint" $
              resumeSharedSetupQueue waiting deferred []
            unrelated = waiting {gameQuestion = Map.map
              (const $ PlayerWindowChooseOne [Label "Unrelated player decision" [Noop]]) waiting.gameQuestion}
        resumeSharedSetupQueue unrelated deferred [] `shouldBe` Nothing
        resumeSharedSetupQueue (waiting {gameInSetup = False}) deferred [] `shouldBe` Nothing
        resumeSharedSetupQueue waiting [Noop] [] `shouldBe` Nothing
        resumeSharedSetupQueue waiting [] deferred `shouldBe` Just deferred
        resumed `shouldBe` deferred
        -- This executes Game.runMessages with the two persisted envelopes.
        -- The second physical installation must unblock its native EndSetup.
        runAll resumed
        getScenarioMetaKeyDefault "epicMachinationsInstalledStories" ([] :: [CardCode])
          `shouldReturn` ["87039", "87035"]
        getScenarioMetaKeyDefault "epicMachinationsStartPending" True `shouldReturn` False
        completed <- getGame
        completed.gameInSetup `shouldBe` False
        selectCount (StoryMatchAll []) `shouldReturn` 3
        selectCount (StoryIs "87035") `shouldReturn` 1
        selectCount (StoryIs "87039") `shouldReturn` 1
        -- A replay retains each physical story and its identity; the saved
        -- envelope receipts prevent a second lookup or installation.
        runAll deferred
        selectCount (StoryMatchAll []) `shouldReturn` 3
        replayed <- getGame
        toJSON replayed.gameEntities.entitiesStories `shouldBe` toJSON completed.gameEntities.entitiesStories
        getScenarioMetaKeyDefault "epicMachinationsInstalledStories" ([] :: [CardCode])
          `shouldReturn` ["87039", "87035"]

  it "expires immediately on agenda 2B without requiring an agenda confirmation"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      run Setup
      chooseOnlyOption "start this era at Tindalos"
      chooseOnlyOption "flip this era's Noble Legacy"
      run $ ScenarioSpecific "epicMachinations.timeExpired" Null
      pending <- getScenarioMetaKeyDefault "epicMachinationsOutbox" [] :: TestAppT [MachinationsRequest]
      map machinationsRequestOperation pending `shouldSatisfy` elem FailTimeline
      agenda <- selectJust $ AgendaWithId $ AgendaId "87003"
      Agenda.agendaSide <$> field AgendaSequence agenda `shouldReturn` Agenda.B

  for_ [2, 3, 4] $ \result ->
    it ("preserves global resolution " <> show result <> " through the native last-investigator defeat on expiry")
      . scenarioTest "87001" $ \self -> do
        initializeEpic PresentEra self
        run Setup
        chooseOnlyOption "start this era at Tindalos"
        chooseOnlyOption "flip this era's Noble Legacy"
        receive "native-ending:machination" $ InstallSharedStory "87035"
        receive "native-ending:plot" $ InstallSharedStory "87039"
        run EndSetup
        overTest $ phaseL .~ InvestigationPhase
        run $ ScenarioSpecific "epicMachinations.timeExpired" Null
        agenda <- selectJust $ AgendaWithId $ AgendaId "87003"
        Agenda.agendaSide <$> field AgendaSequence agenda `shouldReturn` Agenda.B
        replica <- getMachinationsReplica
        run $ ScenarioSpecific "epicMachinations.replica" $ toJSON $ replica {globalResolution = Just result}
        receive "native-ending:resolution" $ ResolveTimeline result True
        -- Real InvestigatorEliminated clears the old queued resolution and
        -- invokes NoResolution. The authoritative result must still produce
        -- its printed native read before any new phase or player window.
        scenarioField ScenarioInResolution `shouldReturn` True
        field Investigator.InvestigatorDefeated self.id `shouldReturn` True
        field Investigator.InvestigatorMentalTrauma self.id `shouldReturn` 1
        reading <- getGame
        tshow (toJSON reading.gameQuestion) `shouldSatisfy`
          Text.isInfixOf ("resolution" <> tshow result <> ".title")
        reading.gameGameState `shouldBe` IsActive
        -- Replaying the same receipt leaves the preserved native read and
        -- trauma intact, before continuing its real saved ending tail.
        runAll
          [ ScenarioSpecific "epicMachinations.delivery" $ toJSON $
              MachinationsEnvelope (DeliveryId "native-ending:resolution") (ResolveTimeline result True)
          , AskMap reading.gameQuestion
          ]
        replayed <- getGame
        replayed.gameQuestion `shouldBe` reading.gameQuestion
        field Investigator.InvestigatorMentalTrauma self.id `shouldReturn` 1
        chooseFirstOption "read the printed global resolution"
        when (result `elem` [2, 4]) do
          -- This Present fixture has the printed Ezra Graves in play. The
          -- native R2/R4 ending offers his optional campaign reward next.
          reward <- getGame
          Map.elems reward.gameQuestion `shouldSatisfy` \case
            [QuestionLabel _ (Just code) (ChooseOne choices)] ->
              code == toCardCode Assets.ezraGraves && Label "$label.skip" [] `elem` choices
            _ -> False
          chooseOptionMatching "decline the printed Ezra Graves campaign reward" \case
            Label "$label.skip" [] -> True
            _ -> False
        (gameGameState <$> getGame) `shouldReturn` IsOver

  it "requests the shared failure when no authoritative global resolution exists"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      run $ ScenarioResolution NoResolution
      pending <- getScenarioMetaKeyDefault "epicMachinationsOutbox" [] :: TestAppT [MachinationsRequest]
      map machinationsRequestOperation pending `shouldSatisfy` elem FailTimeline
      globalResolution <$> getMachinationsReplica `shouldReturn` Nothing

  it "routes historical announcements without changing an independent round end"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PastEra self
      game <- getGame
      gateMachinationsMessage game (Remember ThomasAndMaryHaveMet)
        `shouldBe` ScenarioSpecific "epicMachinations.announce" (toJSON ThomasAndMaryHaveMet)
      gateMachinationsMessage game EndRoundWindow `shouldBe` EndRoundWindow
      run $ Remember ThomasAndMaryHaveMet
      pending <- getScenarioMetaKeyDefault "epicMachinationsOutbox" [] :: TestAppT [MachinationsRequest]
      map machinationsRequestOperation pending `shouldBe` [Announce ThomasAndMaryHaveMet]

  it "treats atomic clue envelopes as receipts without applying a second debit or credit"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PresentEra self
      run Setup
      chooseOnlyOption "start this era at Tindalos"
      chooseOnlyOption "flip this era's Noble Legacy"
      withProp @"clues" 3 self
      lid <- selectJust $ locationIs Locations.tindalosEpic
      receive "test:spend" $ SpendInvestigatorClue self.id
      receive "test:pool" $ ChangeTindalosClues 1
      receive "test:give" $ GiveInvestigatorClue self.id
      field InvestigatorClues self.id `shouldReturn` 3
      field LocationClues lid `shouldReturn` 0

  it "retains replica, receipts and outbox when a native helper updates scenario metadata"
    . scenarioTest "87001" $ \self -> do
      initializeEpic FutureEra self
      run $ SetScenarioMeta $ Aeson.object ["nikolaTeslaUsedOptions" Aeson..= (["repair"] :: [Text])]
      replica <- getScenarioMetaKeyDefault "epicMachinationsReplica" Null
      maybeResult @MachinationsReplica replica `shouldSatisfy` isJust
      getScenarioMetaKeyDefault "nikolaTeslaUsedOptions" ([] :: [Text]) `shouldReturn` ["repair"]

  it "saves and reloads the actual Epic replica and abducted card identities"
    . scenarioTest "87001" $ \self -> do
      initializeEpic FutureEra self
      run Setup
      chooseOnlyOption "start this era at Tindalos"
      chooseOnlyOption "flip this era's Noble Legacy"
      receive "test:machination" $ InstallSharedStory "87034"
      meta <- scenarioField ScenarioMeta
      Aeson.eitherDecode (Aeson.encode meta) `shouldBe` Right meta
      game <- getGame
      let restored = Aeson.eitherDecode (Aeson.encode game) :: Either String Game
      either (expectationFailure . ("native game reload: " <>))
        (\saved -> toJSON saved `shouldBe` toJSON game) restored
      getScenarioMetaKeyDefault "epicMachinationsInstalledStories" ([] :: [CardCode]) `shouldReturn` ["87034"]

initializeEpic :: Era -> Investigator -> TestAppT ()
initializeEpic era self = do
  -- A deck-loaded native game already has canonical cards. The generic
  -- scenario fixture starts empty, which makes Game.putGame drop CardGen
  -- cache writes during Setup; seed the actual investigator definition.
  void $ genPlayerCard $ toCardDef $ toAttrs self
  let rosters = Map.fromList [(group, Set.singleton self.id) | group <- allEras]
      state = either (error . show) id $ initialMachinations rosters
      replica = either (error . show) id $ machinationsReplicaFor era state
      change = overAttrs $ setMetaKey "epicMultiplayer" True . setMetaKey "epicMachinationsReplica" replica
  overTest $ modeL %~ \case
    That scenario -> That $ change scenario
    These campaign scenario -> These campaign $ change scenario
    _ -> error "native Epic test requires a scenario"

receive :: Text -> MachinationsDelivery -> TestAppT ()
receive identifier delivery = run $ ScenarioSpecific "epicMachinations.delivery" $
  toJSON $ MachinationsEnvelope (DeliveryId identifier) delivery
