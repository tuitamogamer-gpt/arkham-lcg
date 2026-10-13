module Arkham.Homebrew.ScenarioFixes.DrownedCitySpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Campaign (lookupCampaign)
import Arkham.Campaign.Types qualified as Campaign
import Arkham.CampaignStep qualified as CS
import Arkham.Campaigns.TheDrownedCity.Key
import Arkham.Classes.HasGame (getGame)
import Arkham.Difficulty (Difficulty (..))
import Arkham.Helpers.Log (getHasRecord)
import Arkham.Question (Question (ContinueCampaign))
import Arkham.Queue (queueToRef)
import Data.Aeson qualified as Aeson
import TestImport.New

-- Printed campaign guide, p. 11: only the western expedition replaces one
-- Tablet with one Cultist. These tests run the real campaign entity and its
-- offered Read/recipient choices, then inspect the resulting campaign state.
-- The standalone scenario in gameTest is removed before entering the interlude.
spec :: Spec
spec = describe "The Drowned City: expedition chaos bag" do
  for_ [Easy, Standard, Hard, Expert] \difficulty -> do
    it ("replaces exactly one Tablet in the western " <> show difficulty <> " campaign")
      . gameTest $ \self -> do
        let before = initialBag difficulty
            expected = Cultist : filter (/= Tablet) before
        beginExpedition difficulty before
        chooseExpedition "west"
        acceptAlly self
        assertOutcome self True expected

    it ("preserves the complete eastern " <> show difficulty <> " campaign bag")
      . gameTest $ \self -> do
        let before = initialBag difficulty
        beginExpedition difficulty before
        chooseExpedition "east"
        acceptAlly self
        assertOutcome self False before

  it "preserves an additional Tablet, existing Cultists and every unrelated token"
    . gameTest $ \self -> do
      let before = [Tablet, Cultist, Tablet, ElderThing, Skull, PlusOne, MinusFour, AutoFail, ElderSign]
          expected = [Cultist, Cultist, Tablet, ElderThing, Skull, PlusOne, MinusFour, AutoFail, ElderSign]
      beginExpedition Standard before
      chooseExpedition "west"
      acceptAlly self
      assertOutcome self True expected

  for_ [("west", True), ("east", False)] \(direction, western) ->
    it ("resumes the saved " <> unpack direction <> " recipient choice and preserves its result")
      . gameTest $ \self -> do
        let before = initialBag Standard
            expected = if western then Cultist : filter (/= Tablet) before else before
        beginExpedition Standard before
        chooseExpedition direction
        -- The ally choice suspends the remaining native queue. Neither token
        -- changes nor the next campaign step may run ahead of that choice.
        attrs <- currentCampaign
        liftIO do
          Campaign.campaignChaosBag attrs `shouldBe` before
          Campaign.campaignStoryCards attrs `shouldBe` mempty
          Campaign.campaignStep attrs `shouldBe` CS.InterludeStep 2 Nothing
        roundTripPendingGame
        acceptAlly self
        assertOutcome self western expected
        completed <- currentCampaign
        roundTripPendingGame
        tick
        assertOutcome self western expected
        restored <- currentCampaign
        -- Physical story-card IDs, owner and the continuation also persist;
        -- reloading must not award a second ally or replace a second token.
        liftIO $ Aeson.toJSON restored `shouldBe` Aeson.toJSON completed

initialBag :: Difficulty -> [ChaosTokenFace]
initialBag = Campaign.campaignChaosBag . toAttrs . lookupCampaign "11"

currentCampaign :: TestAppT Campaign.CampaignAttrs
currentCampaign =
  toAttrs . fromJustNote "the real Drowned City campaign is attached" . modeCampaign . gameMode <$> getGame

beginExpedition :: Difficulty -> [ChaosTokenFace] -> TestAppT ()
beginExpedition difficulty bag = do
  let campaign = overAttrs
        (\attrs -> attrs
          { Campaign.campaignStep = CS.InterludeStep 2 Nothing
          , Campaign.campaignChaosBag = bag
          })
        (lookupCampaign "11" difficulty)
  overTest \game -> game {gameMode = This campaign}
  run $ CampaignStep $ CS.InterludeStep 2 Nothing

chooseExpedition :: Text -> TestAppT ()
chooseExpedition direction = do
  chooseOptionMatching "choose the printed expedition branch" \case
    Label label _ -> label == "$theDrownedCity.expeditionToRlyeh.label." <> direction
    _ -> False
  chooseOptionMatching "acknowledge the printed expedition instructions" \case
    Label "$continue" _ -> True
    _ -> False

acceptAlly :: Investigator -> TestAppT ()
acceptAlly self =
  chooseOptionMatching "choose the story ally's campaign bearer" \case
    PortraitLabel iid _ -> iid == toId self
    _ -> False

assertOutcome :: Investigator -> Bool -> [ChaosTokenFace] -> TestAppT ()
assertOutcome self western expected = do
  attrs <- currentCampaign
  let nextScenario = if western then "11517" else "11639"
      ally = if western then Assets.andyVanNortwick else Assets.rubyStandish
      storyCards = findWithDefault [] (toId self) (Campaign.campaignStoryCards attrs)
  liftIO do
    sort (Campaign.campaignChaosBag attrs) `shouldBe` sort expected
    Just (Campaign.campaignStep attrs) `shouldBe` CS.continue (CS.ScenarioStep nextScenario)
    map toCardCode storyCards `shouldBe` [toCardCode ally]
    concatMap (map toCardCode) (mapToList (Campaign.campaignStoryCards attrs) <&> snd)
      `shouldBe` [toCardCode ally]
  getHasRecord TheExpeditionHeadedWest `shouldReturn` western
  getHasRecord TheExpeditionHeadedEast `shouldReturn` not western
  pid <- getPlayer (toId self)
  (fmap stripQuestionWrappers . lookup pid . gameQuestion <$> getGame)
    `shouldReturn` Just ContinueCampaign

roundTripPendingGame :: TestAppT ()
roundTripPendingGame = do
  game <- getGame
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  case Aeson.eitherDecode (Aeson.encode (game, pending)) of
    Left err -> liftIO $ expectationFailure err
    Right (restored, restoredPending) -> do
      overTest (const restored)
      liftIO $ atomicWriteIORef (queueToRef $ messageQueueRef env) restoredPending
