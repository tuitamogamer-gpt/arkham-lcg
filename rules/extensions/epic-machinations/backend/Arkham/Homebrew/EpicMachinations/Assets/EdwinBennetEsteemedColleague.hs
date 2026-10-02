module Arkham.Homebrew.EpicMachinations.Assets.EdwinBennetEsteemedColleague (edwinBennetEsteemedColleague) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Cards
import Arkham.Asset.Import.Lifted
import Arkham.Card
import Arkham.Helpers.Window (cardDrawn)
import Arkham.Helpers.Query (getLead)
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype EdwinBennetEsteemedColleague = EdwinBennetEsteemedColleague AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

edwinBennetEsteemedColleague :: AssetCard EdwinBennetEsteemedColleague
edwinBennetEsteemedColleague = ally EdwinBennetEsteemedColleague Cards.edwinBennetEsteemedColleague (2, 2)

instance HasAbilities EdwinBennetEsteemedColleague where
  getAbilities (EdwinBennetEsteemedColleague attrs) =
    [ mkAbility attrs 1 $ forced $ Exhausts #after Anyone $ TargetIs $ toTarget attrs
    , reactionAbility attrs 2 (exhaust attrs)
        (DrawCard #when You (CanCancelAllEffects You $ basic IsEncounterCard) EncounterDeck)
        OnSameLocation
    ]

instance RunMessage EdwinBennetEsteemedColleague where
  runMessage message card@(EdwinBennetEsteemedColleague attrs) = runQueueT $ case message of
    UseThisAbility _ (isSource attrs -> True) 1 -> do
      lead <- getLead
      investigators <- select UneliminatedInvestigator
      chooseTargetM lead investigators $ \iid -> drawEncounterCard iid $ attrs.ability 1
      pure card
    UseCardAbility _ (isSource attrs -> True) 2 (cardDrawn -> drawn) _ -> do
      cancelCardDraw (attrs.ability 2) drawn
      case drawn of
        EncounterCard encounter -> push $ AddToEncounterDiscard encounter
        _ -> pure ()
      pure card
    SendMessage target (ScenarioSpecific "epicMachinations.redeemedEdwin" value)
      | isTarget attrs target, Just (tokens, exhausted) <- maybeResult value ->
          pure $ EdwinBennetEsteemedColleague attrs {assetTokens = tokens, assetExhausted = exhausted}
    _ -> EdwinBennetEsteemedColleague <$> liftRunMessage message attrs
