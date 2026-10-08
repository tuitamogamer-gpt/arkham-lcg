module Arkham.Homebrew.EpicMachinations.Locations.EraEffects where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Card
import Arkham.Classes.Query (withMatch)
import Arkham.GameT (GameT)
import Arkham.Helpers.Scenario (getScenarioMetaKeyDefault)
import Arkham.Homebrew.EpicMachinations.Helpers
import Arkham.Homebrew.EpicMachinations.Types
import Arkham.Location.Cards.MachinationsThroughTime.ArkhamAdvertiserFuture qualified as Advertiser
import Arkham.Location.Cards.MachinationsThroughTime.ChildhoodHome qualified as Home
import Arkham.Location.Cards.MachinationsThroughTime.MiskatonicUniversityFuture qualified as FutureUniversity
import Arkham.Location.Cards.MachinationsThroughTime.OMalleysWatchShop qualified as Shop
import Arkham.Location.Cards.MachinationsThroughTime.RiverDocksFuture qualified as FutureDocks
import Arkham.Location.Cards.MachinationsThroughTime.RiverDocksPast qualified as PastDocks
import Arkham.Location.Cards.MachinationsThroughTime.RiverDocksPresent qualified as PresentDocks
import Arkham.Location.Cards.MachinationsThroughTime.TickTockClubFuture qualified as FutureClub
import Arkham.Location.Cards.MachinationsThroughTime.TickTockClubPresent qualified as PresentClub
import Arkham.Location.Import.Lifted
import Arkham.Location.Types (Location (..), toLocation)
import Arkham.Matcher
import Arkham.Message.Lifted.Choose
import Arkham.Queue (QueueT)
import Arkham.Token qualified as Token

-- The native definitions retain their printed costs, limits and local effects.
-- These runners route only the effects naming a different era through the
-- authoritative event instead of searching the current group's location map.
newtype EraEffectLocation = EraEffectLocation LocationAttrs
  deriving anyclass IsLocation
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

-- cards-discover registers one named builder per signature.
riverDocksPast :: LocationCard EraEffectLocation
riverDocksPast = EraEffectLocation . toAttrs <$> PastDocks.riverDocksPast
riverDocksPresent :: LocationCard EraEffectLocation
riverDocksPresent = EraEffectLocation . toAttrs <$> PresentDocks.riverDocksPresent
riverDocksFuture :: LocationCard EraEffectLocation
riverDocksFuture = EraEffectLocation . toAttrs <$> FutureDocks.riverDocksFuture
oMalleysWatchShop :: LocationCard EraEffectLocation
oMalleysWatchShop = EraEffectLocation . toAttrs <$> Shop.oMalleysWatchShop
childhoodHome :: LocationCard EraEffectLocation
childhoodHome = EraEffectLocation . toAttrs <$> Home.childhoodHome
arkhamAdvertiserFuture :: LocationCard EraEffectLocation
arkhamAdvertiserFuture = EraEffectLocation . toAttrs <$> Advertiser.arkhamAdvertiserFuture
miskatonicUniversityFuture :: LocationCard EraEffectLocation
miskatonicUniversityFuture = EraEffectLocation . toAttrs <$> FutureUniversity.miskatonicUniversityFuture
tickTockClubPresent :: LocationCard EraEffectLocation
tickTockClubPresent = EraEffectLocation . toAttrs <$> PresentClub.tickTockClubPresent
tickTockClubFuture :: LocationCard EraEffectLocation
tickTockClubFuture = EraEffectLocation . toAttrs <$> FutureClub.tickTockClubFuture

nativeAt :: IsLocation a => LocationCard a -> LocationAttrs -> Location
nativeAt builder attrs = toLocation $ overAttrs (const attrs) $ cbCardBuilder builder attrs.cardId attrs.id

nativeLocation :: LocationAttrs -> Location
nativeLocation attrs = case toCardCode attrs of
  "87008" -> nativeAt Shop.oMalleysWatchShop attrs
  "87009" -> nativeAt PastDocks.riverDocksPast attrs
  "87011" -> nativeAt Home.childhoodHome attrs
  "87017" -> nativeAt PresentClub.tickTockClubPresent attrs
  "87018" -> nativeAt PresentDocks.riverDocksPresent attrs
  "87025" -> nativeAt Advertiser.arkhamAdvertiserFuture attrs
  "87026" -> nativeAt FutureClub.tickTockClubFuture attrs
  "87027" -> nativeAt FutureDocks.riverDocksFuture attrs
  "87028" -> nativeAt FutureUniversity.miskatonicUniversityFuture attrs
  _ -> error "Unexpected cross-era location"

runNativeLocation :: Message -> LocationAttrs -> QueueT Message GameT LocationAttrs
runNativeLocation message attrs = case nativeLocation attrs of
  Location native -> toAttrs <$> liftRunMessage message native

instance HasAbilities EraEffectLocation where
  getAbilities (EraEffectLocation attrs) = getAbilities $ nativeLocation attrs

instance HasModifiersFor EraEffectLocation where
  getModifiersFor (EraEffectLocation attrs) = getModifiersFor $ nativeLocation attrs

instance RunMessage EraEffectLocation where
  runMessage message entity@(EraEffectLocation attrs) = runQueueT do
    epic <- getScenarioMetaKeyDefault "epicMultiplayer" False
    if not epic then EraEffectLocation <$> runNativeLocation message attrs
    else case message of
      UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "87009" -> do
        chooseOneM iid do
          i18nKeyLabeled "Send a shipment to the Present River Docks" $
            emitMachinations $ SendLocationToken PresentEra "87018" Token.Shipment 1
          i18nKeyLabeled "Send a shipment to the Future River Docks" $
            emitMachinations $ SendLocationToken FutureEra "87027" Token.Shipment 1
        pure entity
      UseThisAbility _ (isSource attrs -> True) 2 | toCardCode attrs == "87018" -> do
        emitMachinations $ SendLocationToken FutureEra "87027" Token.Shipment 1
        pure entity
      UseThisAbility _ (isSource attrs -> True) 2 | toCardCode attrs == "87027" -> do
        emitMachinations $ SendLocationToken PresentEra "87018" Token.Shipment 1
        pure entity
      UseThisAbility _ (isSource attrs -> True) 1 | toCardCode attrs == "87028" -> do
        emitMachinations $ SendLocationToken PastEra "87010" Token.Seed 1
        pure entity
      UseThisAbility _ (isSource attrs -> True) 1 | toCardCode attrs == "87026" -> do
        emitMachinations $ SendLocationToken PastEra "87008" Token.Time 1
        pure entity
      UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "87008" -> do
        agenda <- selectJust AnyAgenda
        removeDoom (attrs.ability 1) agenda 1
        withMatch (assetIs Assets.thomasCorriganPast <> AssetAt (be attrs) <> #ready) $ \thomas ->
          chooseOneM iid do
            i18nKeyLabeled "Exhaust Thomas Corrigan to place a time token at the Present Tick-Tock Club" do
              exhaustThis thomas
              emitMachinations $ SendLocationToken PresentEra "87017" Token.Time 1
            i18nKeyLabeled "Leave Thomas Corrigan ready" nothing
        pure entity
      UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "87017" -> do
        agenda <- selectJust AnyAgenda
        removeDoom (attrs.ability 1) agenda 1
        withMatch (AssetWithTitle "Thomas Corrigan" <> AssetAt (be attrs) <> #ready) $ \thomas ->
          chooseOneM iid do
            i18nKeyLabeled "Exhaust Thomas Corrigan to place a time token at the Future Tick-Tock Club" do
              exhaustThis thomas
              emitMachinations $ SendLocationToken FutureEra "87026" Token.Time 1
            i18nKeyLabeled "Leave Thomas Corrigan ready" nothing
        pure entity
      UseThisAbility _ (isSource attrs -> True) 2 | toCardCode attrs == "87011" -> do
        emitMachinations $ SendLocationToken FutureEra "87029" Token.TimeCapsule 1
        pure entity
      UseThisAbility iid (isSource attrs -> True) 1 | toCardCode attrs == "87025" -> do
        chooseOneM iid $ for_ [(PastEra, "87007"), (PresentEra, "87016"), (FutureEra, "87025")] $ \(era, code) ->
          i18nKeyLabeled ("Place a newspaper token in " <> tshow era) $
            emitMachinations $ SendLocationToken era code Token.Newspaper 1
        pure entity
      _ -> EraEffectLocation <$> runNativeLocation message attrs
