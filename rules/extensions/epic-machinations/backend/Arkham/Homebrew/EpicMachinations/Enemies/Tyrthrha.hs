module Arkham.Homebrew.EpicMachinations.Enemies.Tyrthrha (tyrthrha) where

import Arkham.Ability
import Arkham.GameT (GameT)
import Arkham.Queue (QueueT)
import Arkham.Card (toCardId, cbCardBuilder)
import Arkham.Enemy.Cards.MachinationsThroughTime.Tyrthrha qualified as Native
import Arkham.Enemy.CardDefs.MachinationsThroughTime qualified as Cards
import Arkham.Enemy.Import.Lifted
import Arkham.Helpers.Location (withLocationOf)
import Arkham.Helpers.Modifiers (ModifierType (..), modifySelf)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicLabyrinth.Helpers (deliveryWasApplied, markDeliveryApplied)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Matcher
import Arkham.Scenarios.MachinationsThroughTime.Helpers (abductById)
import Arkham.Token qualified as Token
import Arkham.Trait (Trait (Scientist), toTraits)

newtype Tyrthrha = Tyrthrha EnemyAttrs
  deriving anyclass IsEnemy
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

tyrthrha :: EnemyCard Tyrthrha
tyrthrha = enemy Tyrthrha Cards.tyrthrha

native attrs = overAttrs (const attrs) $ cbCardBuilder Native.tyrthrha attrs.cardId attrs.id

instance HasModifiersFor Tyrthrha where
  getModifiersFor (Tyrthrha attrs) = do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if not epic then getModifiersFor $ native attrs else do
      maximum <- tyrthrhaMaxHealth <$> getMachinationsReplica
      modifySelf attrs [HealthModifier maximum]

instance HasAbilities Tyrthrha where
  getAbilities (Tyrthrha attrs) = extend1 attrs $ mkAbility attrs 1 $ forced $
    EnemyEnters #when (LocationWithAsset $ AssetWithTrait Scientist) (be attrs)

instance RunMessage Tyrthrha where
  runMessage message card@(Tyrthrha attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if epic then runEpic message card else Tyrthrha . toAttrs <$> liftRunMessage message (native attrs)

runEpic :: Message -> Tyrthrha -> QueueT Message GameT Tyrthrha
runEpic message card@(Tyrthrha attrs) = case message of
    UseThisAbility _ (isSource attrs -> True) 1 -> do
      withLocationOf attrs $ \lid -> selectEach (AssetWithTrait Scientist <> AssetAt (LocationWithId lid)) abductById
      pure card
    -- AssignedDamage reports the amount after native damage modifiers. It is
    -- emitted once by the native Damaged handler before its defeat check.
    AssignedDamage (isTarget attrs -> True) n _ -> do
      when (n > 0) $ emitMachinations $ DamageTyrthrha n
      Tyrthrha <$> liftRunMessage message attrs
    Do (PlaceTokens _ (isTarget attrs -> True) Token.Damage n) -> do
      updated <- liftRunMessage message attrs
      when (n > 0) $ emitMachinations $ DamageTyrthrha n
      pure $ Tyrthrha updated
    HealDamage (isTarget attrs -> True) _ n -> do
      updated <- liftRunMessage message attrs
      when (n > 0) $ emitMachinations $ HealTyrthrha $ min n attrs.damage
      pure $ Tyrthrha updated
    HealAllDamage (isTarget attrs -> True) _ -> do
      updated <- liftRunMessage message attrs
      when (attrs.damage > 0) $ emitMachinations $ HealTyrthrha attrs.damage
      pure $ Tyrthrha updated
    RemoveTokens _ (isTarget attrs -> True) Token.Damage n -> do
      updated <- liftRunMessage message attrs
      when (n > 0) $ emitMachinations $ HealTyrthrha $ min n attrs.damage
      pure $ Tyrthrha updated
    ScenarioSpecific "epicMachinations.delivery" value
      | Just envelope <- maybeResult @MachinationsEnvelope value
      , SetTyrthrhaRemaining remaining <- envelope.machinationsDeliveryBody
      , not $ deliveryWasApplied envelope.machinationsDeliveryId attrs.meta -> do
          maximum <- tyrthrhaMaxHealth <$> getMachinationsReplica
          when (remaining <= 0 && not attrs.defeated) $
            push $ Defeated (toTarget attrs) (toCardId attrs) GameSource $ setToList $ toTraits attrs
          pure $ Tyrthrha attrs
            { enemyTokens = Token.setTokens Token.Damage (max 0 $ maximum - remaining) attrs.tokens
            , enemyMeta = markDeliveryApplied envelope.machinationsDeliveryId attrs.meta
            }
    _ -> Tyrthrha <$> liftRunMessage message attrs
