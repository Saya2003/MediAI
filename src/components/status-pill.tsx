import { cn } from "@/lib/utils";

type Tone = "default" | "info" | "success" | "warning" | "danger" | "muted";

const toneStyles: Record<Tone, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  info: "bg-info/10 text-info border-info/30",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STAGE_LABEL: Record<string, string> = {
  intake: "Intake",
  pre_auth: "Pre-Authorization",
  scheduling: "Scheduling",
  appointment: "Appointment",
  follow_up: "Follow-Up",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const STAGE_TONE: Record<string, Tone> = {
  intake: "muted",
  pre_auth: "warning",
  scheduling: "info",
  appointment: "info",
  follow_up: "default",
  closed: "success",
  cancelled: "danger",
};

export const PRIORITY_TONE: Record<string, Tone> = {
  routine: "muted",
  urgent: "warning",
  stat: "danger",
};

export const ACTOR_TONE: Record<string, Tone> = {
  human: "default",
  rpa: "info",
  ai_agent: "success",
  system: "muted",
};
