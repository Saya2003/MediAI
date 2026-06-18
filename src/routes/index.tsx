import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldCheck, Workflow, Stethoscope, ArrowRight, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediFlow AI — Agentic Patient Care Coordination" },
      {
        name: "description",
        content:
          "MediFlow AI coordinates referrals, pre-authorizations, scheduling, and follow-up — orchestrating humans, RPA robots, and AI agents on a single clinical workflow.",
      },
      { property: "og:title", content: "MediFlow AI" },
      { property: "og:description", content: "Agentic patient care coordination, end to end." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-primary" />
            <span className="font-display text-xl">MediFlow AI</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Open dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-24">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Built for UiPath AgentHack 2026 · Track 1 — Maestro Case
          </p>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Patient care, coordinated by <em className="text-primary not-italic">agents and humans</em> on a single clinical canvas.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            MediFlow AI orchestrates the full referral journey — intake, insurance pre-authorization, specialist scheduling,
            appointment confirmation, and post-visit follow-up — coordinating RPA bots and reasoning agents alongside the
            coordinators who own each case.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth">
                Open coordinator dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Submit a referral</Link>
            </Button>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-px bg-border/60 md:grid-cols-3">
            <FeatureCell
              icon={<Workflow className="h-5 w-5" />}
              title="Maestro-style orchestration"
              body="Cases flow through intake → pre-auth → scheduling → appointment → follow-up, with exception branches for denials and reschedules."
            />
            <FeatureCell
              icon={<Stethoscope className="h-5 w-5" />}
              title="Human-in-the-loop"
              body="A unified Action Center inbox. Coordinators review pre-auths, pick specialists, and capture outcomes — agents handle the rest."
            />
            <FeatureCell
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Audited & role-aware"
              body="Every transition is logged with the actor — human, RPA, or AI agent. Role-based access scoped at the row level."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl">A clinical workflow you can actually trust.</h2>
              <p className="mt-4 text-muted-foreground">
                Each case carries an SLA timer, a stage chip, and a complete activity log. Coordinators see what an
                AI agent or RPA bot did, when, and why — and intervene whenever the path requires judgment.
              </p>
            </div>
            <ol className="space-y-5 text-sm">
              {[
                ["Intake", "Referral submitted by physician or EMR feed."],
                ["Pre-Authorization", "RPA verifies insurance; AI agent drafts pre-auth packet."],
                ["Scheduling", "Specialist matching agent proposes top candidates."],
                ["Appointment", "Coordinator confirms slot with patient."],
                ["Follow-Up", "Outcome notes captured; case closed or recycled."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4 surface-card p-4">
                  <span className="font-display text-2xl text-primary">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-muted-foreground">{body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-10 text-center text-xs text-muted-foreground">
        <Activity className="mx-auto mb-2 h-4 w-4 text-primary" />
        MediFlow AI · Synthetic patient data for demonstration only.
      </footer>
    </div>
  );
}

function FeatureCell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-background p-8">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
