module Arkham.Homebrew.EpicLabyrinth.PublicViewSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Enemy.CardDefs.NightOfTheZealot.TheGathering qualified as Enemies
import Arkham.Treachery.CardDefs.NightOfTheZealot.ChillingCold qualified as Treacheries
import Arkham.Game qualified as Game
import Arkham.Investigator.Cards qualified as Investigators
import Arkham.Classes.HasGame (getGame)
import Arkham.Enemy.Types (Field (EnemyHealth))
import Arkham.Projection (field)
import Arkham.Location.Types (LocationAttrs (..))
import Data.Aeson (Value (..), eitherDecode, encode)
import Data.Aeson.Key qualified as Key
import Data.Aeson.KeyMap qualified as KeyMap
import TestImport.New

property :: Text -> Value -> Value
property key (Object fields) = fromMaybe Null $ KeyMap.lookup (Key.fromText key) fields
property _ _ = Null

investigatorView :: InvestigatorId -> Value -> Value
investigatorView iid value = case toJSON iid of
  String key -> property key $ property "investigators" value
  _ -> Null

spec :: Spec
spec = describe "Chronicle native public current statistics" do
  it "shows actual asset-modified health, sanity and skills while preserving printed values" . gameTestWith Investigators.rolandBanks $ \self -> do
    void $ self `putAssetIntoPlay` Assets.fiveOfPentacles1
    void $ self `putAssetIntoPlay` Assets.holyRosary
    game <- getGame
    let value = toJSON $ Game.PublicGame () "Current stats" [] game
        own = investigatorView self.id value
    property "currentHealth" own `shouldBe` Number 10
    property "currentSanity" own `shouldBe` Number 6
    property "currentWillpower" own `shouldBe` Number 4
    property "health" own `shouldBe` Number 9
    property "sanity" own `shouldBe` Number 5
    property "willpower" own `shouldBe` Number 3

  it "uses the same current-stat values in both native JSON serializers" . gameTestWith Investigators.rolandBanks $ \self -> do
    void $ self `putAssetIntoPlay` Assets.holyRosary
    game <- getGame
    let public = Game.PublicGame () "Serializer parity" [] game
    eitherDecode @Value (encode public) `shouldBe` Right (toJSON public)

  it "projects modified shroud after an attached native encounter effect" . gameTestWith Investigators.rolandBanks $ \self -> do
    location <- testLocationWith $ \attrs -> attrs {locationShroud = Just $ Static 3}
    self `moveTo` location
    fog <- genEncounterCard Treacheries.obscuringFog
    run $ InvestigatorDrewEncounterCard self.id fog
    game <- getGame
    current <- runReaderT (Game.chroniclePublicLocation location.id location) game
    property "currentShroud" current `shouldBe` Number 5

  it "keeps unrevealed shroud absent and calculates per-investigator enemy health" . gameTestWith Investigators.rolandBanks $ \_ -> do
    location <- testLocation
    enemy <- testEnemyWithDef Enemies.ghoulPriest id
    game <- getGame
    hidden <- runReaderT (Game.chroniclePublicLocation location.id location) game
    property "currentShroud" hidden `shouldBe` Null
    health <- field EnemyHealth enemy.id
    current <- runReaderT (Game.chroniclePublicEnemy enemy.id enemy) game
    property "currentHealth" current `shouldBe` toJSON health
