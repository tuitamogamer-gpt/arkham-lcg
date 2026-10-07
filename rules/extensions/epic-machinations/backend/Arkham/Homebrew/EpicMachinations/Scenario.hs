module Arkham.Homebrew.EpicMachinations.Scenario (machinationsThroughTime) where

import Arkham.Act.CardDefs.MachinationsThroughTime qualified as Acts
import Arkham.Agenda.CardDefs.MachinationsThroughTime qualified as Agendas
import Arkham.Agenda.Sequence qualified as Agenda
import Arkham.Asset.Cards qualified as Assets
import Arkham.Asset.Types (Field (AssetCard))
import Arkham.Card
import Arkham.EncounterSet qualified as Sets
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Enemies
import Arkham.Enemy.CardDefs.MachinationsThroughTimeEpicMultiplayer qualified as EpicEnemies
import Arkham.GameT (GameT)
import Arkham.Helpers.GameValue (perPlayer)
import Arkham.Helpers.Query
import Arkham.Helpers.Window (wouldDo)
import Arkham.Homebrew.EpicLabyrinth.Helpers (deliveryWasApplied, markDeliveryApplied)
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Types (OperationId (..))
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as EpicLocations
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Id (AssetId, StoryId (..), getId)
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Location.CardDefs.MachinationsThroughTime qualified as Locations
import Arkham.Location.Types (Field (LocationClues, LocationHorror))
import Arkham.Matcher hiding (AssetCard, InvestigatorDefeated, assetAt)
import Arkham.Message.Lifted.Choose
import Arkham.Message.Story qualified as StoryMessage
import Arkham.Placement
import Arkham.Projection
import Arkham.Queue (QueueT)
import Arkham.Resolution
import Arkham.Scenario.Import.Lifted
import Arkham.Scenario.Types (ScenarioAttrs (..))
import Arkham.Scenario.Scenarios.MachinationsThroughTime qualified as Native
import Arkham.ScenarioLogKey (ScenarioLogKey (CorriganIndustriesHasBeenFounded))
import Arkham.Story.CardDefs.MachinationsThroughTime qualified as Stories
import Arkham.Trait (Trait (Past, Present, Future, Scientist))
import Arkham.Window qualified as Window
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Map.Strict qualified as Map
import Data.Set qualified as Set

newtype EpicMachinations = EpicMachinations ScenarioAttrs
  deriving anyclass (IsScenario, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

machinationsThroughTime :: Difficulty -> EpicMachinations
machinationsThroughTime difficulty = EpicMachinations $ toAttrs $ Native.machinationsThroughTime difficulty

nativeScenario attrs = overAttrs (const attrs) $ Native.machinationsThroughTime attrs.difficulty

instance HasChaosTokenValue EpicMachinations where
  getChaosTokenValue iid face (EpicMachinations attrs) = getChaosTokenValue iid face $ nativeScenario attrs

instance RunMessage EpicMachinations where
  runMessage message scenario@(EpicMachinations attrs)
    | not $ getMetaKeyDefault "epicMultiplayer" False attrs = EpicMachinations . toAttrs <$> runMessage message (nativeScenario attrs)
    | otherwise = runQueueT $ case message of
        PreScenarioSetup -> do
          updated <- toAttrs <$> liftRunMessage message (nativeScenario attrs)
          pure $ EpicMachinations $ setMetaKey "nikolaTeslaUsedOptions" ([] :: [Text]) updated
        Setup -> setupEra attrs
        SetScenarioMeta (Object incoming) ->
          -- Tesla's existing native helper updates one metadata field. Retain
          -- the authoritative replica, receipts and pending requests alongside it.
          pure $ EpicMachinations attrs {scenarioMeta = Object $ KeyMap.union incoming $ case attrs.meta of Object old -> old; _ -> mempty}
        ScenarioSpecific "epicMachinations.replica" value ->
          pure $ EpicMachinations $ setMetaKey "epicMachinationsReplica" (toResult @MachinationsReplica value) attrs
        ScenarioSpecific "epicMachinations.request" value -> do
          let request = toResult @MachinationsRequest value
          pure $ EpicMachinations $ setMetaKey "epicMachinationsOutbox"
            (getMetaKeyDefault "epicMachinationsOutbox" [] attrs <> [request]) attrs
        ScenarioSpecific "epicLabyrinth.ownerReturn" value -> do
          identifier <- OperationId <$> getId
          let request = OwnerReturnRequest identifier $ toResult @OwnerReturnIntent value
          pure $ EpicMachinations $ setMetaKey "epicLabyrinthOwnerReturns"
            (getMetaKeyDefault "epicLabyrinthOwnerReturns" [] attrs <> [request]) attrs
        ScenarioSpecific "epicMachinations.ackRequests" value -> do
          let identifiers = toResult @[OperationId] value
              pending = getMetaKeyDefault "epicMachinationsOutbox" [] attrs :: [MachinationsRequest]
          pure $ EpicMachinations $ setMetaKey "epicMachinationsOutbox"
            (filter ((`notElem` identifiers) . machinationsRequestId) pending) attrs
        ScenarioSpecific "epicMachinations.announce" value -> do
          emitMachinations $ Announce $ toResult value
          pure scenario
        ScenarioSpecific "epicMachinations.progress" _ -> publishEraProgress >> pure scenario
        ScenarioSpecific "epicMachinations.waitSetup" _ -> do
          waitForPast
          pure $ EpicMachinations $ setMetaKey "epicMachinationsStartPending" True attrs
        ScenarioSpecific "epicMachinations.wait" _ -> waitForPast >> pure scenario
        ScenarioSpecific "epicMachinations.failure" _ -> do
          publishEraProgress
          emitMachinations FailTimeline
          pure scenario
        ScenarioSpecific "machinationsThroughTime.abduct" value
          | Just aid <- maybeResult @AssetId value -> do
            edwin <- selectAny $ AssetWithId aid <> assetIs Assets.edwinBennetEsteemedColleague
            if edwin then do
              wouldDo message
                (Window.ScenarioEvent "edwinWouldBeAbducted" Nothing value)
                (Window.ScenarioEvent "abducted" Nothing value)
              pure scenario
            else EpicMachinations . toAttrs <$> liftRunMessage message (nativeScenario attrs)
        DoBatch _ (ScenarioSpecific "machinationsThroughTime.abduct" value)
          | Just aid <- maybeResult @AssetId value -> do
            card <- field AssetCard aid
            updated <- toAttrs <$> liftRunMessage message (nativeScenario attrs)
            let abducted = nub $ toCardId card : getMetaKeyDefault "epicMachinationsAbducted" [] attrs
            push $ ScenarioSpecific "epicMachinations.abducted" $ toJSON abducted
            pure $ EpicMachinations $ setMetaKey "epicMachinationsAbducted" abducted updated
        ScenarioSpecific "epicMachinations.rescued" value -> do
          let cid = toResult @CardId value
              abducted = filter (/= cid) $ getMetaKeyDefault "epicMachinationsAbducted" [] attrs
          push $ ScenarioSpecific "epicMachinations.abducted" $ toJSON abducted
          pure $ EpicMachinations $ setMetaKey "epicMachinationsAbducted" abducted attrs
        ScenarioSpecific "epicMachinations.timeExpired" _ -> do
          -- The external timer ends the current decision immediately. Bypass
          -- the ordinary advance windows and its side-B confirmation prompt.
          push $ Do $ AdvanceToAgenda 1 Agendas.timeMarchesOn Agenda.A $ toSource attrs
          doStep 42 message
          pure scenario
        DoStep 42 (ScenarioSpecific "epicMachinations.timeExpired" _) -> do
          push $ ScenarioSpecific "epicMachinations.forceAgendaFailure" Null
          pure scenario
        ResolveChaosToken _ Cultist iid -> do
          atTindalos <- selectAny $ InvestigatorWithId iid <> InvestigatorAt (locationIs EpicLocations.tindalosEpic)
          when atTindalos failSkillTest
          pure scenario
        ScenarioResolution NoResolution -> do
          -- Defeating the last local investigator invokes the native
          -- no-remaining-investigators handler, which clears the queued
          -- resolution. Restore the already chosen global result rather than
          -- starting another failure while the empty local phase continues.
          replica <- getMachinationsReplica
          case replica.globalResolution of
            Just result -> push $ ScenarioResolution $ Resolution result
            Nothing -> do
              publishEraProgress
              emitMachinations FailTimeline
          pure scenario
        ScenarioSpecific "epicMachinations.delivery" value -> do
          let envelope = toResult @MachinationsEnvelope value
          if deliveryWasApplied envelope.machinationsDeliveryId attrs.meta then pure scenario else do
            emitMachinations $ AcknowledgeMachinationsDelivery envelope.machinationsDeliveryId
            applyDelivery attrs {scenarioMeta = markDeliveryApplied envelope.machinationsDeliveryId attrs.meta}
              envelope.machinationsDeliveryBody
        _ -> EpicMachinations . toAttrs <$> liftRunMessage message (nativeScenario attrs)

setupEra :: ReverseQueue m => ScenarioAttrs -> m EpicMachinations
setupEra attrs = do
  era <- getEra
  runScenarioSetup EpicMachinations attrs {scenarioLocationLayout = eraLayout era} $ setupEraCards era attrs

setupEraCards :: ReverseQueue m => Era -> ScenarioAttrs -> ScenarioBuilderT m ()
setupEraCards era attrs = do
  gather Sets.MachinationsThroughTime
  gather Sets.MachinationsThroughTimeEpicMultiplayer
  removeEvery [Locations.tindalos]
  setAgendaDeck [Agendas.intoTheVoid, Agendas.timeMarchesOn]
  setActDeck [Acts.walkingThroughTime]
  tindalos <- place EpicLocations.tindalosEpic
  startAt tindalos
  setAside [Stories.aBitterRivalry, Stories.redeemAFormerColleague, Stories.uneasyAlliance,
    Stories.anomaliesInSpacetime, Stories.mobTroubles, Stories.unspeakableAbomination]
  let (locations, legacy, thomas, mary) = eraCards era
      otherEras = filter (/= era) allEras
  placed <- Map.fromList <$> for locations (\(label, definition) -> (label,) <$> placeLabeled label definition)
  let localLocation label = fromJustNote "era setup places its printed location" $ Map.lookup label placed
  removeEvery $ concatMap (map snd . eraLocations) otherEras
  removeEvery $ concatMap (\e -> let (_, l, t, m) = eraCards e in [l, t, m]) otherEras
  setAside [thomas, mary, EpicEnemies.edwinBennetEnviousRival]
  case era of
    PastEra -> do
      assetAt_ Assets.nikolaTesla $ localLocation "riverDocksPast"
      removeEvery [Assets.ezraGraves, Assets.dimensionalBeamMachine]
    PresentEra -> do
      assetAt_ Assets.ezraGraves $ localLocation "arkhamAdvertiserPresent"
      removeEvery [Assets.nikolaTesla, Assets.dimensionalBeamMachine]
    FutureEra -> do
      setAside [Locations.corriganIndustries, Assets.dimensionalBeamMachine]
      removeEvery [Assets.nikolaTesla, Assets.ezraGraves]
  story <- placeStoryCapture legacy
  replica <- getMachinationsReplica
  push $ ScenarioSpecific "epicMachinations.replica" $ toJSON replica
  lead <- getLead
  leadChooseOneM $ targeting story $ flipOver lead story
  setAside [Enemies.tyrthrha, Enemies.oldSadieSheldon, Enemies.sheldonGang, Enemies.sheldonGang, Enemies.sheldonGang]
  localCount <- perPlayer 1
  let extra = case attrs.difficulty of Easy -> -1; Standard -> 0; Hard -> 1; Expert -> 2
  placeDoomOnAgenda $ max 0 (localCount + extra)
  when (era == PastEra) do
    emitMachinations . SelectMachination . toCardCode =<< sample (Stories.aBitterRivalry :| [Stories.redeemAFormerColleague, Stories.uneasyAlliance])
    emitMachinations . SelectPlot . toCardCode =<< sample (Stories.anomaliesInSpacetime :| [Stories.mobTroubles, Stories.unspeakableAbomination])
  push $ ScenarioSpecific "epicMachinations.activate" Null

eraLayout = \case
  PastEra -> [". arkhamGazette .", "riverDocksPast . oMalleysWatchShop",
    ". miskatonicUniversityPast .", ". childhoodHome .", ". tindalos ."]
  PresentEra -> [". arkhamAdvertiserPresent .", "riverDocksPresent . tickTockClubPresent",
    ". miskatonicUniversityPresent .", ". yeOldeMagickShoppe .", ". tindalos ."]
  FutureEra -> [". arkhamAdvertiserFuture .", "riverDocksFuture . tickTockClubFuture",
    ". miskatonicUniversityFuture .", ". corriganIndustries .", ". tindalos ."]

eraCards era =
  let (legacy, thomas, mary) = case era of
        PastEra -> (Stories.aNobleLegacyPast, Assets.thomasCorriganPast, Assets.maryZielinskiPast)
        PresentEra -> (Stories.aNobleLegacyPresent, Assets.thomasCorriganPresent, Assets.maryZielinskiPresent)
        FutureEra -> (Stories.aNobleLegacyFuture, Assets.thomasCorriganFuture, Assets.maryZielinskiFuture)
  in (eraLocations era, legacy, thomas, mary)

eraLocations = \case
  PastEra -> [("arkhamGazette", Locations.arkhamGazette), ("oMalleysWatchShop", Locations.oMalleysWatchShop),
    ("riverDocksPast", Locations.riverDocksPast), ("miskatonicUniversityPast", Locations.miskatonicUniversityPast), ("childhoodHome", Locations.childhoodHome)]
  PresentEra -> [("arkhamAdvertiserPresent", Locations.arkhamAdvertiserPresent), ("tickTockClubPresent", Locations.tickTockClubPresent),
    ("riverDocksPresent", Locations.riverDocksPresent), ("miskatonicUniversityPresent", Locations.miskatonicUniversityPresent), ("yeOldeMagickShoppe", Locations.yeOldeMagickShoppe)]
  FutureEra -> [("arkhamAdvertiserFuture", Locations.arkhamAdvertiserFuture), ("tickTockClubFuture", Locations.tickTockClubFuture),
    ("riverDocksFuture", Locations.riverDocksFuture), ("miskatonicUniversityFuture", Locations.miskatonicUniversityFuture)]

applyDelivery :: ScenarioAttrs -> MachinationsDelivery -> QueueT Message GameT EpicMachinations
applyDelivery attrs = \case
  ReceiveAnnouncement key -> do
    updated <- liftRunMessage (Remember key) attrs
    era <- getEra
    when (key == CorriganIndustriesHasBeenFounded && era == FutureEra) do
      whenM (selectNone $ locationIs Locations.corriganIndustries) $
        placeSetAsideLocation_ Locations.corriganIndustries
    pure $ EpicMachinations updated
  InstallSharedStory code -> do
    installStory code
    era <- getEra
    let (_, _, thomas, mary) = eraCards era
        abductedDefs = case code of
          "87033" -> if era == PastEra then [thomas] else [thomas, mary]
          "87034" -> if era == PastEra then [mary] else [thomas, mary]
          "87035" -> if era == PastEra then [] else [thomas, mary]
          _ -> []
    abductedCards <- traverse getSetAsideCard abductedDefs
    let abducted = nub $ map toCardId abductedCards <> getMetaKeyDefault "epicMachinationsAbducted" [] attrs
    when (code `elem` ["87033", "87034", "87035"]) $ push $ ScenarioSpecific "epicMachinations.abducted" $ toJSON abducted
    let installed = nub $ code : getMetaKeyDefault "epicMachinationsInstalledStories" [] attrs
    when (length installed >= 2 && getMetaKeyDefault "epicMachinationsStartPending" False attrs) $ push EndSetup
    let removeCodes = code : if code `elem` ["87033", "87034", "87035"]
          then filter (/= code) ["87033", "87034", "87035"] <>
            [toCardCode EpicEnemies.edwinBennetEnviousRival | code == "87035" && era == PastEra]
          else filter (/= code) ["87038", "87039", "87042"] <> case code of
            "87038" -> map toCardCode [Enemies.tyrthrha, Enemies.oldSadieSheldon, Enemies.sheldonGang]
            "87039" -> [toCardCode Enemies.tyrthrha]
            "87042" -> map toCardCode [Enemies.oldSadieSheldon, Enemies.sheldonGang]
            _ -> []
        next = attrs {scenarioSetAsideCards = filter ((`notElem` removeCodes) . toCardCode) attrs.scenarioSetAsideCards}
    pure $ EpicMachinations $ setMetaKey "epicMachinationsAbducted" abducted $
      setMetaKey "epicMachinationsStartPending" (length installed < 2 && getMetaKeyDefault "epicMachinationsStartPending" False attrs) $
        setMetaKey "epicMachinationsInstalledStories" installed next
  FinishSharedStory code -> do
    lead <- getLead
    selectForMaybeM (StoryIs code) $ addToVictory lead
    pure $ EpicMachinations attrs
  -- These paired effects already changed both native token maps in the event
  -- adapter's atomic transaction. The delivery is a durable receipt, not a
  -- second debit or a second credit when a receiver resumes a pending choice.
  ChangeTindalosClues _ -> pure $ EpicMachinations attrs
  SpendInvestigatorClue _ -> pure $ EpicMachinations attrs
  GiveInvestigatorClue _ -> pure $ EpicMachinations attrs
  PlaceRemoteToken code token amount -> do
    selectForMaybeM (LocationIs code) $ \lid -> placeTokens attrs lid token amount
    pure $ EpicMachinations attrs
  RemoveAnomalyByTitle title -> do
    locations <- select $ LocationWithTitle title <> LocationWithAnyHorror
    lead <- getLead
    chooseOrRunOneM lead $ targets locations $ \lid -> removeTokens attrs lid #horror 1
    pure $ EpicMachinations attrs
  ResolveTimeline result defeated -> do
    when defeated $ selectEach UneliminatedInvestigator $ \iid -> do
      sufferTrauma iid 0 1
      push $ InvestigatorDefeated (toSource attrs) iid
    push $ ScenarioResolution $ Resolution result
    pure $ EpicMachinations attrs
  -- Native shared-enemy and atomic transport handlers apply these effects.
  SetTyrthrhaRemaining _ -> pure $ EpicMachinations attrs
  MoveActualEdwin _ _ -> pure $ EpicMachinations attrs

installStory :: ReverseQueue m => CardCode -> m ()
installStory code = do
  let definition = fromJustNote "printed Machinations story" $ lookupCardDef code
  card <- getSetAsideCard definition
  push $ StoryMessage $ StoryMessage.PlaceStory card Unplaced
  -- A newly created story missed the adapter's earlier broadcast. Seed its
  -- Epic ability criteria before flipping it or opening a player choice.
  replica <- getMachinationsReplica
  push $ ScenarioSpecific "epicMachinations.replica" $ toJSON replica
  era <- getEra
  lead <- getLead
  let sid = StoryId code
      (_, _, thomas, mary) = eraCards era
      at definition location = do
        original <- getSetAsideCard definition
        createAssetAt_ original . AtLocation =<< selectJust (locationIs location)
      flipStory = flipOver lead sid
  case code of
    "87033" -> when (era == PastEra) $ at mary Locations.arkhamGazette
    "87034" -> do
      when (era == PastEra) $ at thomas Locations.childhoodHome
      when (era == PresentEra) $ createSetAsideEnemy_ EpicEnemies.edwinBennetEnviousRival =<< selectJust (locationIs Locations.miskatonicUniversityPresent)
      flipStory
    "87035" -> do
      when (era == PastEra) do
        at thomas Locations.childhoodHome
        at mary Locations.oMalleysWatchShop
        original <- getSetAsideCard EpicEnemies.edwinBennetEnviousRival
        let edwinCard = lookupCard (toCardCode $ flipCard original) $ toCardId original
        -- The other face is a player asset. Resolve its native card wrapper
        -- and canonical entry while keeping the same physical CardId.
        replaceCard (toCardId original) edwinCard
        gazette <- selectJust $ locationIs Locations.arkhamGazette
        edwin <- createAssetAt edwinCard $ AtLocation gazette
        clues <- perPlayer 3
        placeClues ScenarioSource edwin $ max 0 (12 - clues)
      flipStory
    "87038" -> do
      anomalyCount <- perPlayer 1
      locations <- select $ LocationWithTitle "Miskatonic University"
      extras <- select $ oneOf [LocationWithTitle "Arkham Gazette", LocationWithTitle "Arkham Advertiser", LocationWithTitle "O'Malley's Watch Shop", LocationWithTitle "Tick-Tock Club"]
      for_ (nub $ locations <> extras) $ \lid -> placeTokens ScenarioSource lid #horror anomalyCount
      flipStory
    "87039" -> when (era == PresentEra) $ eachInvestigator $ \iid -> gainResources iid ScenarioSource 2
    "87042" -> pure ()
    _ -> error "Unknown shared Machinations story"

publishEraProgress :: ReverseQueue m => m ()
publishEraProgress = do
  era <- getEra
  let (_, _, thomas, mary) = eraCards era
      away = not_ $ locationIs EpicLocations.tindalosEpic
  escorted <- (&&) <$> selectAny (assetIs thomas <> AssetAt away) <*> selectAny (assetIs mary <> AssetAt away)
  investigators <- Set.fromList <$> select Anyone
  stories <- Set.fromList . map unStoryId <$> select (StoryMatchAll [])
  clues <- maybe (pure 0) (field LocationClues) =<< selectOne (locationIs EpicLocations.tindalosEpic)
  edwinAsset <- selectAny $ assetIs Assets.edwinBennetEsteemedColleague
  edwinEnemy <- selectAny $ enemyIs EpicEnemies.edwinBennetEnviousRival
  emitMachinations $ ReportProgress $ EraProgress investigators escorted stories clues edwinAsset edwinEnemy

waitForPast :: ReverseQueue m => m ()
waitForPast = do
  lead <- getLead
  chooseOne lead [Label "Waiting for the Past group's shared setup choices — check progress" [ScenarioSpecific "epicMachinations.wait" Null]]
