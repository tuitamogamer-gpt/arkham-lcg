module Arkham.Homebrew.ScenarioFixes.ActDoomReceiptSpec (spec) where

import Arkham.Act.CardDefs.NightOfTheZealot.TheGathering qualified as Acts
import Arkham.Act.Types (Field (ActTokens))
import Arkham.Classes.HasGame (getGame)
import Arkham.Matcher
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Timing qualified as Timing
import Arkham.Token qualified as Token
import Arkham.Window qualified as Window
import Control.Monad.State (put)
import TestImport.New

spec :: Spec
spec = describe "Act first-doom receipts describe actual token transitions" do
  for_ [0, 2] \existing ->
    it ("emits one receipt only for a zero-to-positive transition, with " <> show existing <> " prior doom")
      . gameTest $ \self -> do
        aid <- installAct
        when (existing > 0) $ run $ PlaceDoom GameSource (toTarget aid) existing
        receipts <- watchReceipt aid
        let source = toSource self
        run $ PlaceDoom source (toTarget aid) 3
        doom aid `shouldReturn` (existing + 3)
        receipts `refShouldBe` (if existing == 0 then [(source, 3, 3)] else [])
        assertFinished

  it "does not publish a first-doom receipt for a zero-counter placement" . gameTest $ \_ -> do
    aid <- installAct
    receipts <- watchReceipt aid
    run $ PlaceDoom GameSource (toTarget aid) 0
    doom aid `shouldReturn` 0
    receipts `refShouldBe` []
    assertFinished

installAct :: TestAppT ActId
installAct = do
  card <- genCard Acts.trapped
  run $ SetActDeckCards 1 [card]
  run SetActDeck
  selectJust $ ActWithStep 1

doom :: ActId -> TestAppT Int
doom = fieldMap ActTokens (Token.countTokens Token.Doom)

-- Read the native Game at the exact After window, rather than accepting a
-- queued receipt as evidence that the mutation has already happened.
watchReceipt :: ActId -> TestAppT (IORef [(Source, Int, Int)])
watchReceipt aid = do
  ref <- liftIO $ newIORef []
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      CheckWindows ws -> for_ ws \case
        Window.Window Timing.After (Window.PlacedDoomCounterOnTargetWithNoDoom source (ActTarget target) n) _ _
          | aid == target -> do
              actual <- runTestApp env $ doom aid
              modifyIORef' ref (<> [(source, n, actual)])
        _ -> pure ()
      _ -> pure ()}
  pure ref

assertFinished :: TestAppT ()
assertFinished = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
  gameWindowDepth <$> getGame `shouldReturn` 0
