module Arkham.Homebrew.Barkham.Player.MoreBarkThanBite (moreBarkThanBite) where

import Arkham.Ability
import Arkham.Treachery.Import.Lifted
import Arkham.Homebrew.Barkham.CardDefs.Players qualified as Cards
import Arkham.Helpers.Modifiers
import Arkham.Matcher

newtype MoreBarkThanBite = MoreBarkThanBite TreacheryAttrs
  deriving anyclass IsTreachery
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

moreBarkThanBite :: TreacheryCard MoreBarkThanBite
moreBarkThanBite = treachery MoreBarkThanBite Cards.moreBarkThanBite

instance HasModifiersFor MoreBarkThanBite where
  getModifiersFor (MoreBarkThanBite a) = inThreatAreaGets a [SkillModifier #combat (-3)]

instance HasAbilities MoreBarkThanBite where
  getAbilities (MoreBarkThanBite a) =
    [ restricted a 1 (InThreatAreaOf You) $ forced $ IfEnemyDefeated #after You ByAny AnyEnemy ]

instance RunMessage MoreBarkThanBite where
  runMessage msg t@(MoreBarkThanBite a) = runQueueT $ case msg of
    Revelation iid (isSource a -> True) -> placeInThreatArea a iid >> pure t
    UseThisAbility iid (isSource a -> True) 1 -> toDiscardBy iid (a.ability 1) a >> pure t
    _ -> MoreBarkThanBite <$> liftRunMessage msg a
