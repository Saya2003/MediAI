import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createReferral } from "@/lib/mediflow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/referrals/new")({
  head: () => ({ meta: [{ title: "New patient request · MediFlow" }] }),
  component: NewReferral,
});

const SPECIALTIES = [
  "Cardiology (Heart)",
  "Orthopedics (Bones & Joints)",
  "Neurology (Brain & Nerves)",
  "Oncology (Cancer)",
  "Dermatology (Skin)",
  "Endocrinology (Hormones)",
  "Gastroenterology (Stomach & Gut)",
  "Urology (Urinary)",
  "Rheumatology (Joints)",
  "Pulmonology (Lungs)",
  "Ophthalmology (Eyes)",
];

function NewReferral() {
  const navigate = useNavigate();
  const fn = useServerFn(createReferral);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    mrn: "",
    patientName: "",
    patientDob: "",
    specialty: SPECIALTIES[0],
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
      toast.success("Request created. New case opened.");
      navigate({ to: "/cases/$caseId", params: { caseId: res.caseId } });
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-4xl">New patient request</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us about the patient and what they need. We'll open a new case and start the journey.
      </p>

      <form onSubmit={submit} className="surface-card mt-6 space-y-6 p-6">
        <div>
          <h2 className="font-display text-xl">About the patient</h2>
          <p className="text-xs text-muted-foreground">Basic details we use to find the right care.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient's full name">
            <Input
              value={form.patientName}
              onChange={(e) => set("patientName", e.target.value)}
              placeholder="Jane Smith"
              required
            />
          </Field>
          <Field label="Patient ID (MRN)">
            <Input
              value={form.mrn}
              onChange={(e) => set("mrn", e.target.value)}
              placeholder="e.g. MRN-00123"
              required
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={form.patientDob}
              onChange={(e) => set("patientDob", e.target.value)}
            />
          </Field>
          <Field label="Doctor making the request">
            <Input
              value={form.referringPhysicianName}
              onChange={(e) => set("referringPhysicianName", e.target.value)}
              placeholder="Dr. Alex Chen"
              required
            />
          </Field>
        </div>

        <div className="h-px bg-border" />

        <div>
          <h2 className="font-display text-xl">What do they need?</h2>
          <p className="text-xs text-muted-foreground">Pick the right department and how urgent this is.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <Select value={form.specialty} onValueChange={(v) => set("specialty", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPECIALTIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="How urgent?">
            <Select value={form.priority} onValueChange={(v) => set("priority", v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Standard — within 2 days</SelectItem>
                <SelectItem value="urgent">Urgent — within 8 hours</SelectItem>
                <SelectItem value="stat">Right now — within 2 hours</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Diagnosis code (optional)">
            <Input
              value={form.diagnosisCode}
              onChange={(e) => set("diagnosisCode", e.target.value)}
              placeholder="e.g. I25.10"
            />
          </Field>
          <Field label="Diagnosis (in plain words)">
            <Input
              value={form.diagnosisDescription}
              onChange={(e) => set("diagnosisDescription", e.target.value)}
              placeholder="e.g. Chest pain, suspected heart issue"
            />
          </Field>
        </div>
        <Field label="Notes for the specialist">
          <Textarea
            rows={5}
            value={form.clinicalNotes}
            onChange={(e) => set("clinicalNotes", e.target.value)}
            placeholder="Anything the specialist should know about the patient…"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Send request"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
