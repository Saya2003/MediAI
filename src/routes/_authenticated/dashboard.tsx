import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { Activity, AlertTriangle, Clock, FolderKanban, Bot, User, Cog, Cpu } from "lucide-react";
import { getDashboardMetrics } from "@/lib/mediflow.functions";
import { StatusPill, STAGE_LABEL, STAGE_TONE, ACTOR_TONE } from "@/components/status-pill";

const dashOptions = (fn: any) =>
  queryOptions({ queryKey: ["dashboard"], queryFn: () => fn() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · MediFlow AI" }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">Failed to load: {error.message}</div>,
  notFoundComponent: () => <div className="p-10">Not found</div>,
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-4xl">Operations dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live snapshot of cases, tasks, and SLA health across the coordination network.</p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading metrics…</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardContent() {
  const fn = useServerFn(getDashboardMetrics);
  const { data } = useSuspenseQuery(dashOptions(fn));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<FolderKanban className="h-4 w-4" />} label="Active cases" value={data.activeCases} tone="default" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Open tasks" value={data.openTasks} tone="info" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="SLA breaches" value={data.slaBreaches} tone={data.slaBreaches > 0 ? "danger" : "muted"} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Avg cycle (days)" value={data.avgCycleDays} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <h2 className="font-display text-2xl">Cases by stage</h2>
          <p className="mt-1 text-sm text-muted-foreground">Distribution across the orchestration lifecycle.</p>
          <div className="mt-6 space-y-3">
            {Object.entries(STAGE_LABEL).filter(([k]) => k !== "cancelled").map(([key, label]) => {
              const n = data.byStage[key] ?? 0;
              const max = Math.max(1, ...Object.values(data.byStage));
              const pct = (n / max) * 100;
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-muted-foreground">{label}</div>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-primary/80 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-8 text-right text-sm tabular-nums">{n}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="font-display text-2xl">Recent activity</h2>
          <ul className="mt-4 space-y-4 text-sm">
            {data.recentEvents.map((e: any) => (
              <li key={e.id} className="flex gap-3">
                <ActorIcon type={e.actor_type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{e.actor_label}</span>
                    <StatusPill tone={ACTOR_TONE[e.actor_type]} className="shrink-0">{e.actor_type.replace("_", " ")}</StatusPill>
                  </div>
                  <div className="text-muted-foreground">{e.event_type.replace(/_/g, " ")}</div>
                  <Link to="/cases/$caseId" params={{ caseId: e.case_id }} className="text-xs text-primary hover:underline">View case →</Link>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: any }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <StatusPill tone={tone}><span className="flex items-center gap-1">{icon}</span></StatusPill>
      </div>
      <div className="mt-3 font-display text-4xl tabular-nums">{value}</div>
    </div>
  );
}

function ActorIcon({ type }: { type: string }) {
  const Icon = type === "human" ? User : type === "rpa" ? Cog : type === "ai_agent" ? Cpu : Bot;
  return (
    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
