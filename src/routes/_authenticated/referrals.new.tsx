import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createReferral } from "@/lib/mediflow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/referrals/new")({
  head: () => ({ meta: [{ title: "New Referral · MediFlow AI" }] }),
  component: NewReferral,
});

const SPECIALTIES = ["Cardiology", "Orthopedics", "Neurology", "Oncology", "Dermatology", "Endocrinology", "Gastroenterology", "Urology", "Rheumatology", "Pulmonology", "Ophthalmology"];

function NewReferral() {
  const navigate = useNavigate();
  const fn = useServerFn(createReferral);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    mrn: "",
    patientName: "",
    patientDob: "",
    specialty: "Cardiology",
    priority: "routine" as "routine" | "urgent" | "stat",
    referringPhysicianName: "",
    diagnosisCode: "",
    diagnosisDescription: "",
    clinicalNotes: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fn({ data: form });
      toast.success("Referral created. Case opened.");
      navigate({ to: "/cases/$caseId", params: { caseId: res.caseId } });
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-4xl">New referral</h1>
      <p className="mt-1 text-sm text-muted-foreground">Submit a referral to open a new coordination case.</p>

      <form onSubmit={submit} className="surface-card mt-6 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient name"><Input value={form.patientName} onChange={(e) => set("patientName", e.target.value)} required /></Field>
          <Field label="MRN"><Input value={form.mrn} onChange={(e) => set("mrn", e.target.value)} required /></Field>
          <Field label="Date of birth"><Input type="date" value={form.patientDob} onChange={(e) => set("patientDob", e.target.value)} /></Field>
          <Field label="Referring physician"><Input value={form.referringPhysicianName} onChange={(e) => set("referringPhysicianName", e.target.value)} required /></Field>
          <Field label="Specialty">
            <Select value={form.specialty} onValueChange={(v) => set("specialty", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => set("priority", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine (48h SLA)</SelectItem>
                <SelectItem value="urgent">Urgent (8h SLA)</SelectItem>
                <SelectItem value="stat">STAT (2h SLA)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Diagnosis code (ICD-10)"><Input value={form.diagnosisCode} onChange={(e) => set("diagnosisCode", e.target.value)} placeholder="e.g. I25.10" /></Field>
          <Field label="Diagnosis description"><Input value={form.diagnosisDescription} onChange={(e) => set("diagnosisDescription", e.target.value)} /></Field>
        </div>
        <Field label="Clinical notes">
          <Textarea rows={5} value={form.clinicalNotes} onChange={(e) => set("clinicalNotes", e.target.value)} placeholder="Summary of patient presentation and reason for referral…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit referral"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
