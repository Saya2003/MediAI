import { createFileRoute, Link } from "@tanstack/react-router";
import {
  HelpCircle,
  HeartPulse,
  ClipboardList,
  FilePlus2,
  Users,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help · MediFlow" }] }),
  component: HelpPage,
});

const FAQS = [
  {
    q: "What is MediFlow, in one sentence?",
    a: "It's a tidy place to manage every patient request — from the first phone call to the visit and what happens after.",
  },
  {
    q: "What do the steps mean?",
    a: "New request → Insurance approval → Booking visit → Visit scheduled → Check-in → Finished. Each case moves through these in order.",
  },
  {
    q: "Who is doing the work?",
    a: "You and your team. Smart helpers prepare paperwork and suggest options, but a person always makes the final call.",
  },
  {
    q: "What does 'past deadline' mean?",
    a: "Every case has a friendly deadline based on how urgent it is. If we pass it, the case shows up in red so it doesn't get missed.",
  },
  {
    q: "Can I undo a decision?",
    a: "You can always add a new note or ask a supervisor to take a look. The full history is saved on every case.",
  },
];

const QUICK_LINKS = [
  {
    icon: FilePlus2,
    title: "Send a new patient request",
    desc: "Open a new case for a patient who needs a specialist.",
    to: "/referrals/new" as const,
  },
  {
    icon: ClipboardList,
    title: "See what's on your plate",
    desc: "Open your to-do list and clear what needs attention.",
    to: "/tasks" as const,
  },
  {
    icon: Users,
    title: "Look at all patient cases",
    desc: "Search and filter every case your team is handling.",
    to: "/cases" as const,
  },
];

function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <HelpCircle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-4xl">Help & getting started</h1>
          <p className="text-sm text-muted-foreground">
            Quick answers, in plain words. Nothing complicated.
          </p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Common things you'll want to do</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="surface-card group p-5 transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-3 font-medium">{link.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{link.desc}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Questions people ask</h2>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {FAQS.map((f) => (
            <details key={f.q} className="group p-5 open:bg-muted/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="surface-card mt-10 flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-xl">Still need a hand?</div>
            <div className="text-sm text-muted-foreground">
              Reach out to your supervisor or our support team — we're happy to help.
            </div>
          </div>
        </div>
        <a
          href="mailto:support@mediflow.example"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4" /> Contact support
        </a>
      </section>
    </div>
  );
}
