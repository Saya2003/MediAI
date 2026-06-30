import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState, useRef } from "react";
import {
  ArrowLeft, Bot, Calendar, ClipboardList, Cog, Cpu, FileText,
  User as UserIcon, AlertTriangle, Check, X, MapPin, Network,
  FileCheck, Brain, Upload, Zap,
} from "lucide-react";
import {
  getCaseDetail, completeTask, listSpecialists, confirmAppointment,
  uploadCaseDocument, aiExtractDocumentFields, advanceCaseStage,
} from "@/lib/mediflow.functions";
import {
  StatusPill, STAGE_LABEL, STAGE_TONE, PRIORITY_LABEL, PRIORITY_TONE,
  ACTOR_TONE, ACTOR_LABEL, prettifyEvent,
} from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `Case ${params.caseId.slice(0, 8)} · MediFlow` }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">We couldn't find this case.</div>,
  component: CaseDetailPage,
});

const STAGES = ["intake", "pre_auth", "scheduling", "appointment", "follow_up", "closed"] as const;

const PREAUTH_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting on insurance",
  approved: "Approved",
  denied: "Denied",
  appealing: "Under appeal",
};

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/cases" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to all cases
      </Link>
      <Suspense fallback={<div className="text-muted-foreground">Loading case…</div>}>
        <CaseDetail caseId={caseId} />
      </Suspense>
    </div>
  );
}

function CaseDetail({ caseId }: { caseId: string }) {
  const fn = useServerFn(getCaseDetail);
  const { data } = useSuspenseQuery(
    queryOptions({ queryKey: ["case", caseId], queryFn: () => fn({ data: { caseId } }) }),
  );
  const c = data.caseRow;
  const currentStageIdx = STAGES.indexOf(c.stage as (typeof STAGES)[number]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{c.case_number} · Patient ID {c.mrn}</div>
            <h1 className="font-display text-4xl">{c.patient_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.specialty} · referred by {c.referring_physician_name ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</StatusPill>
            <StatusPill tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</StatusPill>
            {c.sla_due_at && (
              <StatusPill tone={new Date(c.sla_due_at) < new Date() ? "danger" : "muted"}>
                <AlertTriangle className="h-3 w-3" />
                Due {formatDistanceToNow(new Date(c.sla_due_at), { addSuffix: true })}
              </StatusPill>
            )}
            {c.stage !== "closed" && c.stage !== "cancelled" && (
              <AdvanceButton caseId={caseId} stage={c.stage} />
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
                <div className={`mt-2 text-xs ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {STAGE_LABEL[s]}
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Open Tasks */}
          <section className="surface-card p-6">
            <h2 className="flex items-center gap-2 font-display text-2xl">
              <ClipboardList className="h-5 w-5 text-primary" /> What needs doing
            </h2>
            <p className="text-sm text-muted-foreground">Open to-dos for this case.</p>
            <div className="mt-4 space-y-3">
              {data.tasks.filter((t: any) => t.status === "open").length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nothing to do right now. We're keeping an eye on this case.
                </div>
              )}
              {data.tasks
                .filter((t: any) => t.status === "open")
                .map((t: any) => <TaskCard key={t.id} task={t} caseId={caseId} specialty={c.specialty} />)}
            </div>
          </section>

          {/* AI Case Summary */}
          {data.summary && (
            <section className="surface-card p-6">
              <h2 className="flex items-center gap-2 font-display text-2xl">
                <Brain className="h-5 w-5 text-primary" /> AI case summary
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Generated by {data.summary.generated_by}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{data.summary.summary_text}</p>
            </section>
          )}

          {/* Timeline */}
          <section className="surface-card p-6">
            <h2 className="font-display text-2xl">Case history</h2>
            <p className="text-sm text-muted-foreground">Everything that's happened on this case, in order.</p>
            <ol className="mt-4 space-y-4">
              {data.events.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <ActorIcon type={e.actor_type} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.actor_label}</span>
                      <StatusPill tone={ACTOR_TONE[e.actor_type]}>{ACTOR_LABEL[e.actor_type] ?? e.actor_type}</StatusPill>
                      <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "PP p")}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{prettifyEvent(e.event_type)}</div>
                    {e.details?.notes && (
                      <div className="mt-1 rounded bg-muted/50 p-2 text-xs text-muted-foreground">"{e.details.notes}"</div>
                    )}
                    {e.details?.from && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {STAGE_LABEL[e.details.from]} → {STAGE_LABEL[e.details.to]}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Human Decisions Audit */}
          {data.decisions.length > 0 && (
            <section className="surface-card p-6">
              <h2 className="flex items-center gap-2 font-display text-2xl">
                <FileCheck className="h-5 w-5 text-primary" /> Decision audit log
              </h2>
              <p className="text-sm text-muted-foreground">Every human decision on this case, logged for compliance.</p>
              <div className="mt-4 space-y-3">
                {data.decisions.map((d: any) => (
                  <div key={d.id} className="rounded-lg border border-border p-4 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusPill tone={d.decision === "approve" || d.decision === "complete" ? "success" : d.decision === "deny" ? "danger" : "warning"}>
                        {d.decision}
                      </StatusPill>
                      <span className="text-xs text-muted-foreground">{format(new Date(d.created_at), "PP p")}</span>
                    </div>
                    {d.reasoning && <p className="mt-2 text-muted-foreground">"{d.reasoning}"</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {data.referral && (
            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 font-display text-xl">
                <FileText className="h-4 w-4 text-primary" /> Request details
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Diagnosis" value={
                  data.referral.diagnosis_code
                    ? `${data.referral.diagnosis_code} — ${data.referral.diagnosis_description ?? ""}`
                    : data.referral.diagnosis_description ?? "—"
                } />
                <Row label="Notes" value={data.referral.clinical_notes ?? "—"} />
              </dl>
            </section>
          )}

          {data.preauths[0] && (
            <section className="surface-card p-6">
              <h3 className="font-display text-xl">Insurance approval</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Insurer" value={data.preauths[0].payer ?? "—"} />
                <Row label="Status" value={
                  <StatusPill tone={
                    data.preauths[0].status === "approved" ? "success"
                    : data.preauths[0].status === "denied" ? "danger"
                    : "warning"
                  }>
                    {PREAUTH_STATUS_LABEL[data.preauths[0].status] ?? data.preauths[0].status}
                  </StatusPill>
                } />
                {data.preauths[0].denial_reason && (
                  <Row label="Why denied" value={data.preauths[0].denial_reason} />
                )}
              </dl>
            </section>
          )}

          {data.appointments[0] && (
            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 font-display text-xl">
                <Calendar className="h-4 w-4 text-primary" /> Visit
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Specialist" value={data.appointments[0].specialist_name} />
                <Row label="When" value={data.appointments[0].scheduled_at ? format(new Date(data.appointments[0].scheduled_at), "PP p") : "—"} />
                <Row label="Where" value={data.appointments[0].location ?? "—"} />
                <Row label="Status" value={<StatusPill tone="info">{data.appointments[0].status}</StatusPill>} />
              </dl>
            </section>
          )}

          {data.followUps[0] && (
            <section className="surface-card p-6">
              <h3 className="font-display text-xl">Check-in notes</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="How it went" value={data.followUps[0].outcome_notes ?? "—"} />
                <Row label="What's next" value={data.followUps[0].next_action ?? "—"} />
              </dl>
            </section>
          )}

          {/* Documents (FR-005 / FR-043) */}
          <section className="surface-card p-6">
            <h3 className="flex items-center gap-2 font-display text-xl">
              <Upload className="h-4 w-4 text-primary" /> Documents
            </h3>
            <DocumentUpload caseId={caseId} />
            {(data.documents as any[]).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No documents attached yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(data.documents as any[]).map((d) => (
                  <li key={d.id} className="text-sm">
                    <a href={d.storage_path} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {d.document_type ?? "Document"}
                    </a>
                    <span className="ml-2 text-xs text-muted-foreground">{format(new Date(d.created_at), "PP")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</dt>
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

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, caseId, specialty }: { task: any; caseId: string; specialty: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fn = useServerFn(completeTask);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isPreAuth = task.kind === "review_preauth";
  const isScheduling = task.kind === "select_specialist";
  const breached = task.sla_due_at && new Date(task.sla_due_at) < new Date();

  async function act(decision: "approve" | "deny" | "complete" | "escalate") {
    setBusy(true);
    try {
      await fn({ data: { taskId: task.id, decision, notes: notes || undefined } });
      toast.success("Done. Case moved to the next step.");
      setOpen(false);
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{task.title}</div>
          {task.description && <div className="mt-0.5 text-sm text-muted-foreground">{task.description}</div>}
        </div>
        {breached && (
          <StatusPill tone="danger"><AlertTriangle className="h-3 w-3" /> Past deadline</StatusPill>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {isPreAuth ? (
          <>
            <Button size="sm" onClick={() => act("approve")} disabled={busy} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Deny
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Deny insurance approval</DialogTitle></DialogHeader>
                <Textarea placeholder="Why is this being denied?" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => act("deny")} disabled={busy || !notes}>Confirm denial</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : isScheduling ? (
          <SpecialistMatchDialog caseId={caseId} specialty={specialty} taskId={task.id} onDone={() => act("complete")} busy={busy} />
        ) : (
          <Button size="sm" onClick={() => act("complete")} disabled={busy} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> Mark done
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => act("escalate")} disabled={busy}>Ask supervisor</Button>
      </div>
    </div>
  );
}

// ── Specialist Match Dialog ───────────────────────────────────────────────────
function SpecialistMatchDialog({
  caseId, specialty, taskId, onDone, busy,
}: {
  caseId: string; specialty: string; taskId: string; onDone: () => void; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const confirmFn = useServerFn(confirmAppointment);
  const qc = useQueryClient();
  const listFn = useServerFn(listSpecialists);
  const { data: matchData } = useQuery({
    queryKey: ["specialists", specialty, caseId],
    queryFn: () => listFn({ data: { specialty, caseId } }),
    enabled: open,
  });

  const specialists = (matchData?.specialists ?? []) as any[];
  const hasConflict = matchData?.conflict ?? false;

  async function book() {
    if (!selected || !scheduledAt) return;
    setConfirming(true);
    try {
      const res = await confirmFn({
        data: {
          caseId,
          specialistId: selected.id,
          specialistName: selected.full_name,
          scheduledAt: new Date(scheduledAt).toISOString(),
          location: "Clinic A, MediFlow General Hospital",
        },
      });
      if (res.conflictWarning) {
        toast.warning("Appointment booked, but a scheduling conflict was detected within 48 hours.");
      } else {
        toast.success("Appointment confirmed!");
      }
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={busy}>
          <MapPin className="h-3.5 w-3.5" /> Match specialist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select specialist — {specialty}</DialogTitle>
        </DialogHeader>

        {hasConflict && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This patient already has an appointment within 48 hours of any slot you pick.
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {specialists.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading specialists…</p>
          )}
          {specialists.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full rounded-lg border p-3 text-left text-sm transition-all ${
                selected?.id === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="font-medium">{s.full_name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.specialty}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(s.insurance_networks ?? []).map((net: string) => (
                  <span key={net} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    <Network className="h-2.5 w-2.5" /> {net}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-2 border-t border-border pt-4">
            <label className="text-xs font-medium text-muted-foreground">Appointment date & time</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={book} disabled={!selected || !scheduledAt || confirming}>
            {confirming ? "Booking…" : "Confirm appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RPA Auto-Pilot Advance Button ───────────────────────────────────────────
function AdvanceButton({ caseId, stage }: { caseId: string; stage: string }) {
  const advanceFn = useServerFn(advanceCaseStage);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function handleAdvance() {
    setBusy(true);
    try {
      const res = await advanceFn({ data: { caseId } });
      toast.success(`RPA robot advanced case: ${STAGE_LABEL[res.previousStage]} → ${STAGE_LABEL[res.newStage]}`);
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  return (
    <Button size="sm" variant="outline" onClick={handleAdvance} disabled={busy} className="gap-1.5 border-amber-400/50 text-amber-600 hover:bg-amber-50">
      <Zap className="h-3.5 w-3.5" /> {busy ? "Running…" : "Auto-advance (RPA)"}
    </Button>
  );
}

// ── Document Upload Component (FR-005 / FR-043) ──────────────────────────────
function DocumentUpload({ caseId }: { caseId: string }) {
  const uploadFn = useServerFn(uploadCaseDocument);
  const extractFn = useServerFn(aiExtractDocumentFields);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File too large (max 20 MB)"); return; }
    setBusy(true);
    try {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      await uploadFn({
        data: {
          caseId, fileName: file.name, fileType: file.type,
          contentBase64: b64, documentType: file.name.split(".").pop()?.toUpperCase() ?? "OTHER",
        },
      });
      toast.success("Document uploaded.");

      if (!IMAGE_TYPES.includes(file.type)) {
        const res = await extractFn({ data: { caseId, textContent: b64.slice(0, 10000), fileType: file.type } });
        if (res.extracted) {
          toast.success("AI extracted fields from document.");
        } else if (res.note) {
          toast.info(res.note);
        }
      }

      await qc.invalidateQueries({ queryKey: ["case", caseId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="mt-2 mb-3">
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} hidden />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="w-full gap-1.5">
        <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload document (PDF, JPG, PNG)"}
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">Max 20 MB per file. Documents are stored securely.</p>
    </div>
  );
}
