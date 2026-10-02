module Arkham.Homebrew.Barkham.PlayersSpec (spec) where

import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Ability.Types (Ability)
import Arkham.ChaosToken (createChaosToken)
import Arkham.Enemy.CardDefs.NightOfTheZealot.TheGathering qualified as Enemies
import Arkham.Asset.Types (Field (AssetUses))
import Arkham.Asset.Uses (Token (Supply))
import Arkham.Investigator.Types (Field (InvestigatorCardsUnderneath))
import Arkham.Matcher qualified as Matcher
import Arkham.Projection
import Arkham.Slot
import Arkham.Trait (Trait (Weapon))
import TestImport.New

ownAbility :: Investigator -> Int -> TestAppT Ability
ownAbility self index = do
  abilities <- self.abilities
  pure $ fromJustNote "expected investigator ability" $
    find (\ability -> ability.index == index && ability.source == toSource self) abilities

spec :: Spec
spec = describe "Barkham players" do
  for_ [ (Cards.barkHarrigan, (3, 2, 5, 2))
       , (Cards.kateWinthpup, (3, 4, 1, 4))
       , (Cards.skidsODrool, (2, 3, 3, 4))
       , (Cards.jacquelineCanine, (5, 3, 2, 2))
       , (Cards.duke, (2, 4, 4, 2))
       ] \(investigator, (will, int, com, agi)) ->
    it ("uses the printed skill values for " <> show investigator.cardCode) . gameTestWith investigator $ \self -> do
      self.willpower `shouldReturn` will
      self.intellect `shouldReturn` int
      self.combat `shouldReturn` com
      self.agility `shouldReturn` agi

  beginsWithInPlay Cards.duke Cards.friendlyHuman
  hasUses @"ammo" Cards.catlingGun 12
  hasUses @"supplies" Cards.friendlyHuman 5

  it "gives Bark exactly two weapon-only additional paws" . gameTestWith Cards.barkHarrigan $ \self -> do
    cards <- testPlayerCards 20
    withProp @"deck" (Deck cards) self
    run $ SetupInvestigator self.id
    slots <- self.slots
    let paws = findWithDefault [] HandSlot slots
    length paws `shouldBe` 4
    length [() | TraitRestrictedSlot _ Weapon _ <- paws] `shouldBe` 2

  it "gives Bark's next weapon a two-resource Elder Sign discount" . gameTestWith Cards.barkHarrigan $ \self -> do
    token <- createChaosToken ElderSign
    run $ ResolveChaosToken token ElderSign self.id
    modifiers <- getModifiers self
    modifiers `shouldContain` [ReduceCostOf (#asset <> #weapon) 2]

  it "More Bark Than Bite imposes the full combat penalty" . gameTestWith Cards.barkHarrigan $ \self -> do
    self `drawsCard` Cards.moreBarkThanBite
    self.combat `shouldReturn` 2
    assertAny $ Matcher.treacheryInThreatAreaOf self.id <> Matcher.treacheryIs Cards.moreBarkThanBite

  it "Kate sniffs a connecting location without moving" . gameTestWith Cards.kateWinthpup $ \self -> do
    (here, there) <- testConnectedLocations id id
    self `moveTo` here
    sniff <- ownAbility self 1
    self `useAbility` sniff
    chooseTarget there
    self.location `shouldReturn` Just here.id

  it "Skids rides three times for one action and one resource" . gameTestWith Cards.skidsODrool $ \self -> do
    (here, there) <- testConnectedLocations id id
    self `moveTo` here
    self `gainResources` 1
    ride <- ownAbility self 1
    self `useAbility` ride
    chooseTarget there
    chooseTarget here
    chooseTarget there
    self.location `shouldReturn` Just there.id
    self.resources `shouldReturn` 0
    self.remainingActions `shouldReturn` 2

  it "the car ride leaves enemies unengaged when entering their location" . gameTestWith Cards.skidsODrool $ \self -> do
    (here, there) <- testConnectedLocations id id
    self `moveTo` here
    enemy <- testEnemy
    enemy `spawnAt` there
    self `gainResources` 1
    ride <- ownAbility self 1
    self `useAbility` ride
    chooseTarget there
    clickLabel "Finish the car ride"
    self.engagedEnemies `shouldReturn` []

  it "Jacqueline buries a card and draws its replacement" . gameTestWith Cards.jacquelineCanine $ \self -> do
    [buried, replacement, spare] <- testPlayerCards 3
    withProp @"hand" [toCard buried] self
    withProp @"deck" (Deck [replacement, spare]) self
    bury <- ownAbility self 1
    self `useAbility` bury
    chooseTarget buried
    field InvestigatorCardsUnderneath self.id `shouldReturn` [toCard buried]
    self.hand `shouldReturn` [toCard replacement]

  it "Jacqueline digs up one card and can stop before the second" . gameTestWith Cards.jacquelineCanine $ \self -> do
    cards@[first, second] <- testPlayerCards 2
    run $ PlaceUnderneath (InvestigatorTarget self.id) (map toCard cards)
    dig <- ownAbility self 2
    self `useAbility` dig
    chooseTarget first
    clickLabel "Finish digging"
    self.hand `shouldReturn` [toCard first]
    field InvestigatorCardsUnderneath self.id `shouldReturn` [toCard second]

  it "Chew Toy permits committing every buried card" . gameTestWith Cards.jacquelineCanine $ \self -> do
    cards <- map toCard <$> testPlayerCards 2
    run $ PlaceUnderneath (InvestigatorTarget self.id) cards
    self `putCardIntoPlay` Cards.chewToyOfNightmares
    modifiers <- getModifiers self
    modifiers `shouldContain` map CanCommitToSkillTestsAsIfInHand cards

  it "Duke spends two actions to add exactly three treats" . gameTestWith Cards.duke $ \self -> do
    human <- self `putAssetIntoPlay` Cards.friendlyHuman
    beg <- ownAbility self 1
    self `useAbility` beg
    fieldMap AssetUses (findWithDefault 0 Supply) human `shouldReturn` 8
    self.remainingActions `shouldReturn` 1

  it "Out of Doggie Treats removes the treats without discarding Friendly Human" . gameTestWith Cards.duke $ \self -> do
    human <- self `putAssetIntoPlay` Cards.friendlyHuman
    self `drawsCard` Cards.outOfDoggieTreats
    fieldMap AssetUses (findWithDefault 0 Supply) human `shouldReturn` 0
    assertAny $ Matcher.assetIs Cards.friendlyHuman

  it "Old Shoe pays damage to heal one horror" . gameTestWith Cards.duke $ \self -> do
    shoe <- self `putAssetIntoPlay` Cards.oldShoe
    withProp @"horror" 1 self
    [chew] <- shoe.abilities
    self `useAbility` chew
    self.horror `shouldReturn` 0
    shoe.damage `shouldReturn` 1

  it "Howl evades its highest-evade Elite target and every other non-Elite in play" . gameTestWith Cards.kateWinthpup $ \self -> do
    withProp @"willpower" 5 self
    here <- testLocation
    remote <- testLocation
    elite <- testEnemyWithDef Enemies.ghoulPriest id
    other <- testEnemy
    elite `spawnAt` here
    other `spawnAt` remote
    self `moveTo` here
    setChaosTokens [Zero]
    self `playEvent` Cards.howlOfClyhfford
    chooseOnlyOption "Evade the highest-evade Elite enemy"
    startSkillTest
    applyResults
    assertAny $ Matcher.ExhaustedEnemy <> Matcher.EnemyWithId elite.id
    assertAny $ Matcher.ExhaustedEnemy <> Matcher.EnemyWithId other.id
    self.engagedEnemies `shouldReturn` []

  it "a failed Howl evades neither its Elite target nor other non-Elites" . gameTestWith Cards.kateWinthpup $ \self -> do
    here <- testLocation
    remote <- testLocation
    elite <- testEnemyWithDef Enemies.ghoulPriest id
    other <- testEnemy
    elite `spawnAt` here
    other `spawnAt` remote
    self `moveTo` here
    setChaosTokens [AutoFail]
    self `playEvent` Cards.howlOfClyhfford
    chooseOnlyOption "Evade the highest-evade Elite enemy"
    startSkillTest
    applyResults
    assertNone $ Matcher.ExhaustedEnemy <> Matcher.EnemyWithId elite.id
    assertNone $ Matcher.ExhaustedEnemy <> Matcher.EnemyWithId other.id
