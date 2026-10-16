module Arkham.Homebrew.ScenarioFixes.EncounterSearchSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Deck qualified as Deck
import Arkham.Enemy.CardDefs.NightOfTheZealot.Rats qualified as Enemies
import Arkham.Enemy.Types (Field (EnemyCard))
import Arkham.Helpers.Scenario (getEncounterDeck, getEncounterDiscard, scenarioField)
import Arkham.Matcher
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (..))
import Arkham.Scenario.Types qualified as Scenario
import Arkham.Treachery.CardDefs.BrethrenOfAsh.QueenOfAsh qualified as Invocation
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as Treacheries
import Control.Monad.State (put)
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import System.Random (mkStdGen)
import TestImport.New

-- Grimoire v1.1, Search (p.21): searching an entire deck always shuffles it
-- when the search finishes, including searches that find no eligible card.
-- These exercise the public search message and its actual acknowledgement;
-- a stable seed proves the physical deck was shuffled, not just its UI closed.
spec :: Spec
spec = describe "Encounter search completion" do
  it "shuffles exactly once after a saved no-match acknowledgement and preserves every card"
    . gameTest $ \self -> do
      prepare self
      cards <- encounterCards 8
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck cards
      run $ AddToEncounterDiscard discarded
      shuffles <- countExplicitShuffles
      seedShuffle
      run $ findAndDrawEncounterCard self.id $ cardIs Enemies.swarmOfRats
      getEncounterDeck `shouldReturn` Deck cards
      shuffles `refShouldBe` []
      roundTripPendingGame
      acknowledgeMiss
      assertShuffled cards
      shuffles `refShouldBe` [Deck.EncounterDeckByKey RegularEncounterDeck]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertFinished

  it "does not select or merge a matching discarded enemy when the search excludes discard"
    . gameTest $ \self -> do
      prepare self
      cards <- encounterCards 8
      discardedEnemy <- genEncounterCard Enemies.swarmOfRats
      run $ SetEncounterDeck $ Deck cards
      run $ AddToEncounterDiscard discardedEnemy
      shuffles <- countExplicitShuffles
      seedShuffle
      run $ findAndDrawEncounterCardFromEncounterDeck self.id $ cardIs Enemies.swarmOfRats
      acknowledgeMiss
      assertShuffled cards
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discardedEnemy]
      selectCount AnyEnemy `shouldReturn` 0
      shuffles `refShouldBe` [Deck.EncounterDeckByKey RegularEncounterDeck]
      assertFinished

  it "shuffles only the explicitly searched keyed deck and preserves both discard piles"
    . gameTest $ \self -> do
      prepare self
      spectral <- encounterCards 8
      regularEnemy <- genEncounterCard Enemies.swarmOfRats
      regularTail <- genEncounterCard Treacheries.cryptChill
      regularDiscard <- genEncounterCard Treacheries.obscuringFog
      spectralDiscard <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck [regularEnemy, regularTail]
      run $ AddToEncounterDiscard regularDiscard
      overTest $ modeL %~ fmap (overAttrs \attrs -> attrs
        {Scenario.scenarioEncounterDecks = Map.singleton SpectralEncounterDeck (Deck spectral, [spectralDiscard])})
      shuffles <- countExplicitShuffles
      seedShuffle
      run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard SpectralEncounterDeck
      roundTripPendingGame
      acknowledgeMiss
      decks <- scenarioField Scenario.ScenarioEncounterDecks
      let (Deck actual, discarded) = fromJustNote "spectral deck survives search" $ Map.lookup SpectralEncounterDeck decks
      actual `shouldMatchList` spectral
      actual `shouldNotBe` spectral
      discarded `shouldBe` [spectralDiscard]
      getEncounterDeck `shouldReturn` Deck [regularEnemy, regularTail]
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [regularDiscard]
      shuffles `refShouldBe` [Deck.EncounterDeckByKey SpectralEncounterDeck]
      selectCount AnyEnemy `shouldReturn` 0
      assertFinished

  for_ [0, 1] \deckSize ->
    it ("finishes a no-match search with " <> show deckSize <> " cards without refilling from discard")
      . gameTest $ \self -> do
        prepare self
        cards <- encounterCards deckSize
        discarded <- genEncounterCard Treacheries.obscuringFog
        run $ SetEncounterDeck $ Deck cards
        run $ AddToEncounterDiscard discarded
        shuffles <- countExplicitShuffles
        run $ findAndDrawEncounterCard self.id $ cardIs Enemies.swarmOfRats
        acknowledgeMiss
        getEncounterDeck `shouldReturn` Deck cards
        getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
        shuffles `refShouldBe` [Deck.EncounterDeckByKey RegularEncounterDeck]
        assertFinished

  it "keeps the existing successful deck search: draw the chosen physical enemy and shuffle the remainder"
    . gameTest $ \self -> do
      prepare self
      cards <- encounterCards 8
      enemy <- genEncounterCard Enemies.swarmOfRats
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck (enemy : cards)
      run $ AddToEncounterDiscard discarded
      shuffles <- countExplicitShuffles
      run $ findAndDrawEncounterCard self.id $ cardIs Enemies.swarmOfRats
      seedShuffle
      chooseTarget $ toCardId enemy
      assertShuffled cards
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertDrawn enemy
      -- The success path already shuffles inline; the no-match fix must not
      -- add a second explicit shuffle to this choice.
      shuffles `refShouldBe` []
      assertFinished

  it "keeps the existing successful discard search and conserves the deck and unselected discards"
    . gameTest $ \self -> do
      prepare self
      cards <- encounterCards 8
      enemy <- genEncounterCard Enemies.swarmOfRats
      discarded <- genEncounterCard Treacheries.obscuringFog
      run $ SetEncounterDeck $ Deck cards
      runAll $ map AddToEncounterDiscard [enemy, discarded]
      shuffles <- countExplicitShuffles
      run $ findAndDrawEncounterCard self.id $ cardIs Enemies.swarmOfRats
      roundTripPendingGame
      seedShuffle
      chooseTarget $ toCardId enemy
      assertShuffled cards
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [discarded]
      assertDrawn enemy
      shuffles `refShouldBe` []
      assertFinished

  it "finishes Blasphemous Invocation's real failed test and unsuccessful cultist search with one shuffle"
    . scenarioTest "12168" $ \self -> do
      prepare self
      withProp @"willpower" 2 self
      setChaosTokens [Zero]
      invocation <- genEncounterCard Invocation.blasphemousInvocation
      cards <- encounterCards 8
      run $ SetEncounterDeck $ Deck (invocation : cards)
      shuffles <- countExplicitShuffles
      run $ drawEncounterCard self.id GameSource
      startSkillTest
      applyResults
      seedShuffle
      roundTripPendingGame
      acknowledgeMiss
      assertShuffled cards
      getEncounterDiscard RegularEncounterDeck `shouldReturn` [invocation]
      selectCount AnyEnemy `shouldReturn` 0
      gameSkillTest <$> getGame `shouldReturn` Nothing
      shuffles `refShouldBe` [Deck.EncounterDeckByKey RegularEncounterDeck]
      assertFinished

prepare :: Investigator -> TestAppT ()
prepare self = do
  withDeck self [Assets.flashlight]
  location <- testLocation
  self `moveTo` location

encounterCards :: Int -> TestAppT [EncounterCard]
encounterCards n = replicateM n $ genEncounterCard Treacheries.cryptChill

seedShuffle :: TestAppT ()
seedShuffle = do
  env <- get
  liftIO $ writeIORef (gen env) (mkStdGen 5489)

acknowledgeMiss :: TestAppT ()
acknowledgeMiss = clickLabel "$label.noMatchesFound"

assertShuffled :: [EncounterCard] -> TestAppT ()
assertShuffled cards = do
  Deck actual <- getEncounterDeck
  actual `shouldMatchList` cards
  actual `shouldNotBe` cards

assertDrawn :: EncounterCard -> TestAppT ()
assertDrawn card = do
  physicalIds <- map toCardId <$> selectField EnemyCard AnyEnemy
  physicalIds `shouldBe` [toCardId card]
  Deck deck <- getEncounterDeck
  map toCardId deck `shouldNotSatisfy` elem (toCardId card)
  discarded <- getEncounterDiscard RegularEncounterDeck
  map toCardId discarded `shouldNotSatisfy` elem (toCardId card)

assertFinished :: TestAppT ()
assertFinished = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []

countExplicitShuffles :: TestAppT (IORef [Deck.DeckSignifier])
countExplicitShuffles = do
  ref <- liftIO $ newIORef []
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      ShuffleDeck deck -> liftIO $ modifyIORef' ref (<> [deck])
      _ -> pure ()}
  pure ref

roundTripPendingGame :: TestAppT ()
roundTripPendingGame = do
  current <- getGame
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  case Aeson.eitherDecode (Aeson.encode (current, pending)) of
    Left err -> expectationFailure err
    Right (restored, restoredPending) -> do
      overTest (const restored)
      liftIO $ atomicWriteIORef (queueToRef $ messageQueueRef env) restoredPending
