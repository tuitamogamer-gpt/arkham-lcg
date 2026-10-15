module Arkham.Homebrew.ScenarioFixes.FrenchHillSpec (spec) where

import Arkham.Ability (Ability, abilityIndex)
import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.CardDefs.BrethrenOfAsh.Arkham qualified as Locations
import Arkham.Location.Types (revealedL)
import Arkham.Queue (queueToRef)
import Data.Aeson qualified as Aeson
import TestImport.New

-- French Hill's printed colon follows "Choose and discard 1 card from your
-- hand": the discard is an activation cost. Exercise native eligibility and
-- payment, rather than bypassing them with a fabricated UseThisAbility.
spec :: Spec
spec = describe "French Hill's printed discard cost" do
  it "does not offer its action with an empty hand" . gameTest $ \self -> do
    hill <- frenchHillFor self
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    withProp @"hand" [] self
    duringTurn self do
      frenchHillActions self hill `shouldReturn` []
      self.remainingActions `shouldReturn` 3
      shrivelling.charges `shouldReturn` 4

  it "does not treat a weakness as a payable hand discard" . gameTest $ \self -> do
    hill <- frenchHillFor self
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    weakness <- genMyCard self Assets.theNecronomiconDrakeTranslation
    withProp @"hand" [weakness] self
    duringTurn self do
      frenchHillActions self hill `shouldReturn` []
      self.hand `shouldReturn` [weakness]
      self.remainingActions `shouldReturn` 3
      shrivelling.charges `shouldReturn` 4

  it "requires a charge or secret asset controlled by the acting investigator" . gameTest $ \self -> do
    hill <- frenchHillFor self
    other <- addInvestigator Investigators.rolandBanks
    other `moveTo` hill
    void $ self `putAssetIntoPlay` Assets.flashlight
    shrivelling <- other `putAssetIntoPlay` Assets.shrivelling
    card <- genMyCard self Assets.knife
    withProp @"hand" [card] self
    duringTurn self do
      frenchHillActions self hill `shouldReturn` []
      self.hand `shouldReturn` [card]
      shrivelling.charges `shouldReturn` 4

  it "requires the investigator to be at French Hill" . gameTest $ \self -> do
    hill <- frenchHillFor self
    elsewhere <- testLocation
    self `moveTo` elsewhere
    void $ self `putAssetIntoPlay` Assets.shrivelling
    card <- genMyCard self Assets.knife
    withProp @"hand" [card] self
    duringTurn self do
      frenchHillActions self hill `shouldReturn` []

  it "pays one action and exactly one non-weakness card before adding a charge" . gameTest $ \self -> do
    hill <- frenchHillFor self
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    knife <- genMyCard self Assets.knife
    flashlight <- genMyCard self Assets.flashlight
    weakness <- genMyCard self Assets.theNecronomiconDrakeTranslation
    withProp @"hand" [knife, flashlight, weakness] self
    duringTurn self do
      [ability] <- frenchHillActions self hill
      self `useAbility` ability
      offeredTargets `shouldMatchListM` map toTarget [knife, flashlight]
      shrivelling.charges `shouldReturn` 4
      chooseTarget knife
      self.remainingActions `shouldReturn` 2
      self.hand `shouldMatchListM` [flashlight, weakness]
      asDefs self.discard `shouldReturn` [Assets.knife]
      -- The cost is already paid when the recipient is chosen. There must
      -- not be a second, effect-time discard, or a charge before this choice.
      offeredTargets `shouldReturn` [toTarget shrivelling]
      shrivelling.charges `shouldReturn` 4
      chooseTarget shrivelling
      shrivelling.charges `shouldReturn` 5
      self.hand `shouldMatchListM` [flashlight, weakness]
      asDefs self.discard `shouldReturn` [Assets.knife]
      self.remainingActions `shouldReturn` 2
      frenchHillActions self hill `shouldReturn` []

  it "adds a secret only to the selected eligible asset" . gameTest $ \self -> do
    hill <- frenchHillFor self
    scroll <- self `putAssetIntoPlay` Assets.scrollOfSecrets
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    card <- genMyCard self Assets.knife
    withProp @"hand" [card] self
    duringTurn self do
      [ability] <- frenchHillActions self hill
      self `useAbility` ability
      chooseTarget card
      offeredTargets `shouldMatchListM` map toTarget [scroll, shrivelling]
      chooseTarget scroll
      scroll.secrets `shouldReturn` 4
      shrivelling.charges `shouldReturn` 4
      self.hand `shouldReturn` []
      asDefs self.discard `shouldReturn` [Assets.knife]
      self.remainingActions `shouldReturn` 2

  it "allows each investigator to pay once in the same round" . gameTest $ \self -> do
    hill <- frenchHillFor self
    other <- addInvestigator Investigators.rolandBanks
    other `moveTo` hill
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    scroll <- other `putAssetIntoPlay` Assets.scrollOfSecrets
    selfKnife <- genMyCard self Assets.knife
    selfFlashlight <- genMyCard self Assets.flashlight
    otherKnife <- genMyCard other Assets.knife
    otherFlashlight <- genMyCard other Assets.flashlight
    withProp @"hand" [selfKnife, selfFlashlight] self
    withProp @"hand" [otherKnife, otherFlashlight] other
    duringTurn self do
      [ability] <- frenchHillActions self hill
      self `useAbility` ability
      chooseTarget selfKnife
      offeredTargets `shouldReturn` [toTarget shrivelling]
      chooseTarget shrivelling
      frenchHillActions self hill `shouldReturn` []
    duringTurn other do
      [ability] <- frenchHillActions other hill
      other `useAbility` ability
      chooseTarget otherKnife
      offeredTargets `shouldReturn` [toTarget scroll]
      chooseTarget scroll
      frenchHillActions other hill `shouldReturn` []
      other.remainingActions `shouldReturn` 2
      shrivelling.charges `shouldReturn` 5
      scroll.secrets `shouldReturn` 4

  it "restores pending payment and recipient choices without paying or rewarding twice" . gameTest $ \self -> do
    hill <- frenchHillFor self
    shrivelling <- self `putAssetIntoPlay` Assets.shrivelling
    knife <- genMyCard self Assets.knife
    flashlight <- genMyCard self Assets.flashlight
    withProp @"hand" [knife, flashlight] self
    duringTurn self do
      [ability] <- frenchHillActions self hill
      self `useAbility` ability
      roundTripPendingGame
      offeredTargets `shouldMatchListM` map toTarget [knife, flashlight]
      chooseTarget knife
      roundTripPendingGame
      self.remainingActions `shouldReturn` 2
      self.hand `shouldReturn` [flashlight]
      offeredTargets `shouldReturn` [toTarget shrivelling]
      shrivelling.charges `shouldReturn` 4
      chooseTarget shrivelling
      self.remainingActions `shouldReturn` 2
      self.hand `shouldReturn` [flashlight]
      asDefs self.discard `shouldReturn` [Assets.knife]
      shrivelling.charges `shouldReturn` 5
      frenchHillActions self hill `shouldReturn` []

frenchHillFor :: Investigator -> TestAppT Location
frenchHillFor self = do
  hill <- testLocationWithDef Locations.frenchHill (revealedL .~ True)
  self `moveTo` hill
  pure hill

frenchHillActions :: Investigator -> Location -> TestAppT [Ability]
frenchHillActions self hill = filter ((== 1) . abilityIndex) <$> self `getActionsFrom` hill

offeredTargets :: TestAppT [Target]
offeredTargets = do
  questionMap <- gameQuestion <$> getGame
  choices <- case map (stripQuestionWrappers . snd) (mapToList questionMap) of
    [ChooseOne xs] -> pure xs
    [ChooseN 1 xs] -> pure xs
    other -> do
      expectationFailure $ "expected one native payment or recipient choice, got: " <> show other
      pure []
  for choices \case
    TargetLabel target _ -> pure target
    other -> do
      expectationFailure $ "expected a physical card or asset target, got: " <> show other
      pure ScenarioTarget

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
