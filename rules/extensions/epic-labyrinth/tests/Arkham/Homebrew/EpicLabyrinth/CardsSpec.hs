module Arkham.Homebrew.EpicLabyrinth.CardsSpec (spec) where

import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Action qualified as Action
import Arkham.Card
import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Cost (Payment (NoPayment))
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Enemies
import Arkham.Enemy.Types (EnemyAttrs (..), Field (EnemyPlacement))
import Arkham.Homebrew.EpicLabyrinth.Assets.DecayDiagram qualified as Decay
import Arkham.Homebrew.EpicLabyrinth.Assets.HungerDiagram qualified as Hunger
import Arkham.Homebrew.EpicLabyrinth.Assets.RotDiagram qualified as Rot
import Arkham.Homebrew.EpicLabyrinth.Enemies.EixodolonsPet qualified as Pet
import Arkham.Homebrew.EpicLabyrinth.Enemies.TheJailor qualified as Jailor
import Arkham.Homebrew.EpicLabyrinth.Treacheries.ParadoxEffect qualified as Paradox
import Arkham.Id
import Arkham.Game.Base (Game (..))
import Arkham.Helpers.Scenario (getVictoryDisplay)
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Location.CardDefs.TheLabyrinthsOfLunacy qualified as Locations
import Arkham.Location.Types (Field (LocationDoom))
import Arkham.Matcher qualified as Matcher
import Arkham.Placement
import Arkham.Projection
import Arkham.Source
import Arkham.Treachery.CardDefs.TheLabyrinthsOfLunacy qualified as Treacheries
import Arkham.Zone (OutOfPlayZone (SetAsideZone))
import Data.UUID qualified as UUID
import TestImport qualified as TI
import TestImport.New

spec :: Spec
spec = describe "Epic Labyrinth original player interactions and encounter cards" do
  it "registers the six printed Epic identities instead of single-group substitutes" do
    map toCardCode [Assets.rotDiagramEpicMultiplayer, Assets.hungerDiagramEpicMultiplayer, Assets.decayDiagramEpicMultiplayer,
      Enemies.eixodolonsPetEpicMultiplayer, Enemies.theJailor, Treacheries.paradoxEffectEpicMultiplayer]
      `TI.shouldBe` ["70042", "70044", "70046", "70049", "70051", "70059"]
    [toCardCode Rot.rotDiagram, toCardCode Hunger.hungerDiagram, toCardCode Decay.decayDiagram]
      `TI.shouldBe` ["70042", "70044", "70046"]
    toCardCode Pet.eixodolonsPet `TI.shouldBe` "70049"
    toCardCode Jailor.theJailor `TI.shouldBe` "70051"
    toCardCode Paradox.paradoxEffect `TI.shouldBe` "70059"

  it "only adds the Chamber of Hunger send action while the Pet is locked away" do
    let builder = cbCardBuilder Pet.eixodolonsPet (unsafeMakeCardId UUID.nil) (EnemyId UUID.nil)
        locked = overAttrs (\a -> a {enemyPlacement = Global}) builder
        free = overAttrs (\a -> a {enemyPlacement = AtLocation $ LocationId UUID.nil}) builder
    any ((== 1) . (.index)) (getAbilities locked) `TI.shouldBe` True
    any ((== 1) . (.index)) (getAbilities free) `TI.shouldBe` False

  it "Rot Diagram adds one doom and flips exactly the selected number of clues" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfDecay id
    self `moveTo` chamber
    withProp @"clues" 3 self
    diagram <- self `putAssetIntoPlay` Assets.rotDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy chamber $ AssetSource diagram) 2 [] NoPayment
    -- clickLabel intentionally compares only an i18n key's first word; these
    -- literal choices share "Turn", so select the complete printed choice.
    chooseOptionMatching "convert exactly two clues" \case
      Label label _ -> label == "Turn 2 of your clues into additional doom in Chamber of Decay"
      _ -> False
    self.clues `shouldReturn` 1
    field LocationDoom chamber.id `shouldReturn` 3

  it "Rot Diagram permits retaining every clue while placing its mandatory doom" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfDecay id
    self `moveTo` chamber
    withProp @"clues" 2 self
    diagram <- self `putAssetIntoPlay` Assets.rotDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy chamber $ AssetSource diagram) 2 [] NoPayment
    chooseOptionMatching "retain all clues" \case
      Label label _ -> label == "Turn 0 of your clues into additional doom in Chamber of Decay"
      _ -> False
    self.clues `shouldReturn` 2
    field LocationDoom chamber.id `shouldReturn` 1

  it "Hunger Diagram's successful investigation gives the Syringe without discovering ordinary clues" . gameTest $ \self -> do
    chamber <- testLocationWithDef Locations.chamberOfRot id
    self `moveTo` chamber
    syringe <- genCard Assets.mysteriousSyringe
    run $ SetAsideCards [syringe]
    diagram <- self `putAssetIntoPlay` Assets.hungerDiagramEpicMultiplayer
    run $ Successful (Action.Investigate, LocationTarget chamber.id) self.id (AssetSource diagram) (AssetTarget diagram) 1
    assertAny $ Matcher.AssetControlledBy (Matcher.InvestigatorWithId self.id) <> Matcher.assetIs Assets.mysteriousSyringe
    self.clues `shouldReturn` 0

  it "Decay Diagram's four damage defeats the locked-away Pet with one investigator" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    self `moveTo` hunger
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    diagram <- self `putAssetIntoPlay` Assets.decayDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy hunger $ AssetSource diagram) 2 [] NoPayment
    assertNone $ Matcher.EnemyWithId pet.id
    victory <- getVictoryDisplay
    map toCardId victory `shouldContain` [toCardId pet]

  it "Decay Diagram deals four surviving damage against the two-investigator Pet" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    self `moveTo` hunger
    other <- addInvestigator Investigators.rolandBanks
    other `moveTo` hunger
    overTest $ \game -> game {gamePlayerCount = 2}
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    diagram <- self `putAssetIntoPlay` Assets.decayDiagramEpicMultiplayer
    run $ UseCardAbility self.id (proxy hunger $ AssetSource diagram) 2 [] NoPayment
    assertAny $ Matcher.EnemyWithId pet.id
    pet.damage `shouldReturn` 4

  it "a locked Pet is immune to player modifiers while an unleashed Pet is not" . gameTest $ \_ -> do
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    -- Direct fixture insertion does not preload the native modifier cache.
    run Noop
    getModifiers pet >>= (`shouldContain` [CannotReceiveModifiersFromPlayerSources])
    location <- testLocation
    run $ PlaceEnemy pet.id $ AtLocation location.id
    modifiers <- getModifiers pet
    modifiers `shouldNotContain` [CannotReceiveModifiersFromPlayerSources]

  it "sending the Pet sets it aside rather than transferring a damaged enemy immediately" . gameTest $ \self -> do
    hunger <- testLocationWithDef Locations.chamberOfHunger id
    pet <- testEnemyWithDef Enemies.eixodolonsPetEpicMultiplayer (\a -> a {enemyPlacement = Global})
    run $ UseCardAbility self.id (proxy hunger pet) 1 [] NoPayment
    field EnemyPlacement pet.id `shouldReturn` OutOfPlay SetAsideZone
