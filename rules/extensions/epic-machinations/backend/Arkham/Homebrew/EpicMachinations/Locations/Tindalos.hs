module Arkham.Homebrew.EpicMachinations.Locations.Tindalos (tindalosEpic) where

import Arkham.Ability
import Arkham.Card
import Arkham.Helpers.Modifiers
import Arkham.Helpers.Scenario (scenarioField, getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.CardDefs.Locations qualified as Cards
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Location.Import.Lifted
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Placement
import Arkham.Projection
import Arkham.Scenario.Types (Field (ScenarioSetAsideCards))
import Arkham.Trait (Trait (Portal))
import Data.Map.Strict qualified as Map

newtype EpicTindalos = EpicTindalos LocationAttrs
  deriving anyclass IsLocation
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

tindalosEpic :: LocationCard EpicTindalos
tindalosEpic = location EpicTindalos Cards.tindalosEpic 5 (Static 0)

instance HasModifiersFor EpicTindalos where
  getModifiersFor (EpicTindalos attrs) = do
    modifySelf attrs [ConnectedToWhen (be attrs) $ LocationWithTrait Portal]
    modifySelect attrs (not_ $ LocationWithId attrs.id) [ConnectedToWhen (LocationWithTrait Portal) $ be attrs]

instance HasAbilities EpicTindalos where
  getAbilities (EpicTindalos attrs) = extendRevealed attrs
    [restricted attrs 1 Here $ FastAbility Free,
     restricted attrs 2 (Here <> ValueIs (length (toResultDefault [] attrs.meta :: [CardId])) (GreaterThan $ Static 0)) actionAbility]

instance RunMessage EpicTindalos where
  runMessage message locationEntity@(EpicTindalos attrs) = runQueueT $ case message of
    ScenarioSpecific "epicMachinations.abducted" value -> pure $ EpicTindalos attrs {locationMeta = value}
    UseThisAbility iid (isSource attrs -> True) 1 -> do
      replica <- getMachinationsReplica
      available <- field InvestigatorClues iid
      chooseOneM iid do
        when (available > 0) $ i18nKeyLabeled "Place one of your clues on this Tindalos" $ emitMachinations $ DepositTindalosClue iid
        for_ (Map.toList replica.eraProgress) $ \(era, progress) ->
          when (progress.eraTindalosClues > 0) $ i18nKeyLabeled ("Take one clue from Tindalos in " <> tshow era) $ emitMachinations $ TakeTindalosClue iid era
        i18nKeyLabeled "Leave the clues where they are" nothing
      pure locationEntity
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      sid <- getRandom
      chooseBeginSkillTest sid iid (attrs.ability 2) iid [#combat, #agility] (Fixed 3)
      pure locationEntity
    PassedThisSkillTest iid (isAbilitySource attrs 2 -> True) -> do
      abducted <- getScenarioMetaKeyDefault "epicMachinationsAbducted" []
      cards <- filter ((`elem` abducted) . toCardId) <$> scenarioField ScenarioSetAsideCards
      focusCards cards $ chooseOneM iid $ for_ cards $ \card -> cardLabeled card do
        unfocusCards
        aid <- createAssetAt card $ AtLocation attrs.id
        exhaustThis aid
        push $ ScenarioSpecific "epicMachinations.rescued" $ toJSON $ toCardId card
      pure locationEntity
    _ -> EpicTindalos <$> liftRunMessage message attrs
