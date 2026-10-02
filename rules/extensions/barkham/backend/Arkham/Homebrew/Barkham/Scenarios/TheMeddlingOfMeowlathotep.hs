module Arkham.Homebrew.Barkham.Scenarios.TheMeddlingOfMeowlathotep (theMeddlingOfMeowlathotep) where

import Arkham.Card (setFacedown)
import Arkham.Helpers.Query
import Arkham.Homebrew.Barkham.CardDefs.Acts qualified as Acts
import Arkham.Homebrew.Barkham.CardDefs.Agendas qualified as Agendas
import Arkham.Homebrew.Barkham.CardDefs.Enemies qualified as Enemies
import Arkham.Homebrew.Barkham.CardDefs.Locations qualified as Locations
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Homebrew.Barkham.Sets qualified as Set
import Arkham.Homebrew.Barkham.Traits
import Arkham.I18n (withI18n)
import Arkham.Investigator.Types (Field (..))
import Arkham.Matcher
import Arkham.Projection
import Arkham.Resolution
import Arkham.Scenario.Import.Lifted

newtype TheMeddlingOfMeowlathotep = TheMeddlingOfMeowlathotep ScenarioAttrs
  deriving stock Generic
  deriving anyclass (IsScenario, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

theMeddlingOfMeowlathotep :: Difficulty -> TheMeddlingOfMeowlathotep
theMeddlingOfMeowlathotep difficulty = sideStory TheMeddlingOfMeowlathotep ":barkham:022" "The Meddling of Meowlathotep" difficulty
  [ ". . barkhamAsylum velmasDoghouse"
  , ". tailside beasttown barkhamCityPound"
  , "muttskatonicUniversity snoutside slobbertown ."
  , "stMarysAnimalHospital boneyard . ."
  ]

instance HasChaosTokenValue TheMeddlingOfMeowlathotep where
  getChaosTokenValue iid face (TheMeddlingOfMeowlathotep attrs) = case face of
    Skull -> do
      n <- countMeowsks
      pure $ ChaosTokenValue Skull (NegativeModifier $ if isEasyStandard attrs then (n + 1) `div` 2 else n)
    Cultist -> pure $ ChaosTokenValue Cultist (NegativeModifier 2)
    Tablet -> pure $ ChaosTokenValue Tablet (NegativeModifier 2)
    ElderThing -> pure $ toChaosTokenValue attrs ElderThing 5 7
    _ -> getChaosTokenValue iid face attrs

instance RunMessage TheMeddlingOfMeowlathotep where
  runMessage msg s@(TheMeddlingOfMeowlathotep attrs) = runQueueT $ case msg of
    PreScenarioSetup -> do
      -- All seven printed intro nodes and four outcomes stay explicit choices.
      -- Only investigators from this standalone universe are eligible.
      codes <- traverse (field InvestigatorCardCode) =<< select Anyone
      unless (all (`elem` [":barkham:001", ":barkham:004", ":barkham:007", ":barkham:010", ":barkham:013"]) codes)
        $ error "The Meddling of Meowlathotep requires Barkham investigators"
      lead <- getLead
      chooseOne lead
        [ Label "Follow the foul stench" [DoStep 2 PreScenarioSetup]
        , Label "Follow the scent of bacon" [DoStep 3 PreScenarioSetup]
        ]
      pure s
    DoStep 2 PreScenarioSetup -> do
      lead <- getLead
      chooseOne lead
        [ Label "Confront the retching cat — begin in Slobbertown" [DoStep 4 PreScenarioSetup]
        , Label "Track the cat to its lair — begin in Snoutside" [DoStep 5 PreScenarioSetup]
        ]
      pure s
    DoStep 3 PreScenarioSetup -> do
      lead <- getLead
      chooseOne lead
        [ Label "Enjoy the food — begin in Beasttown" [DoStep 6 PreScenarioSetup]
        , Label "Continue the investigation — begin in Tailside" [DoStep 7 PreScenarioSetup]
        ]
      pure s
    DoStep n PreScenarioSetup | n `elem` [4, 5, 6, 7] ->
      pure $ TheMeddlingOfMeowlathotep $ setMetaKey "barkhamStart" n attrs
    Setup -> runScenarioSetup TheMeddlingOfMeowlathotep attrs do
      gather Set.TheMeddlingOfMeowlathotep
      let defs =
            [ Locations.beasttown, Locations.tailside, Locations.snoutside, Locations.slobbertown
            , Locations.barkhamAsylum, Locations.boneyard, Locations.muttskatonicUniversity
            , Locations.barkhamCityPound, Locations.stMarysAnimalHospital, Locations.velmasDoghouse
            ]
      lids <- placeAllCapture defs
      for_ (zip
        [ "beasttown", "tailside", "snoutside", "slobbertown", "barkhamAsylum"
        , "boneyard", "muttskatonicUniversity", "barkhamCityPound", "stMarysAnimalHospital", "velmasDoghouse"
        ] lids) \(label, lid) -> push $ SetLocationLabel lid label
      let startIndex = case getMetaKeyDefault "barkhamStart" 4 attrs of
            4 -> 3
            5 -> 2
            6 -> 0
            _ -> 1
      startAt $ fromJustNote "Barkham setup must create all ten locations" (lids !!? startIndex)
      cats <- shuffleM =<< traverse (setFacedown True) =<< fromGathered (CardWithTrait Meowsk)
      -- One randomly chosen Meowsk is removed unseen, preserving hidden identity.
      for_ (zip (drop 4 lids) (drop 1 cats)) \(lid, cat) -> placeUnderneath lid [cat]
      setAside [Enemies.meowlathotep]
      setAgendaDeck [Agendas.ofCatsAndDogs, Agendas.meowlathotepsScheme]
      setActDeck [Acts.nineLives, Acts.theCatAndTheMouse]
    StandaloneSetup -> do
      let symbols = [Skull, Skull, Cultist, Tablet, ElderThing, AutoFail, ElderSign]
          numeric = case attrs.difficulty of
            Easy -> [PlusOne, PlusOne, Zero, Zero, Zero, MinusOne, MinusOne, MinusOne, MinusTwo, MinusTwo]
            Standard -> [PlusOne, Zero, Zero, MinusOne, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusFour]
            Hard -> [Zero, Zero, Zero, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusThree, MinusFour, MinusFive]
            Expert -> [Zero, MinusOne, MinusOne, MinusTwo, MinusTwo, MinusThree, MinusThree, MinusFour, MinusFour, MinusFive, MinusSix, MinusEight]
      push $ SetChaosTokens (numeric <> symbols)
      pure s
    ResolveChaosToken _ Cultist iid | isHardExpert attrs -> do
      doomNearestEnemy iid attrs
      pure s
    ResolveChaosToken _ Tablet iid | isHardExpert attrs -> do
      placeCluesOnLocation iid attrs 1
      pure s
    FailedSkillTestWithToken iid Cultist | isEasyStandard attrs -> do
      doomNearestEnemy iid attrs
      pure s
    FailedSkillTestWithToken iid Tablet | isEasyStandard attrs -> do
      placeCluesOnLocation iid attrs 1
      pure s
    ScenarioResolution NoResolution -> do
      push R2
      pure s
    ScenarioResolution (Resolution n) | n `elem` [1, 2] -> do
      withI18n $ scope "barkham" $ scope "theMeddlingOfMeowlathotep" $ scope "resolutions" $
        resolution (if n == 1 then "resolution1" else "resolution2")
      -- The standalone guide awards no XP, trauma or campaign continuation.
      endOfScenario
      pure s
    _ -> TheMeddlingOfMeowlathotep <$> liftRunMessage msg attrs
