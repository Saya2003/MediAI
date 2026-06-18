import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ArrowLeft, Bot, Calendar, ClipboardList, Cog, Cpu, FileText, User as UserIcon, AlertTriangle, Check, X } from "lucide-react";
import { getCaseDetail, completeTask } from "@/lib/mediflow.functions";
import { StatusPill, STAGE_LABEL, STAGE_TONE, PRIORITY_TONE, ACTOR_TONE } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `Case ${params.caseId.slice(0, 8)} · MediFlow AI` }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">Case not found</div>,
  component: CaseDetailPage,
});

const STAGES = ["intake", "pre_auth", "scheduling", "appointment", "follow_up", "closed"] as const;

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/cases" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All cases
      </Link>
      <Suspense fallback={<div className="text-muted-foreground">Loading case…</div>}>
        <CaseDetail caseId={caseId} />
      </Suspense>
    </div>
  );
}

function CaseDetail({ caseId }: { caseId: string }) {
  const fn = useServerFn(getCaseDetail);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["case", caseId], queryFn: () => fn({ data: { caseId } }) }));
  const c = data.caseRow;
  const currentStageIdx = STAGES.indexOf(c.stage as (typeof STAGES)[number]);

  return (
    <div className="space-y-8">
      <header className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{c.case_number} · {c.mrn}</div>
            <h1 className="font-display text-4xl">{c.patient_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.specialty} · referred by {c.referring_physician_name ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={PRIORITY_TONE[c.priority]}>{c.priority.toUpperCase()}</StatusPill>
            <StatusPill tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</StatusPill>
            {c.sla_due_at && (
              <StatusPill tone={new Date(c.sla_due_at) < new Date() ? "danger" : "muted"}>
                <AlertTriangle className="h-3 w-3" /> SLA {formatDistanceToNow(new Date(c.sla_due_at), { addSuffix: true })}
              </StatusPill>
            )}
          </div>
        </div>

        {/* Stage rail */}
        <div className="mt-6 grid grid-cols-6 gap-2">
          {STAGES.map((s, i) => {
            const done = i < currentStageIdx;
            const current = i === currentStageIdx;
            return (
              <div key={s}>
                <div className={`h-1.5 rounded-full ${done ? "bg-success" : current ? "bg-primary" : "bg-muted"}`} />
                <div className={`mt-2 text-xs ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>{STAGE_LABEL[s]}</div>
              </div>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Open tasks */}
          <section className="surface-card p-6">
            <h2 className="flex items-center gap-2 font-display text-2xl"><ClipboardList className="h-5 w-5 text-primary" /> Action center</h2>
            <p className="text-sm text-muted-foreground">Open tasks awaiting human decision.</p>
            <div className="mt-4 space-y-3">
              {data.tasks.filter((t: any) => t.status === "open").length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No open tasks. The orchestrator is monitoring this case.
                </div>
              )}
              {data.tasks.filter((t: any) => t.status === "open").map((t: any) => (
                <TaskCard key={t.id} task={t} caseId={caseId} />
              ))}
            </div>
          </section>

          {/* Timeline */}
          <section className="surface-card p-6">
            <h2 className="font-display text-2xl">Activity timeline</h2>
            <ol className="mt-4 space-y-4">
              {data.events.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <ActorIcon type={e.actor_type} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.actor_label}</span>
                      <StatusPill tone={ACTOR_TONE[e.actor_type]}>{e.actor_type.replace("_", " ")}</StatusPill>
                      <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "PP p")}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{e.event_type.replace(/_/g, " ")}</div>
                    {e.details && Object.keys(e.details).length > 0 && (
                      <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">{JSON.stringify(e.details, null, 2)}</pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          {data.referral && (
            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 font-display text-xl"><FileText className="h-4 w-4 text-primary" /> Referral</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Diagnosis" value={data.referral.diagnosis_code ? `${data.referral.diagnosis_code} — ${data.referral.diagnosis_description ?? ""}` : "—"} />
                <Row label="Clinical notes" value={data.referral.clinical_notes ?? "—"} />
              </dl>
            </section>
          )}
          {data.preauths[0] && (
            <section className="surface-card p-6">
              <h3 className="font-display text-xl">Pre-authorization</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Payer" value={data.preauths[0].payer} />
                <Row label="Status" value={<StatusPill tone={data.preauths[0].status === "approved" ? "success" : data.preauths[0].status === "denied" ? "danger" : "warning"}>{data.preauths[0].status}</StatusPill>} />
                {data.preauths[0].denial_reason && <Row label="Reason" value={data.preauths[0].denial_reason} />}
              </dl>
            </section>
          )}
          {data.appointments[0] && (
            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 font-display text-xl"><Calendar className="h-4 w-4 text-primary" /> Appointment</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Specialist" value={data.appointments[0].specialist_name} />
                <Row label="When" value={data.appointments[0].scheduled_at ? format(new Date(data.appointments[0].scheduled_at), "PP p") : "—"} />
                <Row label="Location" value={data.appointments[0].location ?? "—"} />
                <Row label="Status" value={data.appointments[0].status} />
              </dl>
            </section>
          )}
          {data.followUps[0] && (
            <section className="surface-card p-6">
              <h3 className="font-display text-xl">Follow-up</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Outcome" value={data.followUps[0].outcome_notes} />
                <Row label="Next" value={data.followUps[0].next_action} />
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-foreground">{value}</dd>
    </div>
  );
}

function ActorIcon({ type }: { type: string }) {
  const Icon = type === "human" ? UserIcon : type === "rpa" ? Cog : type === "ai_agent" ? Cpu : Bot;
  return (
    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function TaskCard({ task, caseId }: { task: any; caseId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fn = useServerFn(completeTask);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPreAuth = task.kind === "review_preauth";
  const breached = task.sla_due_at && new Date(task.sla_due_at) < new Date();

  async function act(decision: "approve" | "deny" | "complete" | "escalate") {
    setBusy(true);
    try {
      await fn({ data: { taskId: task.id, decision, notes: notes || undefined } });
      toast.success("Task completed. Case advanced.");
      setOpen(false);
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{task.title}</div>
          {task.description && <div className="mt-0.5 text-sm text-muted-foreground">{task.description}</div>}
        </div>
        {breached && <StatusPill tone="danger"><AlertTriangle className="h-3 w-3" /> SLA breached</StatusPill>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {isPreAuth ? (
          <>
            <Button size="sm" onClick={() => act("approve")} disabled={busy} className="gap-1.5"><Check className="h-3.5 w-3.5" /> Approve</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5"><X className="h-3.5 w-3.5" /> Deny</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Deny pre-authorization</DialogTitle></DialogHeader>
                <Textarea placeholder="Denial reason" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => act("deny")} disabled={busy || !notes}>Confirm denial</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button size="sm" onClick={() => act("complete")} disabled={busy} className="gap-1.5"><Check className="h-3.5 w-3.5" /> Complete</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => act("escalate")} disabled={busy}>Escalate</Button>
      </div>
    </div>
  );
}
