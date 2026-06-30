import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Inbox,
  FilePlus2,
  LogOut,
  HeartPulse,
  Bell,
  HelpCircle,
  Settings,
  ShieldCheck,
  X,
  Check,
  BellOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotifications, markNotificationsRead, snoozeNotifications } from "@/lib/mediflow.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/cases", label: "Patient cases", icon: FolderKanban },
  { to: "/tasks", label: "My to-dos", icon: Inbox },
  { to: "/referrals/new", label: "New request", icon: FilePlus2 },
] as const;

const bottomNavItems = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
] as const;

function AuthLayout() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load user roles for conditional nav
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setUserRoles((data ?? []).map((r) => r.role));
    });
  }, [user]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  const isSupervisor = userRoles.includes("supervisor");

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Toaster richColors position="top-right" />
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-6 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <HeartPulse className="h-4 w-4" />
          </div>
          <span className="font-display text-2xl">MediFlow</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {isSupervisor && (
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all",
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}

          <div className="my-3 h-px bg-sidebar-border/60" />

          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 text-xs">
              <div className="truncate text-sidebar-foreground/90">{user.email}</div>
              <div className="text-sidebar-foreground/60">
                {isSupervisor ? "Supervisor" : userRoles[0] ? userRoles[0].charAt(0).toUpperCase() + userRoles[0].slice(1) : "Care coordinator"}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-6 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <HeartPulse className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-lg">MediFlow</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <NotificationBell userId={user.id} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const getFn = useServerFn(getNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const snoozeFn = useServerFn(snoozeNotifications);
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => getFn(),
    refetchInterval: 30_000,
  });

  const unread = (notifications as any[]).filter((n) => !n.read_at).length;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function markRead() {
    await markFn();
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  async function snooze() {
    await snoozeFn({ data: { hours: 24 } });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-display text-lg">Notifications</span>
            <div className="flex gap-1">
              {unread > 0 && (
                <button onClick={markRead} title="Mark all read" className="rounded p-1 text-xs text-muted-foreground hover:text-foreground">
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={snooze} title="Snooze 24 h" className="rounded p-1 text-xs text-muted-foreground hover:text-foreground">
                <BellOff className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {(notifications as any[]).length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">You're all caught up!</li>
            )}
            {(notifications as any[]).map((n) => (
              <li
                key={n.id}
                className={`border-b border-border px-4 py-3 text-sm last:border-0 ${!n.read_at ? "bg-primary/5" : ""}`}
              >
                <div className={`${!n.read_at ? "font-medium text-foreground" : "text-muted-foreground"}`}>{n.message}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
