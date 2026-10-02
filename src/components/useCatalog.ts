import { useEffect, useState } from "react";
import { cachedCatalogCards, loadCatalogCards } from "../game/catalog";
import type { Card } from "../game/types";

export function useCatalog() {
  const [cards, setCards] = useState<Card[]>(() => cachedCatalogCards() || []);
  const [loading, setLoading] = useState(!cachedCatalogCards());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadCatalogCards()
      .then((loaded) => {
        if (active) {
          setCards(loaded);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The collection could not be loaded.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return { cards, loading, error, retry: () => setAttempt((n) => n + 1) };
}
