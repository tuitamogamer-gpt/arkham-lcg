module Arkham.Homebrew.EpicLabyrinth.StoriesSpec (spec) where

import Arkham.Card
import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Homebrew.EpicLabyrinth.Stories.ArcaneRunes qualified as Arcane
import Arkham.Homebrew.EpicLabyrinth.Stories.EncryptedGlyphs qualified as Glyphs
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Stories.TheDilemma qualified as Dilemma
import Arkham.Homebrew.EpicLabyrinth.Stories.TheGate qualified as Gate
import Arkham.Homebrew.EpicLabyrinth.Stories.TheRift qualified as Rift
import Arkham.Homebrew.EpicLabyrinth.Stories.TheVent qualified as Vent
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Id
import Arkham.Message.Story
import Arkham.Placement
import Arkham.Projection
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Types (Field (StoryTokens), StoryAttrs (..), StoryCard)
import Arkham.Token qualified as Token
import Data.Map.Strict qualified as Map
import Data.UUID qualified as UUID
import TestImport qualified as TI
import TestImport.New

attributes :: (Entity a, EntityAttrs a ~ StoryAttrs) => StoryCard a -> StoryAttrs
attributes builder = toAttrs $ cbCardBuilder builder (unsafeMakeCardId UUID.nil) (Nothing, StoryId $ toCardCode builder)

delivery :: Delivery -> Message
delivery body = ScenarioSpecific "epicLabyrinth.delivery" $ toJSON $ DeliveryEnvelope (DeliveryId "story-test:1") body

putStory :: CardDef -> Location -> TestAppT StoryId
putStory definition location = do
  card <- genCard definition
  run $ StoryMessage $ PlaceStory card $ AtLocation location.id
  pure $ StoryId $ toCardCode definition

spec :: Spec
spec = describe "Epic Labyrinth native stories" do
  it "registers the six original multiplayer story identities" do
    map toCardCode [Cards.arcaneRunes, Cards.theRift, Cards.theVent, Cards.theDilemma, Cards.theGate, Cards.encryptedGlyphs]
      `TI.shouldBe` ["70033", "70034", "70035", "70036", "70037", "70038"]
    map storyRemoveAfterResolution
      [ attributes Arcane.arcaneRunes, attributes Rift.theRift, attributes Vent.theVent
      , attributes Dilemma.theDilemma, attributes Gate.theGate, attributes Glyphs.encryptedGlyphs
      ] `TI.shouldBe` replicate 6 False

  it "saves independent delivery receipts in each story" do
    let attrs = attributes Vent.theVent
    case newDelivery attrs (delivery $ SetRuneResources 2) of
      Nothing -> TI.expectationFailure "first delivery must be accepted"
      Just (_, updated) -> do
        newDelivery updated (delivery $ SetRuneResources 2) `TI.shouldBe` Nothing
        length (appliedStoryDeliveries $ memory updated) `TI.shouldBe` 1

  it "roundtrips the story state including pending shipments and private notes" do
    let attrs = attributes Vent.theVent
        cargo = emptyCargo {cargoResources = 2, cargoClues = 1, cargoNotes = ["The word is hidden in the other chamber."]}
        recorded = emptyMemory
          {ventNotes = cargoNotes cargo, pendingVentParcels = Map.singleton (ParcelId UUID.nil) cargo}
    memory (remember recorded attrs) `TI.shouldBe` recorded

  it "matches story-specific commands only to their original target" do
    let vent = attributes Vent.theVent
        gate = attributes Gate.theGate
        command = ClaimVent $ InvestigatorId "01001"
    commandFor vent (storyCommand vent command) `TI.shouldBe` Just command
    commandFor gate (storyCommand vent command) `TI.shouldBe` Nothing

  it "enables a second Rune action only after this group succeeds at decoding" do
    let attrs = attributes Arcane.arcaneRunes
        source = cbCardBuilder Arcane.arcaneRunes (unsafeMakeCardId UUID.nil) (Nothing, StoryId "70033")
        decoded = overAttrs (remember emptyMemory {decodedOwnRunes = True}) source
    map (.index) (getAbilities source) `TI.shouldBe` [1, 3]
    map (.index) (getAbilities decoded) `TI.shouldBe` [1, 3, 2]
    storyLocation attrs `TI.shouldBe` Nothing

  it "blocks Vent deposit, claim and resend while a shipment is reserved" do
    let source = cbCardBuilder Vent.theVent (unsafeMakeCardId UUID.nil) (Nothing, StoryId "70035")
        reserved = overAttrs (remember emptyMemory
          {pendingVentParcels = Map.singleton (ParcelId UUID.nil) emptyCargo}) source
    length (getAbilities source) `TI.shouldBe` 3
    getAbilities reserved `TI.shouldBe` []

  it "exposes a forced Rift opening only once each agenda has at least three doom" do
    let source = cbCardBuilder Rift.theRift (unsafeMakeCardId UUID.nil) (Nothing, StoryId "70034")
        withDoom n = overAttrs (remember emptyMemory {riftMinimumDoom = n}) source
    getAbilities (withDoom 2) `TI.shouldBe` []
    length (getAbilities $ withDoom 3) `TI.shouldBe` 1

  it "installs Rune resources as an absolute native counter" . gameTest $ \_ -> do
    location <- testLocation
    sid <- putStory Cards.arcaneRunes location
    run $ delivery $ SetRuneResources 3
    fieldMap StoryTokens (Token.countTokens Token.Resource) sid `shouldReturn` 3
    run $ delivery $ SetRuneResources 3
    fieldMap StoryTokens (Token.countTokens Token.Resource) sid `shouldReturn` 3

  it "installs both Glyph counters without duplicate application" . gameTest $ \_ -> do
    location <- testLocation
    sid <- putStory Cards.encryptedGlyphs location
    run $ delivery $ SetGlyphCounters 2 1
    fieldMap StoryTokens (Token.countTokens Token.Damage) sid `shouldReturn` 2
    fieldMap StoryTokens (Token.countTokens Token.Horror) sid `shouldReturn` 1
    run $ delivery $ SetGlyphCounters 2 1
    fieldMap StoryTokens (Token.countTokens Token.Damage) sid `shouldReturn` 2

  it "acknowledges a Vent receipt without duplicating the already committed cargo" . gameTest $ \self -> do
    location <- testLocation
    sid <- putStory Cards.theVent location
    let parcel = Parcel (ParcelId UUID.nil) GroupA GroupB (Just self.id) Nothing ThroughVent
          emptyCargo {cargoResources = 3, cargoClues = 2, cargoNotes = ["Meet at the rift."]}
    run $ PlaceTokens GameSource (StoryTarget sid) Token.Resource 3
    run $ PlaceTokens GameSource (StoryTarget sid) Token.Clue 2
    run $ delivery $ ReceiveParcel parcel
    run $ delivery $ ReceiveParcel parcel
    fieldMap StoryTokens (Token.countTokens Token.Resource) sid `shouldReturn` 3
    fieldMap StoryTokens (Token.countTokens Token.Clue) sid `shouldReturn` 2

  it "records the origin commit without debiting tokens a second time" . gameTest $ \self -> do
    location <- testLocation
    sid <- putStory Cards.theVent location
    run $ PlaceTokens GameSource (StoryTarget sid) Token.Resource 2
    run $ PlaceTokens GameSource (StoryTarget sid) Token.Clue 2
    let parcel = Parcel (ParcelId UUID.nil) GroupA GroupB (Just self.id) Nothing ThroughVent
          emptyCargo {cargoResources = 3, cargoClues = 2}
    run $ delivery $ CommitParcel parcel
    fieldMap StoryTokens (Token.countTokens Token.Resource) sid `shouldReturn` 2
    fieldMap StoryTokens (Token.countTokens Token.Clue) sid `shouldReturn` 2
    run $ delivery $ CommitParcel parcel
    fieldMap StoryTokens (Token.countTokens Token.Resource) sid `shouldReturn` 2
