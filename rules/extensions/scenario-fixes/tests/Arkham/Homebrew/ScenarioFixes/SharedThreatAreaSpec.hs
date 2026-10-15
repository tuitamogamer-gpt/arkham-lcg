module Arkham.Homebrew.ScenarioFixes.SharedThreatAreaSpec (spec) where

import Arkham.Ability (Ability, abilityIndex)
import Arkham.Classes.HasGame (getGame)
import Arkham.Helpers.ChaosToken (getModifiedChaosTokenFace)
import Arkham.Helpers.Message qualified as Helpers
import Arkham.Helpers.Scenario (scenarioFieldMap)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Matcher
import Arkham.Placement (Placement (InThreatArea))
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Types (Field (ScenarioDiscard))
import Arkham.Treachery.CardDefs.TheDrownedCity.CosmicLegacy qualified as CosmicLegacy
import Arkham.Treachery.CardDefs.TheDrownedCity.Stowaways qualified as Stowaways
import Arkham.Treachery.Types (Field (TreacheryPlacement))
import Data.Aeson qualified as Aeson
import TestImport.New

-- Grimoire v1.1 p. 4, Activate Action: eligible scenario cards include "all
-- encounter cards in the threat area of any investigator at that location."
-- These fixtures create the actual printed treacheries in the host's threat
-- area, then use offered actions and native skill tests with real action costs.
spec :: Spec
spec = describe "Drowned City actions on another investigator's treachery" do
  for_ [("Infected!", Stowaways.infected, 2), ("Eye of the Deep", CosmicLegacy.eyeOfTheDeep, 1)]
    \(name, def, index) -> context name do
      it "lets its host pay an action and discard the physical treachery on success" . gameTest $ \host -> do
        here <- testLocation
        host `moveTo` here
        (tid, card) <- threatAreaCard host def
        withProp @"willpower" 5 host
        setChaosTokens [Zero]
        duringTurn host do
          [ability] <- printedAction host tid index
          host `useAbility` ability
          host.remainingActions `shouldReturn` 2
          startSkillTest
          applyResults
          assertDiscarded tid card
          host.damage `shouldReturn` 0

      it "lets a colocated helper pay and remove the host's treachery after saving" . gameTest $ \host -> do
        (helper, _) <- colocatedHelper host
        (tid, card) <- threatAreaCard host def
        withProp @"willpower" 5 helper
        setChaosTokens [Zero]
        duringTurn helper do
          [ability] <- printedAction helper tid index
          helper `useAbility` ability
          helper.remainingActions `shouldReturn` 2
          host.remainingActions `shouldReturn` 3
          field TreacheryPlacement tid `shouldReturn` InThreatArea host.id
          roundTripPendingGame
          startSkillTest
          roundTripPendingGame
          applyResults
          assertDiscarded tid card
          helper.remainingActions `shouldReturn` 2
          host.remainingActions `shouldReturn` 3
          helper.damage `shouldReturn` 0
          host.damage `shouldReturn` 0

      it "does not offer the action to an investigator at another location" . gameTest $ \host -> do
        (helper, _) <- colocatedHelper host
        elsewhere <- testLocation
        helper `moveTo` elsewhere
        (tid, _) <- threatAreaCard host def
        duringTurn helper do
          printedAction helper tid index `shouldReturn` []
          helper.remainingActions `shouldReturn` 3
          field TreacheryPlacement tid `shouldReturn` InThreatArea host.id

      it "preserves host access without sharing it through missing locations" . gameTest $ \host -> do
        helper <- addInvestigator Investigators.rolandBanks
        (tid, _) <- threatAreaCard host def
        host.location `shouldReturn` Nothing
        helper.location `shouldReturn` Nothing
        -- A card in your own threat area remains an eligible source (Grimoire
        -- 2.2.1). Shared access still requires an actual location: the native
        -- placement matcher deliberately handles these two cases separately.
        duringTurn host do
          map abilityIndex <$> printedAction host tid index `shouldReturn` [index]
        duringTurn helper $ printedAction helper tid index `shouldReturn` []
        here <- testLocation
        host `moveTo` here
        duringTurn helper do
          printedAction helper tid index `shouldReturn` []
          helper.remainingActions `shouldReturn` 3

  it "damages the acting helper, not the host, when Infected's paid test fails" . gameTest $ \host -> do
    (helper, _) <- colocatedHelper host
    (tid, _) <- threatAreaCard host Stowaways.infected
    withProp @"willpower" 0 helper
    setChaosTokens [Zero]
    duringTurn helper do
      [ability] <- printedAction helper tid 2
      helper `useAbility` ability
      startSkillTest
      applyResults
      -- Resolve the real investigator-only damage choice; do not fabricate
      -- damage messages or clear pending questions to force the final state.
      chooseOptionAcrossQuestions "assign Infected's failure damage to its acting helper" \case
        ComponentLabel (InvestigatorComponent iid DamageToken) _ -> iid == helper.id
        _ -> False
      helper.damage `shouldReturn` 1
      host.damage `shouldReturn` 0
      helper.remainingActions `shouldReturn` 2
      host.remainingActions `shouldReturn` 3
      field TreacheryPlacement tid `shouldReturn` InThreatArea host.id
      assertAny $ TreacheryWithId tid

  for_ [Cultist, Tablet] \face -> do
    it ("still changes its host's " <> show face <> " token into an elder thing") . gameTest $ \host -> do
      void $ colocatedHelper host
      (tid, card) <- threatAreaCard host CosmicLegacy.eyeOfTheDeep
      withProp @"willpower" 5 host
      setChaosTokens [face]
      duringTurn host do
        [ability] <- printedAction host tid 1
        host `useAbility` ability
        startSkillTest
        assertRevealedFace host face ElderThing
        applyResults
        assertDiscarded tid card
        host.remainingActions `shouldReturn` 2

    it ("does not change a helping investigator's " <> show face <> " token") . gameTest $ \host -> do
      (helper, _) <- colocatedHelper host
      (tid, card) <- threatAreaCard host CosmicLegacy.eyeOfTheDeep
      withProp @"willpower" 5 helper
      setChaosTokens [face]
      duringTurn helper do
        [ability] <- printedAction helper tid 1
        helper `useAbility` ability
        startSkillTest
        assertRevealedFace helper face face
        applyResults
        assertDiscarded tid card
        helper.remainingActions `shouldReturn` 2
        host.remainingActions `shouldReturn` 3

colocatedHelper :: Investigator -> TestAppT (Investigator, Location)
colocatedHelper host = do
  here <- testLocation
  host `moveTo` here
  helper <- addInvestigator Investigators.rolandBanks
  helper `moveTo` here
  pure (helper, here)

threatAreaCard :: Investigator -> CardDef -> TestAppT (TreacheryId, Card)
threatAreaCard host def = do
  card <- genCard def
  (tid, message) <- Helpers.createTreacheryAt card $ InThreatArea host.id
  run message
  field TreacheryPlacement tid `shouldReturn` InThreatArea host.id
  pure (tid, card)

printedAction :: Investigator -> TreacheryId -> Int -> TestAppT [Ability]
printedAction actor tid index = filter ((== index) . abilityIndex) <$> actor `getActionsFrom` tid

assertDiscarded :: TreacheryId -> Card -> TestAppT ()
assertDiscarded tid card = do
  assertNone $ TreacheryWithId tid
  scenarioFieldMap ScenarioDiscard (map toCardId) `shouldSatisfyM` elem (toCardId card)

assertRevealedFace :: Investigator -> ChaosTokenFace -> ChaosTokenFace -> TestAppT ()
assertRevealedFace actor printed effective = do
  [token] <- select $ ChaosTokenRevealedBy $ InvestigatorWithId actor.id
  chaosTokenFace token `shouldBe` printed
  getModifiedChaosTokenFace token `shouldReturn` [effective]

roundTripPendingGame :: TestAppT ()
roundTripPendingGame = do
  game <- getGame
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  case Aeson.eitherDecode (Aeson.encode (game, pending)) of
    Left err -> expectationFailure err
    Right (restored, restoredPending) -> do
      overTest (const restored)
      liftIO $ atomicWriteIORef (queueToRef $ messageQueueRef env) restoredPending
