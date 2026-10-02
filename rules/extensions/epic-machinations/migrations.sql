BEGIN;
CREATE TABLE IF NOT EXISTS chronicle_machinations_events (
  event_id uuid PRIMARY KEY REFERENCES arkham_epic_events(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chronicle_machinations_journal (
  event_id uuid NOT NULL REFERENCES arkham_epic_events(id) ON DELETE CASCADE,
  origin_game_id uuid NOT NULL REFERENCES arkham_games(id) ON DELETE CASCADE,
  origin_step integer NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_game_id, origin_step)
);
COMMIT;
