module Arkham.Homebrew.ScenarioFixes.KeyedEncounterSearchSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Deck qualified as Deck
import Arkham.EncounterCard.Source qualified as Origin
import Arkham.Enemy.CardDefs.NightOfTheZealot.Rats qualified as Enemies
import Arkham.Enemy.CardDefs.TheCircleUndone.TrappedSpirits qualified as Spirits
import Arkham.Enemy.Types (Field (EnemyCard))
import Arkham.Helpers.Scenario (getEncounterDeck, getEncounterDeckKey, getEncounterDiscard, scenarioField)
import Arkham.Matcher
import Arkham.Projection
import Arkham.Queue (queueToRef)
import Arkham.Scenario.Deck (ScenarioEncounterDeckKey (..))
import Arkham.Scenario.Types qualified as Scenario
import Arkham.Trait (Trait (Spectral))
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as Treacheries
import Control.Monad.State (put)
import Data.Aeson qualified as Aeson
import Data.Map.Strict qualified as Map
import System.Random (mkStdGen)
import Test.Hspec qualified as Hspec
import TestImport.New

-- The Wages of Sin's spectral deck and discard are independent of the regular
-- piles. Search records the source before presenting a choice; neither moving
-- nor a JSON save/resume may change which physical pile that choice operates on.
spec :: Spec
spec = describe "Keyed encounter search completion" do
  for_ encounterKeys \key ->
    for_ [False, True] \fromDiscard ->
      it ("draws the chosen physical copy from " <> show key <> zoneName fromDiscard <> " and shuffles only its deck")
        . gameTest $ \self -> do
          prepare self
          seedAllPiles
          cards <- encounterCards 8
          chosen <- genEncounterCard Enemies.swarmOfRats
          otherCopy <- genEncounterCard Enemies.swarmOfRats
          discarded <- genEncounterCard Treacheries.obscuringFog
          let deck = if fromDiscard then otherCopy : cards else chosen : otherCopy : cards
          let discardPile = if fromDiscard then [chosen, discarded] else [discarded]
          setPiles key deck discardPile
          before <- snapshotPiles
          draws <- recordDraws
          run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard key
          assertTarget $ toCardId chosen
          assertTarget $ toCardId otherCopy
          seedShuffle
          chooseTarget $ toCardId chosen
          assertShuffled key (otherCopy : cards)
          snd <$> getPiles key `shouldReturn` [discarded]
          assertUntouched key before
          assertDrawn chosen
          draws `refShouldBe` [(toCardId chosen, Just $ sourceSignifier key fromDiscard)]
          assertConserved before
          assertFinished

  for_ [RegularEncounterDeck, SpectralEncounterDeck] \key ->
    for_ [False, True] \fromDiscard ->
      it ("resumes a saved " <> show key <> zoneName fromDiscard <> " choice after the investigator changes encounter decks")
        . scenarioTest "05161" $ \self -> do
          withDeck self [Assets.flashlight]
          regularLocation <- testLocation
          spectralLocation <- testLocation
          run =<< gameModifier GameSource spectralLocation (AddTrait Spectral)
          self `moveTo` if key == SpectralEncounterDeck then spectralLocation else regularLocation
          getEncounterDeckKey self `shouldReturn` key
          seedAllPiles
          cards <- encounterCards 8
          chosen <- genEncounterCard Enemies.swarmOfRats
          discarded <- genEncounterCard Treacheries.obscuringFog
          setPiles key (if fromDiscard then cards else chosen : cards) (if fromDiscard then [chosen, discarded] else [discarded])
          before <- snapshotPiles
          -- The public entry point derives its key once from the investigator.
          run $ findAndDrawEncounterCard self.id $ cardIs Enemies.swarmOfRats
          roundTripPendingGame
          self `moveTo` if key == SpectralEncounterDeck then regularLocation else spectralLocation
          getEncounterDeckKey self `shouldReturn` (if key == SpectralEncounterDeck then RegularEncounterDeck else SpectralEncounterDeck)
          roundTripPendingGame
          seedShuffle
          chooseTarget $ toCardId chosen
          assertShuffled key cards
          snd <$> getPiles key `shouldReturn` [discarded]
          assertUntouched key before
          assertDrawn chosen
          assertConserved before
          assertFinished

  it "excludes keyed discard matches while retaining eligible deck choices" . gameTest $ \self -> do
    prepare self
    seedAllPiles
    chosen <- genEncounterCard Enemies.swarmOfRats
    discardedEnemy <- genEncounterCard Enemies.swarmOfRats
    cards <- encounterCards 8
    setPiles SpectralEncounterDeck (chosen : cards) [discardedEnemy]
    before <- snapshotPiles
    run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) ExcludeDiscard SpectralEncounterDeck
    assertTarget $ toCardId chosen
    assertNotTarget $ toCardId discardedEnemy
    seedShuffle
    chooseTarget $ toCardId chosen
    assertShuffled SpectralEncounterDeck cards
    snd <$> getPiles SpectralEncounterDeck `shouldReturn` [discardedEnemy]
    assertUntouched SpectralEncounterDeck before
    assertDrawn chosen
    assertConserved before
    assertFinished

  it "never offers matching cards from either of the unsearched decks or discards" . gameTest $ \self -> do
    prepare self
    seedAllPiles
    chosen <- genEncounterCard Enemies.swarmOfRats
    cards <- encounterCards 8
    setPiles SpectralEncounterDeck (chosen : cards) []
    regularEnemy <- genEncounterCard Enemies.swarmOfRats
    regularDiscard <- genEncounterCard Enemies.swarmOfRats
    otherEnemy <- genEncounterCard Enemies.swarmOfRats
    otherDiscard <- genEncounterCard Enemies.swarmOfRats
    setPiles RegularEncounterDeck [regularEnemy] [regularDiscard]
    setPiles SetAsideEncounterDeck [otherEnemy] [otherDiscard]
    before <- snapshotPiles
    run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard SpectralEncounterDeck
    for_ [regularEnemy, regularDiscard, otherEnemy, otherDiscard] $ assertNotTarget . toCardId
    chooseTarget $ toCardId chosen
    assertUntouched SpectralEncounterDeck before
    assertDrawn chosen
    assertConserved before
    assertFinished

  for_ [False, True] \fromDiscard ->
    it ("finishes a saved keyed search with an empty remaining deck from" <> zoneName fromDiscard <> " without refilling it")
      . gameTest $ \self -> do
        prepare self
        seedAllPiles
        chosen <- genEncounterCard Enemies.swarmOfRats
        retained <- genEncounterCard Treacheries.obscuringFog
        setPiles SpectralEncounterDeck (if fromDiscard then [] else [chosen]) (if fromDiscard then [chosen, retained] else [retained])
        before <- snapshotPiles
        run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard SpectralEncounterDeck
        roundTripPendingGame
        chooseTarget $ toCardId chosen
        getPiles SpectralEncounterDeck `shouldReturn` ([], [retained])
        assertUntouched SpectralEncounterDeck before
        assertDrawn chosen
        assertConserved before
        assertFinished

  it "cannot find the same physical keyed enemy again on a second search" . gameTest $ \self -> do
    prepare self
    seedAllPiles
    chosen <- genEncounterCard Enemies.swarmOfRats
    cards <- encounterCards 8
    setPiles SpectralEncounterDeck (chosen : cards) []
    before <- snapshotPiles
    run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard SpectralEncounterDeck
    chooseTarget $ toCardId chosen
    run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Enemies.swarmOfRats) IncludeDiscard SpectralEncounterDeck
    assertNotTarget $ toCardId chosen
    roundTripPendingGame
    clickLabel "$label.noMatchesFound"
    assertDrawn chosen
    assertConserved before
    assertUntouched SpectralEncounterDeck before
    assertFinished

  for_ [False, True] \fromDiscard ->
    it ("draws and later discards a real Spectral enemy once from its saved" <> zoneName fromDiscard)
      . scenarioTest "05161" $ \self -> do
        prepare self
        seedAllPiles
        chosen <- genEncounterCard Spirits.wraith
        cards <- encounterCards 8
        retained <- genEncounterCard Treacheries.obscuringFog
        setPiles SpectralEncounterDeck (if fromDiscard then cards else chosen : cards) (if fromDiscard then [chosen, retained] else [retained])
        before <- snapshotPiles
        run $ FindAndDrawEncounterCardWithDeckKey self.id (cardIs Spirits.wraith) IncludeDiscard SpectralEncounterDeck
        roundTripPendingGame
        chooseTarget $ toCardId chosen
        assertDrawn chosen
        enemy <- selectJust $ EnemyWithCardId $ toCardId chosen
        discard enemy
        selectCount AnyEnemy `shouldReturn` 0
        (deck, discarded) <- getPiles SpectralEncounterDeck
        deck `shouldMatchList` cards
        discarded `shouldMatchList` [chosen, retained]
        assertUntouched SpectralEncounterDeck before
        assertConserved before
        assertFinished

  it "decodes legacy search-origin JSON and preserves the new keyed-discard origin" do
    (Aeson.eitherDecode "{\"tag\":\"FromDiscard\"}" :: Either String Origin.EncounterCardSource)
      `Hspec.shouldBe` Right Origin.FromDiscard
    (Aeson.eitherDecode "{\"tag\":\"FromEncounterDeck\"}" :: Either String Origin.EncounterCardSource)
      `Hspec.shouldBe` Right Origin.FromEncounterDeck
    (Aeson.eitherDecode "{\"tag\":\"FromKeyedEncounterDeck\",\"contents\":\"SpectralEncounterDeck\"}" :: Either String Origin.EncounterCardSource)
      `Hspec.shouldBe` Right (Origin.FromKeyedEncounterDeck SpectralEncounterDeck)
    let source = Origin.FromKeyedEncounterDiscard SpectralEncounterDeck
    Aeson.eitherDecode (Aeson.encode source) `Hspec.shouldBe` Right source

encounterKeys :: [ScenarioEncounterDeckKey]
encounterKeys = [RegularEncounterDeck, SpectralEncounterDeck, SetAsideEncounterDeck]

zoneName :: Bool -> String
zoneName True = " discard"
zoneName False = " deck"

sourceSignifier :: ScenarioEncounterDeckKey -> Bool -> Deck.DeckSignifier
sourceSignifier _ True = Deck.EncounterDiscard
sourceSignifier RegularEncounterDeck False = Deck.EncounterDeck
sourceSignifier key False = Deck.EncounterDeckByKey key

prepare :: Investigator -> TestAppT ()
prepare self = do
  withDeck self [Assets.flashlight]
  location <- testLocation
  self `moveTo` location

encounterCards :: Int -> TestAppT [EncounterCard]
encounterCards n = replicateM n $ genEncounterCard Treacheries.cryptChill

setPiles :: ScenarioEncounterDeckKey -> [EncounterCard] -> [EncounterCard] -> TestAppT ()
setPiles RegularEncounterDeck deck discarded =
  overTest $ modeL %~ fmap (overAttrs \attrs -> attrs
    {Scenario.scenarioEncounterDeck = Deck deck, Scenario.scenarioDiscard = discarded, Scenario.scenarioHasEncounterDeck = True})
setPiles key deck discarded =
  overTest $ modeL %~ fmap (overAttrs \attrs -> attrs
    {Scenario.scenarioEncounterDecks = Map.insert key (Deck deck, discarded) (Scenario.scenarioEncounterDecks attrs)})

getPiles :: ScenarioEncounterDeckKey -> TestAppT ([EncounterCard], [EncounterCard])
getPiles RegularEncounterDeck = (,) <$> (unDeck <$> getEncounterDeck) <*> getEncounterDiscard RegularEncounterDeck
getPiles key = do
  decks <- scenarioField Scenario.ScenarioEncounterDecks
  let (Deck cards, discarded) = fromJustNote "keyed encounter deck exists" $ Map.lookup key decks
  pure (cards, discarded)

seedAllPiles :: TestAppT ()
seedAllPiles = for_ encounterKeys \key -> do
  cards <- encounterCards 8
  discarded <- genEncounterCard Treacheries.obscuringFog
  setPiles key cards [discarded]

type PileSnapshot = [(ScenarioEncounterDeckKey, ([EncounterCard], [EncounterCard]))]

snapshotPiles :: TestAppT PileSnapshot
snapshotPiles = traverse (\key -> (key,) <$> getPiles key) encounterKeys

assertUntouched :: ScenarioEncounterDeckKey -> PileSnapshot -> TestAppT ()
assertUntouched searched before = for_ before \(key, piles) ->
  when (key /= searched) $ getPiles key `shouldReturn` piles

assertConserved :: PileSnapshot -> TestAppT ()
assertConserved before = do
  after <- snapshotPiles
  inPlay <- selectField EnemyCard AnyEnemy
  let pileCards = concatMap (\(_, (deck, discarded)) -> deck <> discarded)
  let initialIds = map toCardId $ pileCards before
  let finalIds = map toCardId (pileCards after) <> map toCardId inPlay
  finalIds `shouldMatchList` initialIds
  length finalIds `shouldBe` length (nub finalIds)

seedShuffle :: TestAppT ()
seedShuffle = do
  env <- get
  liftIO $ writeIORef (gen env) (mkStdGen 5489)

assertShuffled :: ScenarioEncounterDeckKey -> [EncounterCard] -> TestAppT ()
assertShuffled key cards = do
  (actual, _) <- getPiles key
  actual `shouldMatchList` cards
  actual `shouldNotBe` cards

assertDrawn :: EncounterCard -> TestAppT ()
assertDrawn card = do
  physicalIds <- map toCardId <$> selectField EnemyCard AnyEnemy
  physicalIds `shouldBe` [toCardId card]
  for_ encounterKeys \key -> do
    (deck, discarded) <- getPiles key
    map toCardId (deck <> discarded) `shouldNotSatisfy` elem (toCardId card)

assertFinished :: TestAppT ()
assertFinished = do
  env <- get
  pending <- liftIO $ readIORef $ queueToRef $ messageQueueRef env
  pending `shouldBe` []
  gameFoundCards <$> getGame `shouldReturn` mempty

recordDraws :: TestAppT (IORef [(CardId, Maybe Deck.DeckSignifier)])
recordDraws = do
  ref <- liftIO $ newIORef []
  env <- get
  let previous = testLogger env
  put $ env {testLogger = Just \msg -> do
    for_ previous ($ msg)
    case msg of
      InvestigatorDrewEncounterCardFrom _ card deck -> liftIO $ modifyIORef' ref (<> [(toCardId card, deck)])
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
