import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  FolderKanban,
  Bot,
  User,
  Cog,
  Cpu,
  ArrowUpRight,
} from "lucide-react";
import { getDashboardMetrics } from "@/lib/mediflow.functions";
import {
  StatusPill,
  STAGE_LABEL,
  ACTOR_TONE,
  ACTOR_LABEL,
  prettifyEvent,
} from "@/components/status-pill";

const dashOptions = (fn: any) =>
  queryOptions({ queryKey: ["dashboard"], queryFn: () => fn() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Overview · MediFlow" }] }),
  errorComponent: ({ error }) => (
    <div className="p-10 text-destructive">Couldn't load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10">Page not found</div>,
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-4xl">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's a quick look at your patient cases and what needs attention today.
        </p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
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
        <Kpi
          icon={<FolderKanban className="h-4 w-4" />}
          label="Open cases"
          value={data.activeCases}
          tone="default"
          hint="Patients we're helping right now"
        />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Things to do"
          value={data.openTasks}
          tone="info"
          hint="To-dos waiting for someone"
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Past their deadline"
          value={data.slaBreaches}
          tone={data.slaBreaches > 0 ? "danger" : "muted"}
          hint="Need attention now"
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Avg. days to finish"
          value={data.avgCycleDays}
          tone="success"
          hint="From request to all done"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <h2 className="font-display text-2xl">Where your cases are</h2>
          <p className="mt-1 text-sm text-muted-foreground">A snapshot of every patient's journey.</p>
          <div className="mt-6 space-y-3">
            {Object.entries(STAGE_LABEL)
              .filter(([k]) => k !== "cancelled")
              .map(([key, label]) => {
                const n = data.byStage[key] ?? 0;
                const max = Math.max(1, ...Object.values(data.byStage).map((v) => v as number));
                const pct = (n / max) * 100;
                return (
                  <div key={key} className="flex items-center gap-4">
                    <div className="w-36 text-sm text-muted-foreground">{label}</div>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm tabular-nums">{n}</div>
                  </div>
                );
              })}
          </div>
          <Link
            to="/cases"
            className="mt-6 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            See all cases <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="surface-card p-6">
          <h2 className="font-display text-2xl">Latest activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">What's been happening across your team.</p>
          <ul className="mt-4 space-y-4 text-sm">
            {data.recentEvents.length === 0 && (
              <li className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
                Nothing yet — activity will show here.
              </li>
            )}
            {data.recentEvents.map((e: any) => (
              <li key={e.id} className="flex gap-3">
                <ActorIcon type={e.actor_type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{e.actor_label}</span>
                    <StatusPill tone={ACTOR_TONE[e.actor_type]} className="shrink-0">
                      {ACTOR_LABEL[e.actor_type] ?? e.actor_type}
                    </StatusPill>
                  </div>
                  <div className="text-muted-foreground">{prettifyEvent(e.event_type)}</div>
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: e.case_id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open this case →
                  </Link>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: any;
  hint: string;
}) {
  return (
    <div className="surface-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <StatusPill tone={tone}>
          <span className="flex items-center gap-1">{icon}</span>
        </StatusPill>
      </div>
      <div className="mt-3 font-display text-4xl tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function ActorIcon({ type }: { type: string }) {
  const Icon = type === "human" ? User : type === "rpa" ? Cog : type === "ai_agent" ? Cpu : Bot;
  return (
    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
