import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ShieldCheck,
  Workflow,
  Stethoscope,
  ArrowRight,
  CircleDot,
  HeartPulse,
  Sparkles,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getPublicStats } from "@/lib/mediflow.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediFlow — Simple Patient Care, Coordinated for You" },
      {
        name: "description",
        content:
          "MediFlow helps clinic staff send patient requests, get insurance approvals, book visits, and follow up — all in one calm, easy place.",
      },
      { property: "og:title", content: "MediFlow" },
      {
        property: "og:description",
        content: "Patient care, simply coordinated. People and smart helpers, working as one.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  const getStatsFn = useServerFn(getPublicStats);
  const { data: stats } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => getStatsFn(),
    refetchInterval: 60_000,
  });

  const activeCases = stats?.activeCases ?? 0;
  const openTasks = stats?.openTasks ?? 0;
  const slaBreaches = stats?.slaBreaches ?? 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* soft ambient color */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-gradient-to-b from-accent/40 via-background to-background" />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <header className="relative">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HeartPulse className="h-4 w-4" />
            </div>
            <span className="font-display text-2xl">MediFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Open my workspace</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            People and smart helpers, working side by side
          </p>
          <h1 className="mx-auto max-w-4xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Patient care that just <em className="text-primary not-italic">flows</em>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Send a patient request, get insurance sorted, book the visit, and check in afterwards — all in one calm
            place. MediFlow does the busy work so your team can focus on people.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 shadow-sm">
              <Link to="/auth">
                Open my workspace <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Send a patient request</Link>
            </Button>
          </div>

          {/* Live mock dashboard preview */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="surface-card overflow-hidden p-2 shadow-xl">
              <div className="rounded-lg bg-gradient-to-b from-muted/40 to-background p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Active cases" value={String(activeCases)} tone="primary" />
                  <MiniStat label="Things to do" value={String(openTasks)} tone="info" />
                  <MiniStat label="Past due" value={String(slaBreaches)} tone="warning" />
                </div>
                <div className="mt-4 grid grid-cols-6 gap-1.5 text-left">
                  {["New request", "Insurance", "Booking", "Visit", "Check-in", "Done"].map((s, i) => (
                    <div key={s}>
                      <div
                        className={`h-1.5 rounded-full ${
                          i < 2 ? "bg-success" : i === 2 ? "bg-primary" : "bg-muted"
                        }`}
                      />
                      <div className="mt-1.5 text-[10px] text-muted-foreground">{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-px bg-border/60 md:grid-cols-3">
            <FeatureCell
              icon={<Workflow className="h-5 w-5" />}
              title="One simple path"
              body="Every patient request follows the same friendly path: new request → insurance → booking → visit → check-in."
            />
            <FeatureCell
              icon={<Stethoscope className="h-5 w-5" />}
              title="People stay in charge"
              body="Smart helpers prepare the paperwork. Your team makes the calls that matter — with one tap to approve."
            />
            <FeatureCell
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Nothing gets lost"
              body="Every step is saved, with who did what and when. Safe, private, and easy to look back on."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl">A workflow your team will actually love.</h2>
              <p className="mt-4 text-muted-foreground">
                Each case shows a clear deadline, where it is in the journey, and a full history. You can always see
                what a helper did — and step in any time you need to.
              </p>
              <div className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                Built for small clinics and large hospitals alike.
              </div>
            </div>
            <ol className="space-y-3 text-sm">
              {[
                ["New request", "A patient is sent in by their doctor."],
                ["Insurance approval", "We check coverage and get approval."],
                ["Booking visit", "We find the right specialist and a time that works."],
                ["Visit scheduled", "We confirm the time with the patient."],
                ["Check-in", "After the visit, we record notes and plan what's next."],
              ].map(([title, body], i) => (
                <li key={title} className="surface-card flex gap-4 p-4 transition-shadow hover:shadow-md">
                  <span className="font-display text-2xl leading-none text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
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
        MediFlow · Practice data for demonstration only.
      </footer>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "primary" | "info" | "warning" }) {
  const colorMap = {
    primary: "text-primary",
    info: "text-info",
    warning: "text-warning-foreground",
  } as const;
  return (
    <div className="rounded-md border border-border bg-card p-4 text-left">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-3xl ${colorMap[tone]}`}>{value}</div>
    </div>
  );
}

function FeatureCell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-background p-8 transition-colors hover:bg-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
