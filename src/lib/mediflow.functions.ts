import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Stage transition map — simulating UiPath Maestro orchestration
const NEXT_STAGE: Record<string, string> = {
  intake: "pre_auth",
  pre_auth: "scheduling",
  scheduling: "appointment",
  appointment: "follow_up",
  follow_up: "closed",
};

const NEXT_TASK: Record<string, { kind: string; title: string; description: string; actor: string } | null> = {
  intake: { kind: "review_preauth", title: "Review insurance pre-authorization", description: "Submit pre-auth request to payer and review decision.", actor: "PreAuth Reasoning Agent" },
  pre_auth: { kind: "select_specialist", title: "Select specialist and propose appointment slot", description: "Match patient with available specialist for their needs.", actor: "Specialist Matching Agent" },
  scheduling: { kind: "confirm_slot", title: "Confirm appointment slot with patient", description: "Reach out to patient and confirm the scheduled time.", actor: "Patient Coordinator" },
  appointment: { kind: "record_outcome", title: "Record post-appointment outcome", description: "Capture specialist notes and next steps for follow-up.", actor: "Patient Coordinator" },
  follow_up: null,
};

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cases, tasks, breaches, events] = await Promise.all([
      supabase.from("cases").select("id,stage,priority,created_at,closed_at"),
      supabase.from("tasks").select("id,status,sla_due_at").eq("status", "open"),
      supabase.from("tasks").select("id").eq("status", "open").lt("sla_due_at", new Date().toISOString()),
      supabase.from("case_events").select("id,event_type,actor_type,actor_label,created_at,case_id,details").order("created_at", { ascending: false }).limit(8),
    ]);

    const allCases = cases.data ?? [];
    const active = allCases.filter((c) => c.stage !== "closed" && c.stage !== "cancelled").length;
    const closed = allCases.filter((c) => c.stage === "closed");
    const avgCycleDays =
      closed.length === 0
        ? 0
        : closed.reduce((acc, c) => acc + ((new Date(c.closed_at ?? c.created_at).getTime() - new Date(c.created_at).getTime()) / 86_400_000), 0) / closed.length;

    const byStage: Record<string, number> = {};
    for (const c of allCases) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;

    return {
      activeCases: active,
      openTasks: tasks.data?.length ?? 0,
      slaBreaches: breaches.data?.length ?? 0,
      avgCycleDays: Number(avgCycleDays.toFixed(1)),
      byStage,
      recentEvents: events.data ?? [],
    };
  });

export const listCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cases")
      .select("*, tasks(id,status,sla_due_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getCaseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [c, referral, preauth, appt, follow, tasks, events] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).maybeSingle(),
      supabase.from("referrals").select("*").eq("case_id", data.caseId).maybeSingle(),
      supabase.from("pre_authorizations").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("appointments").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("follow_ups").select("*").eq("case_id", data.caseId).order("recorded_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("case_events").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
    ]);
    if (!c.data) throw new Error("Case not found");
    return {
      caseRow: c.data,
      referral: referral.data,
      preauths: preauth.data ?? [],
      appointments: appt.data ?? [],
      followUps: follow.data ?? [],
      tasks: tasks.data ?? [],
      events: events.data ?? [],
    };
  });

export const listOpenTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*, cases(case_number,patient_name,specialty,priority,stage)")
      .eq("status", "open")
      .order("sla_due_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: z.string().uuid(),
        decision: z.enum(["approve", "deny", "complete", "escalate"]).default("complete"),
        notes: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: task, error: tErr } = await supabase.from("tasks").select("*").eq("id", data.taskId).maybeSingle();
    if (tErr || !task) throw new Error("Task not found");
    const { data: caseRow } = await supabase.from("cases").select("*").eq("id", task.case_id).maybeSingle();
    if (!caseRow) throw new Error("Case not found");

    // mark task complete
    await supabase
      .from("tasks")
      .update({ status: data.decision === "escalate" ? "escalated" : "completed", completed_at: new Date().toISOString() })
      .eq("id", data.taskId);

    // record event
    await supabase.from("case_events").insert({
      case_id: caseRow.id,
      actor_type: "human",
      actor_label: "Patient Coordinator",
      event_type: `task_${task.kind}_${data.decision}`,
      details: { notes: data.notes ?? null },
    });

    if (data.decision === "escalate") {
      await supabase.from("tasks").insert({
        case_id: caseRow.id,
        kind: "escalate",
        title: "Escalated: supervisor review required",
        description: data.notes ?? "Escalated by coordinator.",
        assignee_role: "supervisor",
        sla_due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      });
      return { ok: true };
    }

    if (data.decision === "deny" && task.kind === "review_preauth") {
      await supabase.from("pre_authorizations").insert({
        case_id: caseRow.id,
        payer: "Atlas Health",
        status: "denied",
        denial_reason: data.notes ?? "Denial reason not provided",
        decided_at: new Date().toISOString(),
      });
      await supabase.from("tasks").insert({
        case_id: caseRow.id,
        kind: "escalate",
        title: "Appeal pre-authorization denial",
        description: "Prepare appeal packet and resubmit to payer.",
        assignee_role: "coordinator",
        sla_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return { ok: true };
    }

    // advance stage
    const nextStage = NEXT_STAGE[caseRow.stage];
    if (nextStage) {
      await supabase
        .from("cases")
        .update({
          stage: nextStage,
          closed_at: nextStage === "closed" ? new Date().toISOString() : null,
        })
        .eq("id", caseRow.id);

      await supabase.from("case_events").insert({
        case_id: caseRow.id,
        actor_type: "system",
        actor_label: "MediFlow Orchestrator",
        event_type: "stage_transition",
        details: { from: caseRow.stage, to: nextStage },
      });

      // Create next task
      const next = NEXT_TASK[caseRow.stage];
      if (next) {
        await supabase.from("tasks").insert({
          case_id: caseRow.id,
          kind: next.kind as any,
          title: next.title,
          description: next.description,
          assignee_role: "coordinator",
          sla_due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        });
        await supabase.from("case_events").insert({
          case_id: caseRow.id,
          actor_type: nextStage === "pre_auth" ? "ai_agent" : nextStage === "scheduling" ? "ai_agent" : "human",
          actor_label: next.actor,
          event_type: "task_dispatched",
          details: { task: next.title },
        });
      }
    }

    return { ok: true };
  });

export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mrn: z.string().min(2).max(40),
        patientName: z.string().min(2).max(120),
        patientDob: z.string().optional(),
        specialty: z.string().min(2).max(80),
        priority: z.enum(["routine", "urgent", "stat"]),
        referringPhysicianName: z.string().min(2).max(120),
        diagnosisCode: z.string().optional(),
        diagnosisDescription: z.string().optional(),
        clinicalNotes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slaHours = data.priority === "stat" ? 2 : data.priority === "urgent" ? 8 : 48;
    const { data: caseRow, error } = await supabase
      .from("cases")
      .insert({
        mrn: data.mrn,
        patient_name: data.patientName,
        patient_dob: data.patientDob || null,
        specialty: data.specialty,
        priority: data.priority,
        stage: "intake",
        referring_physician_id: userId,
        referring_physician_name: data.referringPhysicianName,
        sla_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("referrals").insert({
      case_id: caseRow.id,
      diagnosis_code: data.diagnosisCode || null,
      diagnosis_description: data.diagnosisDescription || null,
      clinical_notes: data.clinicalNotes || null,
    });

    await supabase.from("tasks").insert({
      case_id: caseRow.id,
      kind: "verify_insurance",
      title: "Verify patient insurance and demographics",
      description: "Confirm coverage with payer and validate patient demographics.",
      assignee_role: "coordinator",
      sla_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
    });

    await supabase.from("case_events").insert({
      case_id: caseRow.id,
      actor_type: "human",
      actor_label: data.referringPhysicianName,
      event_type: "case_created",
      details: { source: "Referral intake form" },
    });

    return { caseId: caseRow.id };
  });
