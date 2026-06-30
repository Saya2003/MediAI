import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Users, Settings, Activity, ShieldCheck, ChevronDown, Check,
  AlertTriangle, TrendingUp, Download,
} from "lucide-react";
import {
  getAdminMetrics, getSystemConfig, updateSystemConfig,
  listUsersAndRoles, updateUserRole, exportCasesCSV,
  checkSlaBreaches, seedDemoData,
} from "@/lib/mediflow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill, STAGE_LABEL } from "@/components/status-pill";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Supervisor Admin · MediFlow" }] }),
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  component: AdminPage,
});

const ROLE_COLORS: Record<string, string> = {
  coordinator: "bg-info/10 text-info border-info/30",
  physician: "bg-success/10 text-success border-success/30",
  specialist: "bg-warning/15 text-warning-foreground border-warning/40",
  supervisor: "bg-primary/10 text-primary border-primary/20",
};

const STAGE_CHART_COLORS = ["#94a3b8","#f59e0b","#3b82f6","#6366f1","#8b5cf6","#22c55e","#ef4444"];

function AdminPage() {
  const [tab, setTab] = useState<"metrics" | "users" | "config">("metrics");
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="font-display text-4xl">Supervisor Admin</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate reporting, user management, and system configuration.
        </p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        {(["metrics", "users", "config"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "metrics" ? "📊 Reporting" : t === "users" ? "👥 Users" : "⚙️ Config"}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
        {tab === "metrics" && <MetricsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "config" && <ConfigTab />}
      </Suspense>
    </div>
  );
}

// ── Metrics Tab ───────────────────────────────────────────────────────────────
function MetricsTab() {
  const fn = useServerFn(getAdminMetrics);
  const exportFn = useServerFn(exportCasesCSV);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["admin-metrics"], queryFn: () => fn() }));

  async function handleExport() {
    try {
      const res = await exportFn({ data: {} });
      const blob = new Blob([res.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mediflow-cases-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const stageData = Object.entries(data.byStage).map(([k, v]) => ({ name: STAGE_LABEL[k] ?? k, count: v as number }));
  const priorityData = Object.entries(data.byPriority).map(([k, v]) => ({ name: k, count: v as number }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Total cases" value={data.totalCases} sub="All time" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Active cases" value={data.activeCases} sub="In progress" />
        <KpiCard icon={<Check className="h-4 w-4" />} label="SLA compliance" value={`${data.slaCompliance}%`} sub="Tasks within deadline" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="SLA breaches" value={data.slaBreaches} sub="Overdue open tasks" warn={data.slaBreaches > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="font-display text-xl">Cases by stage</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageData.map((_, i) => <Cell key={i} fill={STAGE_CHART_COLORS[i % STAGE_CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="font-display text-xl">Cases by priority</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  <Cell fill="#94a3b8" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">Export case data</h2>
            <p className="mt-1 text-sm text-muted-foreground">Download all case records as CSV (up to 10,000 rows).</p>
          </div>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">SLA breach check</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find overdue tasks and auto-escalate to supervisors. (FR-028)</p>
          </div>
          <SlaBreachButton />
        </div>
      </div>

      <div className="surface-card border-2 border-primary/30 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">Seed demo data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create 6 demo cases at various stages, seed specialists, ICD-10 codes, and test user accounts for all roles.
            </p>
          </div>
          <SeedDemoButton />
        </div>
      </div>
    </div>
  );
}

function SeedDemoButton() {
  const seedFn = useServerFn(seedDemoData);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await seedFn();
      toast.success(`Demo data seeded! ${res.results?.length ?? 0} actions performed.`);
      await qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }
  return (
    <Button onClick={run} disabled={busy} className="gap-2">
      {busy ? "Seeding…" : "Generate demo data"}
    </Button>
  );
}

function SlaBreachButton() {
  const breachFn = useServerFn(checkSlaBreaches);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function run() {
    setBusy(true); setResult(null);
    try {
      const res = await breachFn();
      setResult(`${res.escalated} of ${res.breached} overdue tasks escalated.`);
      toast.success(result || "Check complete");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
      <Button onClick={run} disabled={busy} variant="outline" size="sm">{busy ? "Checking…" : "Run check"}</Button>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, warn }: { icon: React.ReactNode; label: string; value: any; sub: string; warn?: boolean }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${warn ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{icon}</span>
      </div>
      <div className={`mt-3 font-display text-4xl tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const fn = useServerFn(listUsersAndRoles);
  const updateFn = useServerFn(updateUserRole);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["admin-users"], queryFn: () => fn() }));
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleRole(userId: string, role: string, hasRole: boolean) {
    setBusy(`${userId}-${role}`);
    try {
      await updateFn({ data: { userId, role: role as any, action: hasRole ? "remove" : "add" } });
      toast.success(hasRole ? `Removed ${role} role` : `Added ${role} role`);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const allRoles = ["coordinator", "physician", "specialist", "supervisor"];

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl">User accounts</h2>
        <span className="ml-auto text-sm text-muted-foreground">{data.length} users</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-6 py-3 text-left">Name / Email</th>
            <th className="px-6 py-3 text-left">Organisation</th>
            <th className="px-6 py-3 text-left">Roles</th>
            <th className="px-6 py-3 text-left">Manage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((u: any) => {
            const userRoles: string[] = (u.user_roles ?? []).map((r: any) => r.role);
            return (
              <tr key={u.id} className="hover:bg-muted/20">
                <td className="px-6 py-4">
                  <div className="font-medium">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{u.organization ?? "—"}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {userRoles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No roles</span>
                    ) : (
                      userRoles.map((r) => (
                        <span key={r} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r]}`}>{r}</span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {allRoles.map((role) => {
                      const has = userRoles.includes(role);
                      const id = `${u.id}-${role}`;
                      return (
                        <button
                          key={role}
                          disabled={busy === id}
                          onClick={() => toggleRole(u.id, role, has)}
                          className={`rounded border px-2 py-0.5 text-xs transition-all ${has ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"}`}
                        >
                          {has ? `✕ ${role}` : `+ ${role}`}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Config Tab ─────────────────────────────────────────────────────────────────
function ConfigTab() {
  const fn = useServerFn(getSystemConfig);
  const saveFn = useServerFn(updateSystemConfig);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["system-config"], queryFn: () => fn() }));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const CONFIG_LABELS: Record<string, string> = {
    sla_hours_stat: "SLA — STAT (hours)",
    sla_hours_urgent: "SLA — Urgent (hours)",
    sla_hours_routine: "SLA — Routine (hours)",
    max_preauth_retries: "Max pre-auth retries",
    preauth_retry_delay_seconds: "Pre-auth retry delay (sec)",
    followup_days_after_visit: "Follow-up trigger (days after visit)",
    escalation_days_no_outcome: "Escalation trigger (days, no outcome)",
    action_center_sla_hours: "Action Center SLA (hours)",
    weekly_report_day: "Weekly report day",
    weekly_report_time_local: "Weekly report time",
  };

  async function save(key: string) {
    const val = edits[key];
    if (!val) return;
    setSaving(key);
    try {
      await saveFn({ data: { config_key: key, config_value: val } });
      toast.success("Saved");
      setEdits((e) => { const n = { ...e }; delete n[key]; return n; });
      await qc.invalidateQueries({ queryKey: ["system-config"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="surface-card divide-y divide-border overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4">
        <Settings className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl">System configuration</h2>
        <p className="ml-auto text-xs text-muted-foreground">Changes take effect on the next case evaluation.</p>
      </div>
      {data.map((row) => {
        const current = edits[row.config_key] ?? row.config_value;
        const dirty = edits[row.config_key] !== undefined && edits[row.config_key] !== row.config_value;
        return (
          <div key={row.config_key} className="flex items-center gap-4 px-6 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{CONFIG_LABELS[row.config_key] ?? row.config_key}</div>
              <div className="font-mono text-xs text-muted-foreground">{row.config_key}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={current}
                onChange={(e) => setEdits((prev) => ({ ...prev, [row.config_key]: e.target.value }))}
                className="w-32 text-right text-sm"
              />
              {dirty && (
                <Button size="sm" disabled={saving === row.config_key} onClick={() => save(row.config_key)} className="gap-1">
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
