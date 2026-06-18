import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { listCases } from "@/lib/mediflow.functions";
import { Input } from "@/components/ui/input";
import { StatusPill, STAGE_LABEL, STAGE_TONE, PRIORITY_TONE } from "@/components/status-pill";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({ meta: [{ title: "Cases · MediFlow AI" }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">No cases</div>,
  component: CasesPage,
});

function CasesPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">All patient referrals currently flowing through the network.</p>
        </div>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading cases…</div>}>
        <CaseTable />
      </Suspense>
    </div>
  );
}

function CaseTable() {
  const fn = useServerFn(listCases);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["cases"], queryFn: () => fn() }));
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");

  const filtered = useMemo(() => {
    return data.filter((c: any) => {
      if (stage !== "all" && c.stage !== stage) return false;
      if (q && !`${c.patient_name} ${c.mrn} ${c.case_number} ${c.specialty}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, q, stage]);

  const stages = ["all", "intake", "pre_auth", "scheduling", "appointment", "follow_up", "closed"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, MRN, specialty…" className="w-80 pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${stage === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {s === "all" ? "All" : STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Case</th>
              <th className="px-5 py-3">Patient</th>
              <th className="px-5 py-3">Specialty</th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3">Priority</th>
              <th className="px-5 py-3">SLA</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c: any) => {
              const slaIn = c.sla_due_at ? new Date(c.sla_due_at).getTime() - Date.now() : null;
              const breached = slaIn !== null && slaIn < 0;
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{c.case_number}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium">{c.patient_name}</div>
                    <div className="text-xs text-muted-foreground">{c.mrn}</div>
                  </td>
                  <td className="px-5 py-3">{c.specialty}</td>
                  <td className="px-5 py-3"><StatusPill tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</StatusPill></td>
                  <td className="px-5 py-3"><StatusPill tone={PRIORITY_TONE[c.priority]}>{c.priority.toUpperCase()}</StatusPill></td>
                  <td className="px-5 py-3 text-xs">
                    {c.sla_due_at ? (
                      <span className={breached ? "text-destructive" : "text-muted-foreground"}>
                        {breached ? "Breached " : "Due in "}{formatDistanceToNow(new Date(c.sla_due_at))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link to="/cases/$caseId" params={{ caseId: c.id }} className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No cases match the filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
