module Arkham.Homebrew.EpicLabyrinth.Scenario (theLabyrinthsOfLunacy) where

import Arkham.Act.CardDefs.TheLabyrinthsOfLunacy qualified as Acts
import Arkham.Agenda.CardDefs.TheLabyrinthsOfLunacy qualified as Agendas
import Arkham.Agenda.Types (Field (AgendaDoom, AgendaDoomThreshold))
import Arkham.Asset.Cards qualified as Assets
import Arkham.Card
import Arkham.Deck qualified as Deck
import Arkham.EncounterSet qualified as Sets
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyHealth, EnemyDamage))
import Arkham.Helpers.Enemy
import Arkham.Helpers.Doom (getDoomCount)
import Arkham.Helpers.GameValue (getGameValue)
import Arkham.Helpers.Message.Discard.Lifted (chooseAndDiscardCards)
import Arkham.Helpers.Query
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.ReturnTypes
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared (StoryCommand (WriteVentNote))
import Arkham.Homebrew.EpicLabyrinth.Stories.Exchange
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id (InvestigatorId, LocationId, StoryId, getId)
import Arkham.Investigator.Types (Field (InvestigatorResources, InvestigatorHand))
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Matcher
import Arkham.Message.Lifted.Choose (chooseOneM, targets)
import Arkham.Message.Lifted.Log (record)
import Arkham.Message.Lifted.Story (resolveStory)
import Arkham.Placement
import Arkham.Projection
import Arkham.Resolution
import Arkham.Scenario.Import.Lifted
import Arkham.Scenario.Types (ScenarioAttrs (..))
import Arkham.Scenario.Scenarios.TheLabyrinthsOfLunacy qualified as Native
import Arkham.Scenarios.TheLabyrinthsOfLunacy.Meta qualified as NativeMeta
import Arkham.Scenarios.TheLabyrinthsOfLunacy.Helpers qualified as NativeHelpers
import Arkham.Scenarios.TheLabyrinthsOfLunacy.Key qualified as Log
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Stories
import Data.Map.Strict qualified as Map

newtype EpicLabyrinth = EpicLabyrinth ScenarioAttrs
  deriving anyclass (IsScenario, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theLabyrinthsOfLunacy :: Difficulty -> EpicLabyrinth
theLabyrinthsOfLunacy = sideStory_ EpicLabyrinth "70001" "The Labyrinths of Lunacy"

instance HasChaosTokenValue EpicLabyrinth where
  getChaosTokenValue iid face (EpicLabyrinth attrs) =
    getChaosTokenValue iid face $ overAttrs (const attrs) $ Native.theLabyrinthsOfLunacy attrs.difficulty

instance RunMessage EpicLabyrinth where
  runMessage message scenario@(EpicLabyrinth attrs)
    | not $ getMetaKeyDefault "epicMultiplayer" False attrs =
        EpicLabyrinth . toAttrs <$> runMessage message (overAttrs (const attrs) $ Native.theLabyrinthsOfLunacy attrs.difficulty)
    | otherwise = runQueueT $ case message of
        PreScenarioSetup -> do
          group <- getEpicGroup
          requireDifficulty attrs.difficulty
          let base = NativeMeta.initialMeta $ case group of
                GroupA -> NativeMeta.GroupA
                GroupB -> NativeMeta.GroupB
                GroupC -> NativeMeta.GroupC
          -- Existing common cards can read their group through the native Meta.
          -- The original replica/outbox keys survive this merge.
          pure $ EpicLabyrinth $ mergeBaseMeta (toJSON base) attrs
        Setup -> epicSetup attrs
        -- The normal Answer path drops this seat's text prompt while retaining
        -- other seats' questions. Raw messages would restore the obsolete ask.
        ScenarioSpecific "epicLabyrinth.note" value -> do
          case maybeResult @(StoryId, InvestigatorId, Text) value of
            Just (story, iid, note) | length note <= 4000 -> do
              vents <- select $ StoryIs "70035"
              when (story `elem` vents) $ push $ SendMessage (StoryTarget story) $
                ScenarioSpecific "epicLabyrinth.story" $ toJSON $ WriteVentNote iid note
            _ -> pure ()
          pure scenario
        ScenarioSpecific "epicLabyrinth.timeExpired" _ ->
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthTimeExpired" True attrs
        ScenarioSpecific "epicLabyrinth.ownerReturn" value -> do
          identifier <- OperationId <$> getId
          let request = OwnerReturnRequest identifier $ toResult @OwnerReturnIntent value
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthOwnerReturns"
            (getMetaKeyDefault "epicLabyrinthOwnerReturns" [] attrs <> [request]) attrs
        ScenarioSpecific "epicLabyrinth.advanceAtMythos" value -> do
          agenda <- selectJust UnflippedAgenda
          threshold <- maybe (pure 0) getGameValue =<< field AgendaDoomThreshold agenda
          doom <- getDoomCount
          placeDoomOnAgendaAndCheckAdvance $ max 0 (threshold - doom)
          push $ toResult @Message value
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthTimeExpired" False attrs
        ScenarioSpecific "epicLabyrinth.replica" value ->
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthReplica" (toResult @Replica value) attrs
        ScenarioSpecific "epicLabyrinth.request" value -> do
          let request = toResult @Request value
              outbox = getMetaKeyDefault "epicLabyrinthOutbox" [] attrs :: [Request]
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthOutbox" (outbox <> [request]) attrs
        ScenarioSpecific "epicLabyrinth.ackRequests" value -> do
          let ids = toResult @[OperationId] value
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthOutbox"
            (filter ((`notElem` ids) . requestId) $ getMetaKeyDefault "epicLabyrinthOutbox" [] attrs) attrs
        ScenarioSpecific kind value | kind `elem` ["epicLabyrinth.arrive", "epicLabyrinth.finish"] -> do
          let (key, continuation) = toResult @(BarrierKey, Message) value
              pending = getMetaKeyDefault "epicLabyrinthContinuations" mempty attrs :: Map BarrierKey Message
          publishLocalCounters
          emitOperation $ if kind == "epicLabyrinth.arrive" then Arrive key else FinishWindow key
          waitForGroups
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthContinuations" (Map.insert key continuation pending) attrs
        ScenarioSpecific "epicLabyrinth.wait" _ -> waitForGroups >> pure scenario
        message@(ScenarioSpecific "epicLabyrinth.exchange" _) -> do
          result <- handlePrivateExchangeMessage message
          pure $ EpicLabyrinth $ recordExchangeResult attrs result
        ScenarioSpecific "epicLabyrinth.delivery" value -> do
          let envelope = toResult @DeliveryEnvelope value
          if deliveryWasApplied envelope.envelopeId attrs.meta
            then pure scenario
            else do
              let next = attrs {scenarioMeta = markDeliveryApplied envelope.envelopeId attrs.meta}
              emitOperation $ AcknowledgeDelivery envelope.envelopeId
              handleDelivery next envelope.envelopeBody
        EndRound -> do
          updated <- liftRunMessage EndRound attrs
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthRound"
            (1 + getMetaKeyDefault "epicLabyrinthRound" 1 attrs :: Int) updated
        CheckWindows _ -> do
          updated <- toAttrs <$> liftRunMessage message
            (overAttrs (const attrs) $ Native.theLabyrinthsOfLunacy attrs.difficulty)
          doom <- maybe (pure 0) (field AgendaDoom) =<< selectOne UnflippedAgenda
          pure $ EpicLabyrinth $ if doom >= 5
            then setMetaKey "epicLabyrinthIsolated" ([] :: [LocationId]) updated else updated
        ScenarioSpecific "epicLabyrinth.gateIsolation" value -> do
          let lid = toResult @LocationId value
              isolated = getMetaKeyDefault "epicLabyrinthIsolated" [] attrs :: [LocationId]
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthIsolated" (nub $ lid : isolated) attrs
        ScenarioSpecific "epicLabyrinth.owner" value -> do
          let (cid, group) = toResult @(CardId, LabyrinthGroup) value
              owners = getMetaKeyDefault "epicLabyrinthOwners" mempty attrs :: Map CardId LabyrinthGroup
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthOwners" (Map.insert cid group owners) attrs
        ScenarioSpecific "epicLabyrinth.petSent" _ ->
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthPetSent" True attrs
        EndRoundWindow -> do
          when (getMetaKeyDefault "epicLabyrinthPendingPet" False attrs) do
            lead <- getLead
            halls <- select $ LocationWithTitle "Labyrinthine Halls"
            chooseOneM lead $ targets halls $ createSetAsideEnemy_ Enemies.eixodolonsPetEpicMultiplayer
          updated <- liftRunMessage EndRoundWindow attrs
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthPendingPet" False updated
        ScenarioSpecific "act2Setup" _ -> do
          group <- getEpicGroup
          when (group == GroupA) $ emitOperation . AssignJailor =<< sample (GroupA :| [GroupB, GroupC])
          shuffleSetAsideIntoDeck Deck.EncounterDeck (cardIs Enemies.facelessAbductor)
          shuffleEncounterDiscardBackIn
          placeRandomLocationGroupCards "labyrinthineHalls"
            [Locations.labyrinthineHallsFoulSmellingPath, Locations.labyrinthineHallsCorpseFilledPath, Locations.labyrinthineHallsOvergrownPath]
          case group of
            GroupA -> placeSetAsideLocation_ Locations.chamberOfDecay
            GroupB -> do
              placeSetAsideLocation_ Locations.chamberOfRot
              placeSetAsideLocation_ Locations.chamberOfPoison
            GroupC -> do
              placeSetAsideLocation_ Locations.chamberOfHunger
              createSetAsideEnemy_ Enemies.eixodolonsPetEpicMultiplayer Global
          push $ RemoveAllDoomFromPlay defaultRemoveDoomMatchers
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthStage" (2 :: Int) attrs
        ScenarioSpecific "act3Setup" _ -> do
          warehouse <- placeSetAsideLocation Locations.abandonedWarehouse
          reveal warehouse
          selectEach AnyEnemy disengageEnemyFromAll
          selectEach UneliminatedInvestigator $ \iid -> push $ PlaceInvestigator iid (AtLocation warehouse)
          createSetAsideEnemy_ Enemies.eixodolon warehouse
          push $ RemoveAllDoomFromPlay defaultRemoveDoomMatchers
          pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthIsolated" ([] :: [LocationId]) $
            setMetaKey "epicLabyrinthStage" (3 :: Int) attrs
        ScenarioResolution NoResolution -> do
          -- A native last-investigator elimination can clear the pending
          -- resolution. Retain its exact result and do not repeat its effects.
          push $ ScenarioResolution $ Resolution $
            getMetaKeyDefault "epicLabyrinthResolution" 1 attrs
          pure scenario
        ScenarioResolution (Resolution n) | n `elem` [1, 2, 3, 4] -> resolveEpic attrs n
        _ -> EpicLabyrinth . toAttrs <$> liftRunMessage message
          (overAttrs (const attrs) $ Native.theLabyrinthsOfLunacy attrs.difficulty)

resolveEpic :: ReverseQueue m => ScenarioAttrs -> Int -> m EpicLabyrinth
resolveEpic attrs result = NativeHelpers.scenarioI18n $ scope "resolutions" do
  replica <- getEpicReplica
  meta <- NativeHelpers.getMeta
  let started = getMetaKeyDefault "epicLabyrinthResolution" Nothing attrs :: Maybe Int
      completed = NativeMeta.completeCurrentGroup (result /= 1) meta
      updated = setMetaKey "epicLabyrinthResolution" result
        $ setMetaKey "playedGroups" completed.playedGroups
        $ setMetaKey "survivedGroups" completed.survivedGroups attrs
  when (isNothing started) do
    -- Local R1 arrives as soon as this group fails; other surviving groups
    -- are still playing. Successful global endings establish all outcomes.
    for_ (filter (\(group, _) -> result /= 1 || group == replica.replicaGroup)
      $ Map.toList replica.replicaGroups) $ \(group, state) -> do
      let survived = state.groupSurviving && not (result == 1 && group == replica.replicaGroup)
          outcome = if survived then Log.TheGroupEscapedTheLabyrinth else Log.TheGroupPerished
      record $ case group of
        GroupA -> Log.GroupA outcome
        GroupB -> Log.GroupB outcome
        GroupC -> Log.GroupC outcome
    when (result == 1) do
      emitOperation $ SetSurviving False
      selectEach UneliminatedInvestigator $ push . InvestigatorKilled (toSource attrs)
  -- The coordinator's survivor count already chose this printed resolution;
  -- single-mode mini-campaign inference must not replace R3 or R4 with R2.
  resolution $ "resolution" <> tshow result
  when (result == 1) $ push GameOver
  endOfScenario
  pure $ EpicLabyrinth updated

epicSetup :: ReverseQueue m => ScenarioAttrs -> m EpicLabyrinth
epicSetup attrs = runScenarioSetup EpicLabyrinth attrs do
  group <- getEpicGroup
  gather Sets.TheLabyrinthsOfLunacy
  gather Sets.LabyrinthsOfLunacyEpicMultiplayer
  setAgendaDeck [Agendas.awakeningEpicMultiplayer, Agendas.agonyAndDespairEpicMultiplayer, Agendas.theMastermind]
  lead <- getLead
  beginWithStoryAsset lead Assets.eixodolonsNote
  setAside [Assets.keyOfMysteries, Assets.mysteriousSyringe, Assets.rotDiagramEpicMultiplayer,
    Assets.hungerDiagramEpicMultiplayer, Assets.decayDiagramEpicMultiplayer, Enemies.eixodolon,
    Enemies.eixodolonsPetEpicMultiplayer, Enemies.theJailor, Enemies.facelessAbductor, Enemies.facelessAbductor]
  setAside [Stories.arcaneRunes, Stories.theRift, Stories.theVent, Stories.theDilemma, Stories.theGate, Stories.encryptedGlyphs]
  setAside [Locations.labyrinthineHallsFoulSmellingPath, Locations.labyrinthineHallsCorpseFilledPath,
    Locations.labyrinthineHallsOvergrownPath, Locations.abandonedWarehouse, Locations.chamberOfRot,
    Locations.chamberOfHunger, Locations.chamberOfDecay, Locations.chamberOfPoison]
  setLayout
    [ "chamberOfRot chamberOfDecay chamberOfHunger"
    , "labyrinthineHalls1 labyrinthineHalls2 labyrinthineHalls3"
    , "chamberOfSecrets chamberOfRain chamberOfSorrows"
    , "chamberOfNight chamberOfRegret chamberOfPoison"
    , ". abandonedWarehouse ."
    ]
  case group of
    GroupA -> do
      setActDeck [Acts.sealedInGroupA, Acts.distortionsInTimeGroupA, Acts.theEscapeEpicMultiplayer]
      setAside [Locations.chamberOfRain, Locations.chamberOfSorrowsEpicMultiplayer, Locations.chamberOfNightEpicMultiplayer, Locations.chamberOfRegret]
      secret <- sample $ Locations.chamberOfSecretsBloodyPrison :|
        [Locations.chamberOfSecretsMysteriousPrison, Locations.chamberOfSecretsEnshroudedPrison]
      emitOperation $ SetSecretChamber $ toCardCode secret
      startAt =<< place secret
      addChaosToken ElderThing
      addChaosToken ElderThing
    GroupB -> do
      setActDeck [Acts.wateryGraveGroupB, Acts.seepingDeathGroupB, Acts.theEscapeEpicMultiplayer]
      setAside $ secretChambers <> [Locations.chamberOfNightEpicMultiplayer, Locations.chamberOfRegret]
      rain <- place Locations.chamberOfRain
      sorrows <- place Locations.chamberOfSorrowsEpicMultiplayer
      reveal rain
      reveal sorrows
      investigators <- allInvestigators
      for_ (nonEmpty investigators) $ \ids -> do
        (drowning, rest) <- sampleWithRest ids
        push $ PlaceInvestigator drowning $ AtLocation rain
        for_ rest $ \iid -> push $ PlaceInvestigator iid $ AtLocation sorrows
      addChaosToken Tablet
      addChaosToken Tablet
    GroupC -> do
      setActDeck [Acts.theLeversGroupCEpicMultiplayer, Acts.thePetGroupC, Acts.theEscapeEpicMultiplayer]
      setAside $ secretChambers <> [Locations.chamberOfRain, Locations.chamberOfSorrowsEpicMultiplayer]
      night <- place Locations.chamberOfNightEpicMultiplayer
      place_ Locations.chamberOfRegret
      startAt night
      addChaosToken Cultist
      addChaosToken Cultist
 where
  secretChambers = [Locations.chamberOfSecretsBloodyPrison, Locations.chamberOfSecretsMysteriousPrison, Locations.chamberOfSecretsEnshroudedPrison]

publishLocalCounters :: ReverseQueue m => m ()
publishLocalCounters = do
  doom <- field AgendaDoom =<< selectJust UnflippedAgenda
  emitOperation $ SetDoom doom
  boss <- selectOne (enemyIs Enemies.eixodolon)
  for_ boss $ \bossId -> do
    health <- fromMaybe 0 <$> field EnemyHealth bossId
    damage <- field EnemyDamage bossId
    emitOperation $ SetBoss health damage

handleDelivery :: ReverseQueue m => ScenarioAttrs -> Delivery -> m EpicLabyrinth
handleDelivery attrs body = do
  exchangeResult <- handlePrivateExchangeDelivery body
  handleDeliveryBody (recordExchangeResult attrs exchangeResult) body

recordExchangeResult :: ScenarioAttrs -> ExchangeResult -> ScenarioAttrs
recordExchangeResult attrs result =
  let pending = getMetaKeyDefault "epicLabyrinthExchangeParcels" mempty attrs :: Map ParcelId (InvestigatorId, ExchangeId)
   in case result of
     ExchangeParcelReserved pid iid exchange -> setMetaKey "epicLabyrinthExchangeParcels" (Map.insert pid (iid, exchange) pending) attrs
     ExchangeParcelReleased pid -> setMetaKey "epicLabyrinthExchangeParcels" (Map.delete pid pending) attrs
     _ -> attrs

handleDeliveryBody :: ReverseQueue m => ScenarioAttrs -> Delivery -> m EpicLabyrinth
handleDeliveryBody attrs = \case
  OpenBarrier key generation -> do
    let barriers = getMetaKeyDefault "epicLabyrinthBarriers" mempty attrs :: Map BarrierKey Barrier
        entry = (Map.findWithDefault emptyBarrier key barriers) {barrierOpened = True, barrierGeneration = generation}
        updated = setMetaKey "epicLabyrinthBarriers" (Map.insert key entry barriers) attrs
    case key of
      RoundBarrier _ -> for_ (pendingContinuation key attrs) push
      StageBarrier _ -> emitOperation $ FinishWindow key
    pure $ EpicLabyrinth updated
  ReleaseBarrier key generation -> do
    let barriers = getMetaKeyDefault "epicLabyrinthBarriers" mempty attrs :: Map BarrierKey Barrier
        entry = (Map.findWithDefault emptyBarrier key barriers) {barrierOpened = True, barrierReleased = True, barrierGeneration = generation}
        updated = setMetaKey "epicLabyrinthBarriers" (Map.insert key entry barriers) attrs
    for_ (pendingContinuation key attrs) push
    pure $ EpicLabyrinth updated
  DrawSharedStory code -> do
    let def = fromJustNote "the event only selects printed Labyrinth stories" $ lookupCardDef code
    card <- getSetAsideCard def
    lead <- getLead
    resolveStory lead card
    pure $ EpicLabyrinth attrs {scenarioSetAsideCards = filter ((/= toCardId card) . toCardId) attrs.scenarioSetAsideCards}
  ShuffleJailor -> shuffleSetAsideIntoDeck Deck.EncounterDeck (cardIs Enemies.theJailor) >> pure (EpicLabyrinth attrs)
  SpawnPetAtRoundEnd -> pure $ EpicLabyrinth $ setMetaKey "epicLabyrinthPendingPet" True attrs
  ChooseDiagramRecipient code -> do
    lead <- getLead
    investigators <- select UneliminatedInvestigator
    let def = fromJustNote "the event only sends printed diagrams" $ lookupCardDef code
    card <- getSetAsideCard def
    chooseOneM lead $ targets investigators (`takeControlOfSetAsideAsset` card)
    pure $ EpicLabyrinth attrs
  ReceiveDiagram code -> do
    lead <- getLead
    let def = fromJustNote "the event only sends printed diagrams" $ lookupCardDef code
    card <- getSetAsideCard def
    takeControlOfSetAsideAsset lead card
    pure $ EpicLabyrinth attrs
  ApplyDilemmaPenalty iid keep -> do
    resources <- field InvestigatorResources iid
    loseResources iid attrs $ max 0 (resources - keep)
    hand <- field InvestigatorHand iid
    chooseAndDiscardCards iid attrs $ max 0 (length hand - keep)
    pure $ EpicLabyrinth attrs
  ChangeBossDamage amount -> do
    boss <- selectOne (enemyIs Enemies.eixodolon)
    for_ boss $ \bossId ->
      if amount > 0 then placeTokens attrs bossId #damage amount else removeTokens attrs bossId #damage (-amount)
    pure $ EpicLabyrinth attrs
  ResolveTogether result -> push (ScenarioResolution $ Resolution result) >> pure (EpicLabyrinth attrs)
  ReceiveParcel parcel -> do
    emitOperation $ AcknowledgeParcel parcel.parcelId
    pure $ EpicLabyrinth attrs
  _ -> pure $ EpicLabyrinth attrs

pendingContinuation :: BarrierKey -> ScenarioAttrs -> Maybe Message
pendingContinuation key attrs = Map.lookup key $ getMetaKeyDefault "epicLabyrinthContinuations" mempty attrs

waitForGroups :: ReverseQueue m => m ()
waitForGroups = do
  lead <- getLead
  chooseOne lead [Label "Waiting for the other Labyrinth groups — check progress" [ScenarioSpecific "epicLabyrinth.wait" Null]]

requireDifficulty :: Monad m => Difficulty -> m ()
requireDifficulty difficulty = unless (difficulty `elem` [Standard, Hard]) $ error "Epic Labyrinth supports Standard and Hard"

mergeBaseMeta :: Value -> ScenarioAttrs -> ScenarioAttrs
mergeBaseMeta (Object base) attrs = case attrs.meta of
  Object existing -> attrs {scenarioMeta = Object $ existing <> base}
  _ -> attrs {scenarioMeta = Object base}
mergeBaseMeta _ attrs = attrs
