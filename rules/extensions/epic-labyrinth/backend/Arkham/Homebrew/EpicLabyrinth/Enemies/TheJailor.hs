module Arkham.Homebrew.EpicLabyrinth.Enemies.TheJailor (theJailor) where

import Arkham.Ability
import Arkham.Action (Action (Fight))
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.Card
import Arkham.Enemy.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Enemy.Import.Lifted
import Arkham.Fight.Types (ChooseFight (..))
import Arkham.Helpers.Query (getLead)
import Arkham.Homebrew.EpicLabyrinth.Helpers
import {-# SOURCE #-} Arkham.Homebrew.EpicLabyrinth.Stories.NativeAssets (getNativeEnemy, getNativeAttachments)
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.History (HistoryItem (..), HistoryField (HistorySuccessfulAttacks))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Message.Lifted.Placement (place)
import Arkham.Placement
import Arkham.SkillTest.Option (SkillTestOption (..), SkillTestOptionKind (OriginalOptionKind))
import Arkham.Zone (OutOfPlayZone (SetAsideZone))

newtype TheJailor = TheJailor EnemyAttrs
  deriving anyclass (IsEnemy, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

data JailorMemory = JailorMemory { awaitsRoundEnd :: Bool }
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

theJailor :: EnemyCard TheJailor
theJailor = enemy TheJailor Cards.theJailor
  & setSpawnAt (NearestLocationToYou $ LocationWithTitle "Labyrinthine Halls")

instance HasAbilities TheJailor where
  getAbilities (TheJailor attrs) = extend attrs
    [ fightAbility (proxied (assetIs Assets.eixodolonsNote) attrs) 1 mempty ControlsThis
    | attrs.placement.isInPlay
    ]

instance RunMessage TheJailor where
  runMessage message card@(TheJailor attrs) = runQueueT $ case message of
    UseThisAbility iid source@(isProxySource attrs -> True) 1 -> do
      sid <- getRandom
      chooseOneM iid $ for_ [#willpower, #combat] \skill ->
        i18nKeyLabeled ("Fight The Jailor using " <> tshow skill) $
          chooseFightEnemyMatchEdit sid iid (toAbilitySource source 1) (be attrs)
            (\fight -> fight {chooseFightSkillType = skill})
      pure card
    PassedSkillTest iid (Just Fight) (isProxyAbilitySource attrs 1 -> True) _ _ _ -> do
      push $ SkillTestResultOption $ SkillTestOption
        { option = Label "Set The Jailor aside, keeping its tokens and attachments"
            [ UpdateHistory iid $ HistoryItem HistorySuccessfulAttacks 1
            , SendMessage (toTarget attrs) $ ScenarioSpecific "epicLabyrinth.jailorSetAside" Null
            ]
        , kind = OriginalOptionKind
        , criteria = Nothing
        }
      pure card
    SendMessage target (ScenarioSpecific "epicLabyrinth.jailorSetAside" _) | isTarget attrs target -> do
      place attrs $ OutOfPlay SetAsideZone
      pure $ TheJailor attrs {enemyMeta = toJSON $ JailorMemory True}
    EndRound | Just (JailorMemory True) <- maybeResult attrs.meta -> do
      origin <- getEpicGroup
      enemy <- getNativeEnemy attrs.id
      attachments <- getNativeAttachments $ toTarget attrs
      let ready = overAttrs (\a -> a {enemyMeta = toJSON $ JailorMemory False}) enemy
          snapshot = EntitySnapshot
            { snapshotKind = Jailor
            , snapshotCardId = toCardId enemy
            , snapshotCardCode = toCardCode enemy
            , snapshotOwner = Nothing
            , snapshotOwnerGroup = Nothing
            , snapshotController = Nothing
            , snapshotAttachments = setFromList $ map fst attachments
            , snapshotAttachedEntities = map snd attachments
            , snapshotNative = toJSON ready
            }
      lead <- getLead
      chooseOneM lead $ for_ (filter (/= origin) allGroups) \destination -> do
        i18nKeyLabeled ("Move The Jailor and all its tokens and attachments to " <> tshow destination) do
          pid <- ParcelId <$> getId
          emitOperation $ SendParcel $ Parcel pid origin destination Nothing Nothing MoveJailor
            emptyCargo {cargoEntities = [snapshot]}
      pure $ TheJailor attrs {enemyMeta = toJSON $ JailorMemory False}
    _ -> TheJailor <$> liftRunMessage message attrs
