module Arkham.Homebrew.EpicMachinations.TransportSpec (spec) where

import Arkham.Ability
import Arkham.Asset.Cards.NightOfTheZealot qualified as PlayerAssets
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Asset.Types (AssetAttrs (..))
import Arkham.Card
import Arkham.Card.Id (unsafeMakeCardId)
import Arkham.Classes.HasGame (getGame)
import Arkham.Cost (Payment (NoPayment))
import Arkham.Enemy.Types (Enemy (..), EnemyAttrs (..))
import Arkham.Entities (Entities (..))
import Arkham.Game.Base (Game (..))
import Arkham.Homebrew.EpicLabyrinth.Transfer (originalOwner)
import Arkham.Homebrew.EpicLabyrinth.Types (LabyrinthGroup (..))
import Arkham.Homebrew.EpicMachinations.Enemies.EdwinBennetEnviousRival qualified as Rival
import Arkham.Homebrew.EpicMachinations.Transport
import Arkham.Homebrew.EpicMachinations.Types (Era (..))
import Arkham.Placement
import Arkham.Matcher (WindowMatcher (AnyWindow))
import Arkham.Scenario.Types (setMetaKey)
import Arkham.Token qualified as Token
import Data.Either (isLeft)
import Data.Map.Strict qualified as Map
import Data.UUID qualified as UUID
import TestImport.New

connected :: Era -> Game -> Game
connected era game = game {gameMode = case gameMode game of
  That active -> That $ change active
  These campaign active -> These campaign $ change active
  _ -> error "test needs scenario"}
 where
  change = overAttrs $ setMetaKey "epicMultiplayer" True
    . setMetaKey "epicMachinationsReplica" (object ["currentEra" .= era])

assertRight :: Either Text a -> TestAppT a
assertRight = either (\message -> expectationFailure (unpack message) >> error "failed Edwin transfer") pure

physicalEdwin :: LocationId -> Enemy
physicalEdwin lid = Enemy $ overAttrs (\attrs -> attrs
  {enemyPlacement = AtLocation lid, enemyExhausted = True,
   enemyTokens = Map.fromList [(Token.Target, 2), (Token.Redemption, 3)]}) $
  cbCardBuilder Rival.edwinBennetEnviousRival (unsafeMakeCardId $ UUID.fromWords 0 0 0 77) (EnemyId UUID.nil)

installEnemy :: Enemy -> Game -> Game
installEnemy enemy game = game {gameEntities = (gameEntities game)
  {entitiesEnemies = Map.insert (toId enemy) enemy $ entitiesEnemies $ gameEntities game}}

spec :: Spec
spec = describe "Epic Machinations atomic movement of the actual Edwin" do
  it "moves the same physical enemy and its recursive player attachment graph, keeping counters and original owners"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      base <- getGame
      firstId <- self `putAssetIntoPlay` PlayerAssets.flashlight
      secondId <- self `putAssetIntoPlay` PlayerAssets.flashlight
      current <- getGame
      let enemy = physicalEdwin location.id
          first = overAttrs (\attrs -> attrs {assetPlacement = AttachedToEnemy $ toId enemy,
            assetTokens = Map.singleton Token.Damage 1}) $
            fromJustNote "first attachment" $ Map.lookup firstId $ entitiesAssets $ gameEntities current
          second = overAttrs (\attrs -> attrs {assetPlacement = AttachedToAsset firstId Nothing,
            assetExhausted = True, assetMeta = object ["nested" .= True]}) $
            fromJustNote "nested attachment" $ Map.lookup secondId $ entitiesAssets $ gameEntities current
          sender = connected PastEra $ installEnemy enemy current
            {gameCards = Map.insert (toCardId first) (toCard first)
                $ Map.insert (toCardId second) (toCard second) $ gameCards current,
             gameEntities = (gameEntities current) {entitiesAssets = Map.insert firstId first $
              Map.insert secondId second $ entitiesAssets $ gameEntities current}}
          receiver = connected FutureEra base
      (sent, received) <- assertRight $ moveEdwin self.id location.id sender receiver
      Map.member (toId enemy) (entitiesEnemies $ gameEntities sent) `shouldBe` False
      Map.member firstId (entitiesAssets $ gameEntities sent) `shouldBe` False
      Map.member secondId (entitiesAssets $ gameEntities sent) `shouldBe` False
      let moved = fromJustNote "same Edwin" $ Map.lookup (toId enemy) $ entitiesEnemies $ gameEntities received
      toCardId moved `shouldBe` toCardId enemy
      enemyTokens (toAttrs moved) `shouldBe` enemyTokens (toAttrs enemy)
      enemyExhausted (toAttrs moved) `shouldBe` False
      moved.placement `shouldBe` AtLocation location.id
      toJSON (fromJustNote "first" $ Map.lookup firstId $ entitiesAssets $ gameEntities received) `shouldBe` toJSON first
      toJSON (fromJustNote "nested" $ Map.lookup secondId $ entitiesAssets $ gameEntities received) `shouldBe` toJSON second
      originalOwner (toCard second) received `shouldBe` Right (Just (GroupA, self.id))
      moveEdwin self.id location.id sent received `shouldSatisfy` isLeft

  it "moves the existing Esteemed Colleague asset with its clues, damage, horror and card identity"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      base <- getGame
      aid <- self `putAssetIntoPlay` Assets.edwinBennetEsteemedColleague
      current <- getGame
      let original = fromJustNote "colleague" $ Map.lookup aid $ entitiesAssets $ gameEntities current
          asset = overAttrs (\attrs -> attrs {assetPlacement = AtLocation location.id,
            assetExhausted = True, assetTokens = Map.fromList [(Token.Clue, 5), (Token.Damage, 1), (Token.Horror, 1)]}) original
          sender = connected PresentEra current {gameEntities = (gameEntities current)
            {entitiesAssets = Map.insert aid asset $ entitiesAssets $ gameEntities current}}
      (sent, received) <- assertRight $ moveEdwin self.id location.id sender $ connected PastEra base
      Map.member aid (entitiesAssets $ gameEntities sent) `shouldBe` False
      let moved = fromJustNote "same colleague" $ Map.lookup aid $ entitiesAssets $ gameEntities received
      toCardId moved `shouldBe` toCardId asset
      assetTokens (toAttrs moved) `shouldBe` assetTokens (toAttrs asset)
      assetController (toAttrs moved) `shouldBe` assetController (toAttrs asset)
      assetExhausted (toAttrs moved) `shouldBe` False
      moved.placement `shouldBe` AtLocation location.id

  it "readies and moves Edwin within the same era without detaching or replacing it" . gameTest $ \self -> do
    location <- testLocation
    self `moveTo` location
    base <- getGame
    let enemy = physicalEdwin location.id
        game = connected PastEra $ installEnemy enemy base
    (a, b) <- assertRight $ moveEdwin self.id location.id game game
    toJSON a `shouldBe` toJSON b
    let moved = fromJustNote "Edwin" $ Map.lookup (toId enemy) $ entitiesEnemies $ gameEntities a
    enemyExhausted (toAttrs moved) `shouldBe` False
    toCardId moved `shouldBe` toCardId enemy
    enemyTokens (toAttrs moved) `shouldBe` enemyTokens (toAttrs enemy)

  it "rejects an occupied recipient entity ID and an invalid acting investigator" . gameTest $ \self -> do
    location <- testLocation
    self `moveTo` location
    base <- getGame
    let enemy = physicalEdwin location.id
        origin = connected PastEra $ installEnemy enemy base
        recipient = connected FutureEra base
        occupied = installEnemy enemy recipient
    moveEdwin self.id location.id origin occupied `shouldSatisfy` isLeft
    moveEdwin (InvestigatorId "absent") location.id origin recipient `shouldSatisfy` isLeft

  it "blocks exact Edwin references in native questions, active abilities and queued messages while allowing unrelated interactions"
    . gameTest $ \self -> do
      location <- testLocation
      self `moveTo` location
      base <- getGame
      let enemy = physicalEdwin location.id
          sender = connected PastEra $ installEnemy enemy base
          relevant = UseCardAbility self.id (EnemySource $ toId enemy) 2 [] NoPayment
          unrelated = UseCardAbility self.id (EnemySource $ EnemyId $ UUID.fromWords 0 0 0 99) 2 [] NoPayment
          question = sender {gameQuestion = Map.singleton (gameActivePlayerId sender) $
            ChooseOne [TargetLabel (toTarget enemy) [relevant]]}
          active = sender {gameActiveAbilities = [mkAbility (toAttrs enemy) 1 $ forced AnyWindow]}
      edwinInteractionPending sender [relevant] `shouldBe` True
      edwinInteractionPending sender [unrelated] `shouldBe` False
      edwinInteractionPending question [] `shouldBe` True
      edwinInteractionPending active [] `shouldBe` True
      moveEdwin self.id location.id question (connected FutureEra base) `shouldSatisfy` isLeft
      moveEdwin self.id location.id active (connected FutureEra base) `shouldSatisfy` isLeft
