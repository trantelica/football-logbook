/**
 * Cloud Backup — signed-in, owner-only copies of season packages.
 *
 * The browser stays the working copy. Backups are append-only snapshots; a
 * restore is handed back to the caller, which runs the same validate →
 * confirm → import-as-new-season path as a season file. Nothing is
 * overwritten.
 */
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { buildSeasonPackageExport } from "@/engine/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface BackupRow {
  id: string;
  season_label: string;
  game_count: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSeason: { seasonId: string; label: string } | null;
  onRestore: (payload: unknown) => void;
}

export function CloudBackupDialog({ open, onOpenChange, activeSeason, onRestore }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<BackupRow[]>([]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    supabase.auth.getUser().then(({ data: d }) => setUser(d.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadBackups = useCallback(async () => {
    const { data, error } = await supabase
      .from("season_backups")
      .select("id, season_label, game_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error("Couldn't load your backups");
    else setBackups(data ?? []);
  }, []);

  useEffect(() => {
    if (open && user) void loadBackups();
  }, [open, user, loadBackups]);

  const signIn = async (mode: "in" | "up") => {
    setBusy(true);
    const res =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
    setBusy(false);
    if (res.error) toast.error(res.error.message);
    else if (mode === "up" && !res.data.session) toast.success("Check your email to confirm, then sign in");
  };

  const google = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Google sign-in failed");
  };

  const backUpNow = async () => {
    if (!activeSeason || !user) return;
    setBusy(true);
    try {
      const pkg = await buildSeasonPackageExport(activeSeason.seasonId);
      const { error } = await supabase.from("season_backups").insert({
        user_id: user.id,
        season_id: activeSeason.seasonId,
        season_label: activeSeason.label,
        game_count: Array.isArray((pkg as { games?: unknown[] }).games)
          ? (pkg as { games: unknown[] }).games.length
          : 0,
        package: JSON.parse(JSON.stringify(pkg)),
      });
      if (error) throw error;
      toast.success("Season backed up");
      await loadBackups();
    } catch {
      toast.error("Backup failed — your data is still safe in this browser");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    const { data, error } = await supabase.from("season_backups").select("package").eq("id", id).single();
    if (error || !data) {
      toast.error("Couldn't download that backup");
      return;
    }
    onOpenChange(false);
    onRestore(data.package);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Cloud Backup</DialogTitle>
        </DialogHeader>

        {!user ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sign in to keep a copy of your seasons online. Only you can see them.
            </p>
            <Button variant="outline" className="w-full" onClick={google}>
              Continue with Google
            </Button>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => signIn("in")}>Sign in</Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => signIn("up")}>Create account</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{user.email}</span>
              <button className="underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
            <Button className="w-full" disabled={!activeSeason || busy} onClick={backUpNow}>
              {activeSeason ? `Back up "${activeSeason.label}" now` : "Select a season to back up"}
            </Button>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {backups.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No backups yet.</p>
              ) : (
                backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.season_label}</div>
                      <div className="text-muted-foreground">
                        {new Date(b.created_at).toLocaleString()} · {b.game_count} games
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restore(b.id)}>
                      Restore
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Restoring adds the backup as a new season. Nothing you have now is replaced.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
