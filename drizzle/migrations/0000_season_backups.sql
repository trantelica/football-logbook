CREATE TABLE public.season_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  season_id text NOT NULL,
  season_label text NOT NULL,
  game_count integer NOT NULL DEFAULT 0,
  package jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.season_backups TO authenticated;
GRANT ALL ON public.season_backups TO service_role;
ALTER TABLE public.season_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own backups select" ON public.season_backups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own backups insert" ON public.season_backups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own backups delete" ON public.season_backups FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX season_backups_user_created ON public.season_backups (user_id, created_at DESC);