import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

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
            const active =
              pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
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
              <div className="text-sidebar-foreground/60">Care coordinator</div>
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
            <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
