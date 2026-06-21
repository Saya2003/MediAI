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

// Plain-English labels for each stage of a patient case.
export const STAGE_LABEL: Record<string, string> = {
  intake: "New request",
  pre_auth: "Insurance approval",
  scheduling: "Booking visit",
  appointment: "Visit scheduled",
  follow_up: "Check-in",
  closed: "Finished",
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

export const PRIORITY_LABEL: Record<string, string> = {
  routine: "Standard",
  urgent: "Urgent",
  stat: "Right now",
};

export const PRIORITY_TONE: Record<string, Tone> = {
  routine: "muted",
  urgent: "warning",
  stat: "danger",
};

export const ACTOR_LABEL: Record<string, string> = {
  human: "Person",
  rpa: "Robot",
  ai_agent: "Smart assistant",
  system: "System",
};

export const ACTOR_TONE: Record<string, Tone> = {
  human: "default",
  rpa: "info",
  ai_agent: "success",
  system: "muted",
};

// Friendly explanations for the orchestration event types we record.
export const EVENT_LABEL: Record<string, string> = {
  case_created: "New patient request opened",
  stage_transition: "Case moved to next step",
  task_dispatched: "New to-do created",
  task_verify_insurance_complete: "Insurance details confirmed",
  task_review_preauth_approve: "Insurance approval granted",
  task_review_preauth_deny: "Insurance approval denied",
  task_review_preauth_complete: "Insurance approval reviewed",
  task_review_preauth_escalate: "Sent to supervisor",
  task_select_specialist_complete: "Specialist chosen",
  task_confirm_slot_complete: "Visit confirmed with patient",
  task_record_outcome_complete: "Visit notes saved",
  task_escalate_complete: "Supervisor reviewed",
};

export function prettifyEvent(eventType: string) {
  return EVENT_LABEL[eventType] ?? eventType.replace(/_/g, " ");
}
