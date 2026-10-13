import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "./game/types";
import { listSaves } from "./game/storage";
import {
  createSaveSession,
  isSaveStorageKey,
  readSaveSnapshot,
  SaveConflictError,
  type SaveSnapshot,
} from "./game/saveSession";

export type SaveStatus = "saved" | "saving" | "failed" | "conflict";

/** One observed version per open investigation, retained across every action. */
export function useInvestigationSave() {
  const [initial] = useState(readSaveSnapshot);
  const [game, setGame] = useState<GameState | null>(initial?.game ?? null);
  const gameRef = useRef(game);
  const confirmedGame = useRef<GameState | null>(null);
  const [initialSession] = useState(() =>
    initial ? createSaveSession(initial) : null,
  );
  const sessionRef = useRef(initialSession);
  const [status, setStatus] = useState<SaveStatus>(game ? "saving" : "saved");
  const [error, setError] = useState<unknown>(null);
  const [saves, setSaves] = useState(listSaves);

  const commitGame = useCallback((next: GameState | null) => {
    const changingCase = next?.id !== gameRef.current?.id;
    if (next && changingCase)
      sessionRef.current = createSaveSession({ game: next, revision: null });
    if (!next) sessionRef.current = null;
    gameRef.current = next;
    setStatus((current) =>
      next
        ? !changingCase && (current === "failed" || current === "conflict")
          ? current
          : "saving"
        : "saved",
    );
    if (changingCase) setError(null);
    setGame(next);
  }, []);

  const restoreGame = useCallback((snapshot: SaveSnapshot) => {
    sessionRef.current = createSaveSession(snapshot);
    gameRef.current = snapshot.game;
    setStatus("saving");
    setError(null);
    setGame(snapshot.game);
  }, []);

  const persist = useCallback(async () => {
    const current = gameRef.current;
    const session = sessionRef.current;
    if (!current || !session) return true;
    setStatus((current) =>
      current === "failed" || current === "conflict" ? current : "saving",
    );
    try {
      await session.save(current);
      if (gameRef.current === current && sessionRef.current === session) {
        confirmedGame.current = current;
        setStatus("saved");
        setError(null);
        setSaves(listSaves());
      }
      return true;
    } catch (failure) {
      if (gameRef.current === current && sessionRef.current === session) {
        setStatus(failure instanceof SaveConflictError ? "conflict" : "failed");
        setError(failure);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    if (game) void persist();
  }, [game, persist]);

  useEffect(() => {
    const refresh = () => {
      setSaves(listSaves());
      try {
        if (sessionRef.current && !sessionRef.current.isCurrent()) {
          setStatus("conflict");
          setError(new SaveConflictError());
        }
      } catch (failure) {
        setStatus("failed");
        setError(failure);
      }
    };
    const changed = (event: StorageEvent) => {
      if (isSaveStorageKey(event.key)) refresh();
    };
    window.addEventListener("storage", changed);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!gameRef.current) return;
      try {
        if (
          confirmedGame.current === gameRef.current &&
          sessionRef.current?.isCurrent()
        )
          return;
      } catch {
        // An unavailable store cannot confirm that the current turn is safe.
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);

  return {
    game,
    gameRef,
    sessionRef,
    commitGame,
    restoreGame,
    persist,
    status,
    error,
    saves,
    setSaves,
  };
}
