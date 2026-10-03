module Arkham.Homebrew.EpicMachinations.ScenarioSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types qualified as Asset
import Arkham.Agenda.Sequence qualified as Agenda
import Arkham.Agenda.Types (Field (AgendaSequence))
import Arkham.Card
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as Enemies
import Arkham.Game.Base (Game)
import Arkham.Homebrew.EpicLabyrinth.Types (DeliveryId (..))
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.EpicMachinations.Coordinator
import Arkham.Homebrew.EpicMachinations.Gate
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault, scenarioField)
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Location.Types (Field (LocationClues))
import Arkham.Matcher
import Arkham.Projection (field)
import Arkham.Scenario.Types (Field (ScenarioMeta, ScenarioSetAsideCards), setMetaKey)
import Arkham.ScenarioLogKey
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set
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

  it "routes historical announcements without changing an independent round end"
    . scenarioTest "87001" $ \self -> do
      initializeEpic PastEra self
      game <- getGame
      gateMachinationsMessage game (Remember ThomasAndMaryHaveMet)
        `shouldBe` ScenarioSpecific "epicMachinations.announce" (toJSON ThomasAndMaryHaveMet)
      gateMachinationsMessage game EndRoundWindow `shouldBe` EndRoundWindow

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
  void $ genPlayerCard $ fromJustNote "native investigator definition" $ lookupCardDef $ toCardCode self
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
