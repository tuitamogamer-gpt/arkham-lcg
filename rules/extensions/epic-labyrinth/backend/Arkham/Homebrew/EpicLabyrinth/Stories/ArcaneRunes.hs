module Arkham.Homebrew.EpicLabyrinth.Stories.ArcaneRunes (arcaneRunes) where

import Arkham.Ability
import Arkham.Asset.Cards.Standalone qualified as Assets
import Arkham.GameValue
import Arkham.Helpers.Query
import Arkham.Homebrew.EpicLabyrinth.Helpers
import Arkham.Homebrew.EpicLabyrinth.Stories.Shared
import Arkham.Homebrew.EpicLabyrinth.Types
import Arkham.Investigator.Types (Field (InvestigatorClues))
import Arkham.Location.Types (Field (LocationClues))
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Modifier
import Arkham.Projection
import Arkham.Placement
import Arkham.Story.CardDefs.TheLabyrinthsOfLunacy qualified as Cards
import Arkham.Story.Import.Lifted
import Arkham.Story.Types (StoryAttrs (..))
import Arkham.Token
import Data.Map.Strict qualified as Map

newtype ArcaneRunes = ArcaneRunes StoryAttrs
  deriving anyclass (IsStory, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

arcaneRunes :: StoryCard ArcaneRunes
arcaneRunes = story ArcaneRunes Cards.arcaneRunes & persistStory

instance HasAbilities ArcaneRunes where
  getAbilities (ArcaneRunes a) =
    [ restricted a 1 OnSameLocation actionAbility
    , restricted a 3 (ValueIs (a.token Resource) $ GreaterThanOrEqualTo $ PerPlayer 1) $ FastAbility Free
    ] <> [restricted a 2 OnSameLocation actionAbility | decodedOwnRunes (memory a)]

instance RunMessage ArcaneRunes where
  runMessage msg s@(ArcaneRunes a) = runQueueT $ case msg of
    _ | Just iid <- readInvestigator a msg -> attachToDistortion iid a True >> pure s
    _ | Just (PlaceStoryAt placement) <- commandFor a msg -> pure $ ArcaneRunes a {storyPlacement = placement}
    UseThisAbility iid (isSource a -> True) index | index `elem` [1, 2] -> do
      sid <- getRandom
      when (index == 2) $ skillTestModifier sid (a.ability 2) iid (CannotCommitCards AnyCard)
      beginSkillTest sid iid (a.ability index) iid #intellect (Fixed 3)
      pure s
    PassedThisSkillTest _ (isAbilitySource a 1 -> True) -> do
      emitOperation DecodeRunes
      pure $ ArcaneRunes $ remember ((memory a) {decodedOwnRunes = True}) a
    PassedThisSkillTest iid (isAbilitySource a 2 -> True) -> do
      group <- getEpicGroup
      chooseOneM iid $ for_ (filter (/= group) allGroups) \destination ->
        i18nKeyLabeled ("Place 1 resource on " <> tshow destination <> "'s Arcane Runes") $ emitOperation $ AidRunes destination
      pure s
    UseThisAbility _ (isSource a -> True) 3 -> emitOperation ResolveRunes >> pure s
    _ | Just (SetRuneResources amount, updated) <- newDelivery a msg ->
      pure $ ArcaneRunes updated {storyTokens = Map.insert Resource amount updated.tokens}
    _ | Just (ResolveRuneReward, updated) <- newDelivery a msg -> do
      group <- getEpicGroup
      lead <- getLead
      case group of
        GroupA -> do
          chamber <- selectJust $ LocationWithTitle "Chamber of Secrets"
          withSetAsideCard Assets.keyOfMysteries $ \key -> void $ createAssetAt key $ AtLocation chamber
        GroupB -> push $ storyCommand updated $ TradeClues lead
        GroupC -> do
          replica <- getEpicReplica
          for_ (replicaSecretChamber replica) $ \chamber ->
            chooseOne lead [CardLabel chamber True []]
      pure $ ArcaneRunes updated
    _ | Just (TradeClues lead) <- commandFor a msg -> do
      donors <- select $ InvestigatorWithClues $ GreaterThan $ Static 0
      chooseOneM lead do
        i18nKeyLabeled "Finish trading clues and move chamber clues" $ push $ storyCommand a $ MoveChamberClues lead
        targets donors \donor -> do
          recipients <- select $ not_ $ InvestigatorWithId donor
          chooseOneM donor do
            i18nKeyLabeled "Keep my clues" $ push $ storyCommand a $ TradeClues lead
            targets recipients \recipient -> do
              amount <- field InvestigatorClues donor
              chooseOneM donor do
                i18nKeyLabeled "Keep my clues" $ push $ storyCommand a $ TradeClues lead
                for_ [1 .. amount] \n ->
                  i18nKeyLabeled ("Give " <> tshow n <> " clue(s)") $ push $ storyCommand a $ TradeClueAmount lead donor recipient n
      pure s
    _ | Just (TradeClueAmount lead donor recipient amount) <- commandFor a msg -> do
      available <- field InvestigatorClues donor
      when (amount > 0 && amount <= available) $ moveTokens a donor recipient Clue amount
      push $ storyCommand a $ TradeClues lead
      pure s
    _ | Just (MoveChamberClues lead) <- commandFor a msg -> do
      rain <- selectJust $ LocationWithTitle "Chamber of Rain"
      sorrows <- selectJust $ LocationWithTitle "Chamber of Sorrows"
      rainClues <- field LocationClues rain
      sorrowsClues <- field LocationClues sorrows
      chooseOneM lead do
        i18nKeyLabeled "Keep chamber clues where they are" nothing
        for_ [(rain, sorrows, rainClues), (sorrows, rain, sorrowsClues)] \(from, to, amount) ->
          for_ [1 .. amount] \n -> i18nKeyLabeled
            ("Move " <> tshow n <> " clue(s) from " <> (if from == rain then "Rain to Sorrows" else "Sorrows to Rain"))
            $ push $ storyCommand a $ MoveChamberClueAmount lead from to n
      pure s
    _ | Just (MoveChamberClueAmount _ from to amount) <- commandFor a msg -> do
      available <- field LocationClues from
      when (amount > 0 && amount <= available) $ moveTokens a from to Clue amount
      pure s
    _ -> ArcaneRunes <$> liftRunMessage msg a
