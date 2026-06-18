import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { listOpenTasks } from "@/lib/mediflow.functions";
import { StatusPill, STAGE_LABEL, STAGE_TONE, PRIORITY_TONE } from "@/components/status-pill";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Task Inbox · MediFlow AI" }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">No tasks</div>,
  component: TasksPage,
});

function TasksPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-4xl">Task inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">Action Center for coordinators — every case awaiting a human decision.</p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
        <TaskList />
      </Suspense>
    </div>
  );
}

function TaskList() {
  const fn = useServerFn(listOpenTasks);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["tasks"], queryFn: () => fn() }));
  return (
    <div className="space-y-3">
      {data.length === 0 && <div className="surface-card p-10 text-center text-muted-foreground">Inbox zero. Nice.</div>}
      {data.map((t: any) => {
        const breached = t.sla_due_at && new Date(t.sla_due_at) < new Date();
        return (
          <Link
            key={t.id}
            to="/cases/$caseId"
            params={{ caseId: t.case_id }}
            className="group surface-card flex items-center gap-4 p-5 transition-colors hover:border-primary/50"
          >
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.title}</span>
                {t.cases && <StatusPill tone={STAGE_TONE[t.cases.stage]}>{STAGE_LABEL[t.cases.stage]}</StatusPill>}
                {t.cases && <StatusPill tone={PRIORITY_TONE[t.cases.priority]}>{t.cases.priority.toUpperCase()}</StatusPill>}
                {breached && <StatusPill tone="danger">SLA breached</StatusPill>}
              </div>
              {t.cases && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {t.cases.patient_name} · {t.cases.specialty} · {t.cases.case_number}
                </div>
              )}
            </div>
            <div className="text-right">
              {t.sla_due_at && (
                <div className={`text-xs ${breached ? "text-destructive" : "text-muted-foreground"}`}>
                  {breached ? "Overdue " : "Due "}{formatDistanceToNow(new Date(t.sla_due_at), { addSuffix: true })}
                </div>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </Link>
        );
      })}
    </div>
  );
}
