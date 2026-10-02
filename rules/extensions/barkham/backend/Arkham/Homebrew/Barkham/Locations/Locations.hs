module Arkham.Homebrew.Barkham.Locations.Locations where

import Arkham.Ability
import Arkham.Card (CardCode, toCardCode)
import Arkham.GameValue
import Arkham.Homebrew.Barkham.CardDefs.Locations qualified as Cards
import Arkham.Homebrew.Barkham.Helpers
import Arkham.Location.Import.Lifted
import Arkham.Location.Types (Field (..))
import Arkham.Matcher
import Arkham.Message.Lifted.Log (remember)
import Arkham.Message.Lifted.Choose
import Arkham.Message.Lifted.Move (moveTo)
import Arkham.Projection
import Arkham.Token (Token (Resource))

newtype BarkhamLocation = BarkhamLocation LocationAttrs
  deriving anyclass (IsLocation, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

beasttown :: LocationCard BarkhamLocation
beasttown = location BarkhamLocation Cards.beasttown 2 (PerPlayer 1)
tailside :: LocationCard BarkhamLocation
tailside = location BarkhamLocation Cards.tailside 3 (PerPlayer 1)
snoutside :: LocationCard BarkhamLocation
snoutside = location BarkhamLocation Cards.snoutside 1 (PerPlayer 1)
slobbertown :: LocationCard BarkhamLocation
slobbertown = location BarkhamLocation Cards.slobbertown 3 (PerPlayer 1)
barkhamAsylum :: LocationCard BarkhamLocation
barkhamAsylum = location BarkhamLocation Cards.barkhamAsylum 4 (PerPlayer 1)
boneyard :: LocationCard BarkhamLocation
boneyard = location BarkhamLocation Cards.boneyard 1 (PerPlayer 2)
muttskatonicUniversity :: LocationCard BarkhamLocation
muttskatonicUniversity = location BarkhamLocation Cards.muttskatonicUniversity 4 (PerPlayer 1)
barkhamCityPound :: LocationCard BarkhamLocation
barkhamCityPound = location BarkhamLocation Cards.barkhamCityPound 3 (PerPlayer 2)
stMarysAnimalHospital :: LocationCard BarkhamLocation
stMarysAnimalHospital = location BarkhamLocation Cards.stMarysAnimalHospital 3 (PerPlayer 2)
velmasDoghouse :: LocationCard BarkhamLocation
velmasDoghouse = location BarkhamLocation Cards.velmasDoghouse 2 (PerPlayer 2)

instance HasAbilities BarkhamLocation where
  getAbilities (BarkhamLocation a) = extendRevealed a $ case toCardCode a of
    c | c `elem` [":barkham:027", ":barkham:028", ":barkham:029", ":barkham:030"] ->
      [groupLimit PerRound $ restricted a 1 Here $ FastAbility (ResourceCost 2)]
    ":barkham:031" ->
      [ playerLimit PerGame $ restricted a 1 (Here <> exists (HealableInvestigator (a.ability 1) #horror You)) actionAbility
      , skillTestAbility $ restricted a 2 Here $ parleyAction (HorrorCost (a.ability 2) YouTarget 1)
      ]
    ":barkham:032" ->
      [ mkAbility a 1 $ freeReaction $ SkillTestResult #after You (WhileInvestigating $ be a) (SuccessResult $ atLeast 2)
      , restricted a 2 (Here <> exists (be a <> LocationWithResources (AtLeast $ PerPlayer 1))) actionAbility
      ]
    ":barkham:033" ->
      [ playerLimit PerGame $ restricted a 1 Here actionAbility
      , restricted a 2 Here $ actionAbilityWithCost $ SkillIconCost 3 (singleton #intellect)
      ]
    ":barkham:034" ->
      [ playerLimit PerGame $ restricted a 1 Here actionAbility
      , skillTestAbility $ restricted a 2 Here $ parleyAction $ ResourceCost 1
      ]
    ":barkham:035" ->
      [ playerLimit PerGame $ restricted a 1 (Here <> exists (HealableInvestigator (a.ability 1) #damage You)) actionAbility
      , skillTestAbility $ restricted a 2 Here $ parleyAction $ DamageCost (a.ability 2) YouTarget 1
      ]
    ":barkham:036" -> [skillTestAbility $ restricted a 1 Here $ parleyAction Free]
    _ -> []

instance RunMessage BarkhamLocation where
  runMessage msg l@(BarkhamLocation attrs) = runQueueT $ case msg of
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      case toCardCode attrs of
        ":barkham:027" -> selectOne (locationIs Cards.slobbertown) >>= traverse_ (moveTo (attrs.ability 1) iid)
        ":barkham:028" -> selectOne (locationIs Cards.beasttown) >>= traverse_ (moveTo (attrs.ability 1) iid)
        ":barkham:029" -> selectOne (locationIs Cards.tailside) >>= traverse_ (moveTo (attrs.ability 1) iid)
        ":barkham:030" -> selectOne (locationIs Cards.snoutside) >>= traverse_ (moveTo (attrs.ability 1) iid)
        ":barkham:031" -> healHorrorIfCan iid (attrs.ability 1) 3
        ":barkham:032" -> placeTokens (attrs.ability 1) attrs Resource 1
        ":barkham:033" -> drawCards iid (attrs.ability 1) 3
        ":barkham:034" -> gainResources iid (attrs.ability 1) 3
        ":barkham:035" -> healDamageIfCan iid (attrs.ability 1) 3
        ":barkham:036" -> do
          sid <- getRandom
          beginSkillTest sid iid (attrs.ability 1) attrs #willpower (Fixed 5)
        _ -> pure ()
      pure l
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      case toCardCode attrs of
        ":barkham:031" -> do
          sid <- getRandom
          beginSkillTest sid iid (attrs.ability 2) attrs #willpower (Fixed 4)
        ":barkham:032" -> do
          n <- field LocationResources (asId attrs)
          removeTokens (attrs.ability 2) attrs Resource n
          remember $ barkhamKey "BuriedTheBonesAFewMetersFromWhereYouFoundThem"
        ":barkham:033" -> remember $ barkhamKey "BrushedUpOnCatPhysiology"
        ":barkham:034" -> do
          sid <- getRandom
          beginSkillTest sid iid (attrs.ability 2) attrs #agility (Fixed 4)
        ":barkham:035" -> do
          sid <- getRandom
          beginSkillTest sid iid (attrs.ability 2) attrs #intellect (Fixed 4)
        _ -> pure ()
      pure l
    PassedThisSkillTest iid (isAbilitySource attrs 1 -> True) | toCardCode attrs == ":barkham:036" -> do
      remember $ barkhamKey "ScoredSomeTastyFood"
      healDamageIfCan iid (attrs.ability 1) 1
      healHorrorIfCan iid (attrs.ability 1) 1
      pure l
    PassedThisSkillTest _ (isAbilitySource attrs 2 -> True) -> do
      for_ (keyFor $ toCardCode attrs) $ remember . barkhamKey
      pure l
    _ -> BarkhamLocation <$> liftRunMessage msg attrs

keyFor :: CardCode -> Maybe Text
keyFor = \case
  ":barkham:031" -> Just "LearnedTheBarkOfTheOuterGods"
  ":barkham:034" -> Just "PossessABallOfYarn"
  ":barkham:035" -> Just "ACatHasAnAppointmentWithTheVet"
  _ -> Nothing
