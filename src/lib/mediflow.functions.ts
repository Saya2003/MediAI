import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import OpenAI from "openai";
import { syncCaseToUiPath, syncStageToUiPath, startJob, listProcesses, transitionMaestroCaseStage } from "./uipath";

const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-dummy",
  baseURL: "https://openrouter.ai/api/v1",
});
const AI_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

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

// ── Helpers ────────────────────────────────────────────────────────────────────
async function sendEmailNotification(params: {
  to: string; subject: string; body: string;
}) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MediFlow AI <notifications@mediflow.ai>",
        to: params.to,
        subject: params.subject,
        text: params.body,
      }),
    });
    if (!res.ok) console.warn("Email send failed:", await res.text());
  } catch (e) {
    console.warn("Email send error:", e);
  }
}

async function deliverWebhook(caseRow: any, event: string, payload: Record<string, unknown>) {
  const webhookUrl = process.env.EMR_WEBHOOK_URL;
  if (!webhookUrl) return;
  let delivered = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, case: caseRow, payload, delivered_at: new Date().toISOString() }),
      });
      if (res.ok) { delivered = true; break; }
    } catch { /* retry */ }
    if (attempt < 5) await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
  }
  return delivered;
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
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

// ── Cases ─────────────────────────────────────────────────────────────────────
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
  .validator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [c, referral, preauth, appt, follow, tasks, events, docs, decisions, summary] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).maybeSingle(),
      supabase.from("referrals").select("*").eq("case_id", data.caseId).maybeSingle(),
      supabase.from("pre_authorizations").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("appointments").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("follow_ups").select("*").eq("case_id", data.caseId).order("recorded_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("case_events").select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("case_documents" as any).select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("human_decisions" as any).select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }),
      supabase.from("case_summaries" as any).select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }).limit(1),
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
      documents: (docs.data as any[]) ?? [],
      decisions: (decisions.data as any[]) ?? [],
      summary: (summary.data as any[])?.[0] ?? null,
    };
  });

export const exportCasesCSV = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("cases").select("case_number,patient_name,mrn,specialty,stage,priority,created_at,closed_at,sla_due_at");
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(10000);
    if (error) throw error;
    const cols = ["case_number","patient_name","mrn","specialty","stage","priority","created_at","closed_at","sla_due_at"];
    const csv = [cols.join(","), ...(rows ?? []).map((r: any) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
    return { csv };
  });

// ── Tasks ─────────────────────────────────────────────────────────────────────
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
  .validator((d) =>
    z.object({
      taskId: z.string().uuid(),
      decision: z.enum(["approve", "deny", "complete", "escalate"]).default("complete"),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error: tErr } = await supabase.from("tasks").select("*").eq("id", data.taskId).maybeSingle();
    if (tErr || !task) throw new Error("Task not found");
    const { data: caseRow } = await supabase.from("cases").select("*").eq("id", task.case_id).maybeSingle();
    if (!caseRow) throw new Error("Case not found");

    await supabase.from("tasks")
      .update({ status: data.decision === "escalate" ? "escalated" : "completed", completed_at: new Date().toISOString() })
      .eq("id", data.taskId);

    // Audit human decision
    await supabase.from("human_decisions" as any).insert({
      case_id: caseRow.id,
      action_center_task_id: data.taskId,
      decided_by: userId,
      decision: data.decision === "approve" ? "approve" : data.decision === "deny" ? "deny" : data.decision === "escalate" ? "escalate" : "complete",
      reasoning: data.notes ?? null,
    });

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

    // Pre-auth approved — record it
    if (data.decision === "approve" && task.kind === "review_preauth") {
      await supabase.from("pre_authorizations").insert({
        case_id: caseRow.id,
        payer: "Atlas Health",
        status: "approved",
        decided_at: new Date().toISOString(),
      });
    }

    const nextStage = NEXT_STAGE[caseRow.stage];
    if (nextStage) {
      await supabase.from("cases").update({
        stage: nextStage as any,
        closed_at: nextStage === "closed" ? new Date().toISOString() : null,
      }).eq("id", caseRow.id);

      await supabase.from("case_events").insert({
        case_id: caseRow.id,
        actor_type: "system",
        actor_label: "MediFlow Orchestrator",
        event_type: "stage_transition",
        details: { from: caseRow.stage, to: nextStage },
      });

      // Notify referring physician on key milestones (FR-032)
      if (["scheduling", "follow_up", "closed"].includes(nextStage) && caseRow.referring_physician_id) {
        await supabase.from("notifications").insert({
          case_id: caseRow.id,
          user_id: caseRow.referring_physician_id as string,
          message: `Case ${caseRow.case_number}: ${caseRow.patient_name} reached "${nextStage}" stage.`,
        });
      }

      // Generate AI summary on follow_up stage
      if (nextStage === "follow_up") {
        let summary = `Clinical summary for ${caseRow.patient_name} (MRN: ${caseRow.mrn}): Case progressed through intake, insurance pre-authorization, specialist scheduling, and appointment stages for ${caseRow.specialty}. Case opened ${new Date(caseRow.created_at).toLocaleDateString()}. All prior authorizations obtained. Appointment completed. Follow-up coordination initiated.`;

        if (process.env.OPENROUTER_API_KEY) {
          try {
            const { data: ref } = await supabase.from("referrals").select("*").eq("case_id", caseRow.id).single();
            const prompt = `Write a professional 3-sentence clinical summary for a patient who just completed an appointment.
Patient: ${caseRow.patient_name}
MRN: ${caseRow.mrn}
Specialty: ${caseRow.specialty}
Original Clinical Notes: ${ref?.clinical_notes || 'None'}
Diagnosis: ${ref?.diagnosis_description || 'None'}

The summary should mention the initial reason for referral and confirm the appointment was completed. Do not use Markdown, just plain text.`;
            
            const response = await ai.chat.completions.create({
              model: AI_MODEL,
              messages: [{ role: "user", content: prompt }],
            });
            const text = response.choices?.[0]?.message?.content;
            if (text) summary = text.trim();
          } catch (e) {
            console.error("AI Summary Error:", e);
          }
        }

        await supabase.from("case_summaries" as any).insert({
          case_id: caseRow.id,
          summary_text: summary,
          generated_by: "AI Clinical Summarisation Agent",
        });
        await supabase.from("case_events").insert({
          case_id: caseRow.id,
          actor_type: "ai_agent",
          actor_label: "AI Summarisation Agent",
          event_type: "case_summary_generated",
          details: {},
        });
      }

      // Closure webhook delivery to EMR (FR-050)
      if (nextStage === "closed") {
        const { data: latestSummary } = await supabase.from("case_summaries" as any).select("summary_text").eq("case_id", caseRow.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const delivered = await deliverWebhook(caseRow, "case_closed", { summary: (latestSummary as any)?.summary_text ?? null });
        await supabase.from("case_events").insert({
          case_id: caseRow.id,
          actor_type: "system",
          actor_label: "MediFlow Orchestrator",
          event_type: "closure_webhook_sent",
          details: { destination: "EMR System", status: delivered ? "delivered" : "failed", retries: delivered !== undefined && !delivered ? 5 : 0 },
        });
      }

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
          actor_type: nextStage === "pre_auth" || nextStage === "scheduling" ? "ai_agent" : "human",
          actor_label: next.actor,
          event_type: "task_dispatched",
          details: { task: next.title },
        });
      }
    }

    // Sync stage transition to UiPath Maestro
    if (nextStage) {
      Promise.resolve().then(() =>
        syncStageToUiPath({
          caseId: caseRow.id,
          stage: nextStage,
          previousStage: caseRow.stage,
          patientName: caseRow.patient_name,
        }).catch(() => {})
      );
    }

    return { ok: true };
  });

// ── Referrals ─────────────────────────────────────────────────────────────────
export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      mrn: z.string().min(2).max(40),
      patientName: z.string().min(2).max(120),
      patientDob: z.string().optional(),
      specialty: z.string().min(2).max(80),
      priority: z.enum(["routine", "urgent", "stat"]),
      referringPhysicianName: z.string().min(2).max(120),
      diagnosisCode: z.string().optional(),
      diagnosisDescription: z.string().optional(),
      clinicalNotes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Intelligent Triage (Gemini AI Agent)
    let autoPriority = data.priority;
    let autoIcdCode = data.diagnosisCode;
    let autoSpecialty = data.specialty;
    let aiReasoning = null;

    if (process.env.OPENROUTER_API_KEY && (data.clinicalNotes || data.diagnosisDescription)) {
      try {
        const prompt = `Analyze this patient referral. 
Diagnosis: ${data.diagnosisDescription || 'None'}
Clinical Notes: ${data.clinicalNotes || 'None'}
Current Priority: ${data.priority}
Current Specialty: ${data.specialty}

Tasks:
1. Identify the most appropriate ICD-10 code based on the clinical notes.
2. Recommend the urgency priority ("routine", "urgent", or "stat") based on clinical severity.
3. Confirm or suggest the appropriate medical specialty.
4. Provide a 1-sentence reasoning for these recommendations.

Respond STRICTLY in JSON format.`;
        
        const response = await ai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });

        const result = JSON.parse(response.choices?.[0]?.message?.content || "{}");
        if (result.icd10_code && !autoIcdCode) autoIcdCode = result.icd10_code;
        autoPriority = result.priority;
        autoSpecialty = result.specialty;
        aiReasoning = result.reasoning;
      } catch (e) {
        console.error("AI Triage Error:", e);
      }
    }

    // ICD-10 validation (FR-002)
    if (autoIcdCode) {
      const { data: icd } = await supabase.from("icd10_codes" as any).select("code,description,severity_score").eq("code", autoIcdCode.toUpperCase()).maybeSingle();
      if (data.diagnosisCode && !icd) {
        const { data: suggestions } = await supabase.from("icd10_codes" as any).select("code,description").limit(5);
        throw new Error(`ICD-10 code "${data.diagnosisCode}" not found. Suggestions: ${(suggestions as any[] ?? []).map((s: any) => s.code).join(", ")}`);
      }
      // Auto-priority from severity overrides AI if DB score dictates (FR-003)
      if (icd) {
        const score = (icd as any).severity_score as number;
        if (score >= 3) autoPriority = "stat";
        else if (score >= 2 && autoPriority !== "stat") autoPriority = "urgent";
      }
    }

    const slaHours = autoPriority === "stat" ? 2 : autoPriority === "urgent" ? 8 : 48;
    const { data: caseRow, error } = await supabase
      .from("cases")
      .insert({
        mrn: data.mrn,
        patient_name: data.patientName,
        patient_dob: data.patientDob || null,
        specialty: autoSpecialty,
        priority: autoPriority,
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
      diagnosis_code: autoIcdCode || null,
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
      details: { source: "Referral intake form", auto_priority: autoPriority !== data.priority ? autoPriority : null },
    });

    // Auto-acknowledgement notification to referring physician (FR-004)
    await supabase.from("notifications").insert({
      case_id: caseRow.id,
      user_id: userId,
      message: `Referral submitted: ${data.patientName} (${data.specialty}) — ${autoPriority} priority. Case opened.`,
    });

    if (aiReasoning) {
      await supabase.from("case_events").insert({
        case_id: caseRow.id,
        actor_type: "ai_agent",
        actor_label: "AI Triage Agent",
        event_type: "triage_recommendation",
        details: { icd10_code: autoIcdCode, priority: autoPriority, specialty: autoSpecialty, reasoning: aiReasoning },
      });
    }

    // Sync to UiPath Maestro Case + Action Center
    Promise.resolve().then(() =>
      syncCaseToUiPath({
        caseId: caseRow.id,
        patientName: data.patientName,
        specialty: autoSpecialty,
        stage: "intake",
        priority: autoPriority,
        mrn: data.mrn,
      }).catch(() => {})
    );

    return { caseId: caseRow.id, assignedPriority: autoPriority };
  });

// ── Specialists ───────────────────────────────────────────────────────────────
export const listSpecialists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ specialty: z.string().optional(), caseId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = (supabase as any).from("specialists").select("*");
    if (data.specialty) q = q.ilike("specialty", `%${data.specialty}%`);
    const { data: specialists, error } = await q.order("full_name");
    if (error) throw error;

    // Conflict check: does patient already have appt in next 48h?
    let conflict = false;
    if (data.caseId) {
      const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const { data: appts } = await supabase.from("appointments").select("id,scheduled_at").eq("case_id", data.caseId).gte("scheduled_at", now).lte("scheduled_at", cutoff);
      conflict = (appts?.length ?? 0) > 0;
    }

    return { specialists: specialists ?? [], conflict };
  });

export const confirmAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      caseId: z.string().uuid(),
      specialistId: z.string().uuid(),
      specialistName: z.string(),
      scheduledAt: z.string(),
      location: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Conflict detection (FR-015)
    const cutoff48Before = new Date(new Date(data.scheduledAt).getTime() - 48 * 60 * 60 * 1000).toISOString();
    const cutoff48After = new Date(new Date(data.scheduledAt).getTime() + 48 * 60 * 60 * 1000).toISOString();
    const { data: conflicts } = await supabase.from("appointments")
      .select("id,scheduled_at")
      .eq("case_id", data.caseId)
      .gte("scheduled_at", cutoff48Before)
      .lte("scheduled_at", cutoff48After)
      .neq("status", "cancelled");

    await supabase.from("appointments").insert({
      case_id: data.caseId,
      specialist_id: data.specialistId,
      specialist_name: data.specialistName,
      scheduled_at: data.scheduledAt,
      status: "confirmed",
      location: data.location ?? "Clinic A, MediFlow General Hospital",
    });

    await supabase.from("case_events").insert({
      case_id: data.caseId,
      actor_type: "human",
      actor_label: "Patient Coordinator",
      event_type: "appointment_confirmed",
      details: { specialist: data.specialistName, scheduled_at: data.scheduledAt, had_conflict_warning: (conflicts?.length ?? 0) > 0 },
    });

    return { ok: true, conflictWarning: (conflicts?.length ?? 0) > 0 };
  });

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    return { ok: true };
  });

export const snoozeNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ hours: z.number().min(1).max(24).default(24) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const snoozeUntil = new Date(Date.now() + data.hours * 60 * 60 * 1000).toISOString();
    await (supabase as any).from("notification_prefs").upsert({ user_id: userId, snooze_until: snoozeUntil }, { onConflict: "user_id" });
    return { ok: true, snoozeUntil };
  });

// ── Admin / Supervisor ────────────────────────────────────────────────────────
export const getAdminMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cases, tasks, decisions] = await Promise.all([
      supabase.from("cases").select("id,stage,priority,created_at,closed_at,sla_due_at"),
      supabase.from("tasks").select("id,status,sla_due_at,kind"),
      (supabase as any).from("human_decisions").select("id,decision,created_at"),
    ]);

    const allCases = (cases.data ?? []) as any[];
    const allTasks = (tasks.data ?? []) as any[];
    const allDecisions = (decisions.data ?? []) as any[];

    const closedCases = allCases.filter((c) => c.stage === "closed");
    const avgCycle = closedCases.length
      ? closedCases.reduce((a, c) => a + (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 86_400_000, 0) / closedCases.length
      : 0;

    const slaBreached = allTasks.filter((t) => t.status === "open" && t.sla_due_at && new Date(t.sla_due_at) < new Date()).length;
    const byStage: Record<string, number> = {};
    for (const c of allCases) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
    const byPriority: Record<string, number> = {};
    for (const c of allCases) byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;
    const byDecision: Record<string, number> = {};
    for (const d of allDecisions) byDecision[d.decision] = (byDecision[d.decision] ?? 0) + 1;

    return {
      totalCases: allCases.length,
      activeCases: allCases.filter((c) => c.stage !== "closed" && c.stage !== "cancelled").length,
      closedCases: closedCases.length,
      avgCycleDays: Number(avgCycle.toFixed(1)),
      slaBreaches: slaBreached,
      slaCompliance: allTasks.length ? Math.round(((allTasks.length - slaBreached) / allTasks.length) * 100) : 100,
      byStage,
      byPriority,
      byDecision,
    };
  });

export const getSystemConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).from("system_config").select("*").order("config_key");
    if (error) throw error;
    return (data ?? []) as { config_key: string; config_value: string }[];
  });

export const updateSystemConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ config_key: z.string(), config_value: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any).from("system_config")
      .upsert({ config_key: data.config_key, config_value: data.config_value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "config_key" });
    if (error) throw error;
    return { ok: true };
  });

export const listUsersAndRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id,full_name,email,organization,user_roles(role,id)");
    if (error) throw error;
    return (data ?? []) as any[];
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["coordinator", "physician", "specialist", "supervisor"]),
      action: z.enum(["add", "remove"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.action === "add") {
      await supabase.from("user_roles").upsert({ user_id: data.userId, role: data.role as any }, { onConflict: "user_id,role" });
    } else {
      await supabase.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role as any);
    }
    return { ok: true };
  });

// ── Document Upload (FR-005 / FR-043) ─────────────────────────────────────────
export const uploadCaseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      caseId: z.string().uuid(),
      fileName: z.string().min(1).max(255),
      fileType: z.string().min(1),
      contentBase64: z.string().min(1),
      documentType: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const buf = Buffer.from(data.contentBase64, "base64");
    const storagePath = `case_documents/${data.caseId}/${crypto.randomUUID()}-${data.fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from("case_documents")
      .upload(storagePath, buf, { contentType: data.fileType, upsert: false });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: pubUrl } = supabase.storage.from("case_documents").getPublicUrl(storagePath);

    await supabase.from("case_documents" as any).insert({
      case_id: data.caseId,
      storage_path: pubUrl?.publicUrl ?? storagePath,
      document_type: data.documentType ?? data.fileType,
      uploaded_by: userId,
    });

    await supabase.from("case_events").insert({
      case_id: data.caseId,
      actor_type: "human",
      actor_label: "Patient Coordinator",
      event_type: "document_uploaded",
      details: { file: data.fileName, type: data.documentType ?? data.fileType },
    });

    return { url: pubUrl?.publicUrl ?? storagePath };
  });

export const aiExtractDocumentFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      caseId: z.string().uuid(),
      textContent: z.string().min(1).max(50000),
      fileType: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!process.env.OPENROUTER_API_KEY) return { extracted: null, note: "AI not configured" };

    if (data.fileType?.startsWith("image/")) {
      return { extracted: null, note: "AI extraction requires text-based documents (PDF, TXT). The current AI model does not support image processing." };
    }

    const { data: c } = await supabase.from("cases").select("patient_name,mrn,specialty").eq("id", data.caseId).maybeSingle();
    if (!c) throw new Error("Case not found");

    try {
      const response = await ai.chat.completions.create({
        model: AI_MODEL,
        messages: [{
          role: "user",
          content: `Extract structured information from this referral document text for patient ${c.patient_name} (MRN: ${c.mrn}).

Document text:
${data.textContent.slice(0, 10000)}

Return JSON with:
- diagnosis_code (ICD-10 code if identifiable, else null)
- diagnosis_description (plain text)
- specialty (suggested specialty if different from current "${c.specialty}")
- key_findings (array of up to 3 bullet points)
- urgency (one of: "routine", "urgent", "stat")`,
        }],
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(response.choices?.[0]?.message?.content || "{}");

      await supabase.from("case_events").insert({
        case_id: data.caseId,
        actor_type: "ai_agent",
        actor_label: "AI Document Extraction Agent",
        event_type: "document_fields_extracted",
        details: extracted,
      });

      return { extracted };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("does not support image") || msg.includes("image input") || msg.includes("Cannot read")) {
        return { extracted: null, note: "AI extraction requires text-based documents. Upload a text document (PDF, TXT) to use this feature." };
      }
      throw err;
    }
  });

// ── SLA Breach Detection & Escalation (FR-028) ───────────────────────────────
export const checkSlaBreaches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const now = new Date().toISOString();

    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select("*, cases!inner(id,patient_name,stage,case_number)")
      .eq("status", "open")
      .lt("sla_due_at", now)
      .order("sla_due_at", { ascending: true });

    const results: { taskId: string; escalated: boolean; reason: string }[] = [];

    for (const task of (overdueTasks ?? []) as any[]) {
      const alreadyEscalated = results.some((r) => r.taskId === task.id);
      if (alreadyEscalated) continue;

      const hasExistingEscalation = await supabase
        .from("tasks")
        .select("id")
        .eq("case_id", task.case_id)
        .eq("kind", "escalate")
        .eq("status", "open")
        .maybeSingle();

      if (hasExistingEscalation.data) continue;

      await supabase.from("tasks").insert({
        case_id: task.case_id,
        kind: "escalate",
        title: `SLA breach: "${task.title}" overdue`,
        description: `Task "${task.title}" on case ${task.cases?.case_number ?? ""} passed its SLA deadline. Supervisor attention required.`,
        assignee_role: "supervisor",
        sla_due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      });

      await supabase.from("case_events").insert({
        case_id: task.case_id,
        actor_type: "system",
        actor_label: "MediFlow Orchestrator",
        event_type: "sla_breach_escalated",
        details: { task_id: task.id, task_title: task.title, sla_due_at: task.sla_due_at },
      });

      results.push({ taskId: task.id, escalated: true, reason: "SLA breach" });
    }

    return { breached: (overdueTasks ?? []).length, escalated: results.length, details: results };
  });

// ── Demo Seed / Auto-Pilot ──────────────────────────────────────────────────
const DEMO_SPECIALTIES = [
  "Cardiology (Heart)", "Neurology (Brain & Nerves)", "Orthopedics (Bones & Joints)",
  "Oncology (Cancer)", "Dermatology (Skin)", "Endocrinology (Hormones)",
];

const DEMO_PATIENTS = [
  { name: "James Wilson",  mrn: "MRN-10001", dob: "1985-03-12", diag: "I25.10", diagDesc: "Atherosclerotic heart disease", notes: "Chest pain on exertion. Family history of CAD." },
  { name: "Maria Garcia",  mrn: "MRN-10002", dob: "1992-07-24", diag: "G40.909", diagDesc: "Epilepsy, unspecified", notes: "Two seizures in past month. Current meds not controlling symptoms." },
  { name: "Robert Kim",    mrn: "MRN-10003", dob: "1978-11-03", diag: "M17.9",   diagDesc: "Osteoarthritis of knee", notes: "Right knee pain limiting mobility. Failed conservative therapy." },
  { name: "Aisha Patel",   mrn: "MRN-10004", dob: "2001-05-19", diag: "L20.9",   diagDesc: "Atopic dermatitis", notes: "Severe flare-up unresponsive to topical steroids." },
  { name: "David Chen",    mrn: "MRN-10005", dob: "1965-09-08", diag: "E11.9",   diagDesc: "Type 2 diabetes", notes: "Poor glycemic control. Referral for endocrine evaluation." },
  { name: "Sarah Johnson", mrn: "MRN-10006", dob: "1995-12-30", diag: null,      diagDesc: "Recurrent migraines", notes: "Weekly migraines affecting work. Needs neurology consult." },
];

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase: userSupabase, userId } = context;
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
    );

    const results: string[] = [];

    // ── Create additional auth users ──────────────────────────────────────
    const demoUsers = [
      { email: "physician@mediflow.demo",  password: "demo123456", name: "Dr. Sarah Chen",       role: "physician" },
      { email: "specialist@mediflow.demo", password: "demo123456", name: "Dr. Marcus Bell",       role: "specialist" },
      { email: "supervisor@mediflow.demo", password: "demo123456", name: "Elena Rodriguez",       role: "supervisor" },
    ];

    const userIds: Record<string, string> = {};

    for (const u of demoUsers) {
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((eu) => eu.email === u.email);
      if (found) {
        userIds[u.role] = found.id;
        results.push(`User ${u.email} already exists`);
        continue;
      }
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.name },
      });
      if (error) { results.push(`Failed to create ${u.email}: ${error.message}`); continue; }
      userIds[u.role] = data.user.id;
      results.push(`Created user ${u.email} (${u.role})`);
    }

    // Assign roles
    for (const u of demoUsers) {
      if (userIds[u.role]) {
        await supabase.from("user_roles").upsert(
          { user_id: userIds[u.role], role: u.role },
          { onConflict: "user_id,role" }
        );
      }
    }

    // Also ensure current user has coordinator + supervisor roles
    await supabase.from("user_roles").upsert(
      { user_id: userId, role: "coordinator" },
      { onConflict: "user_id,role" }
    );
    await supabase.from("user_roles").upsert(
      { user_id: userId, role: "supervisor" },
      { onConflict: "user_id,role" }
    );

    // ── Seed ICD-10 codes ────────────────────────────────────────────────
    const icdCodes = [
      { code: "I25.10", desc: "Atherosclerotic heart disease of native coronary artery without angina pectoris", score: 2 },
      { code: "I21.09", desc: "ST elevation (STEMI) myocardial infarction involving other coronary artery", score: 3 },
      { code: "E11.9",  desc: "Type 2 diabetes mellitus without complications", score: 1 },
      { code: "E11.65", desc: "Type 2 diabetes mellitus with hyperglycemia", score: 2 },
      { code: "M17.9",  desc: "Osteoarthritis of knee, unspecified", score: 1 },
      { code: "M54.5",  desc: "Low back pain", score: 1 },
      { code: "C50.912",desc: "Malignant neoplasm of unspecified site of left female breast", score: 3 },
      { code: "C34.10", desc: "Malignant neoplasm of upper lobe, bronchus or lung, unspecified", score: 3 },
      { code: "L20.9",  desc: "Atopic dermatitis, unspecified", score: 1 },
      { code: "G40.909",desc: "Epilepsy, unspecified, not intractable, without status epilepticus", score: 2 },
      { code: "G35",    desc: "Multiple sclerosis", score: 2 },
      { code: "J45.909",desc: "Unspecified asthma, uncomplicated", score: 2 },
    ];
    for (const icd of icdCodes) {
      await supabase.from("icd10_codes").upsert(
        { code: icd.code, description: icd.desc, severity_score: icd.score },
        { onConflict: "code" }
      );
    }

    // ── Seed specialists (3 per specialty × 6 specialties) ────────────────
    const SPECIALIST_POOL = [
      // Cardiology (Heart)
      { name: "Dr. Robert Vance",  specialty: "Cardiology (Heart)",          lat: 37.7749, lng: -122.4194, networks: ["Atlas Health","Cigna Premium","UnitedHealthcare"] },
      { name: "Dr. Anita Rao",     specialty: "Cardiology (Heart)",          lat: 37.7781, lng: -122.4223, networks: ["Atlas Health","Cigna Premium"] },
      { name: "Dr. Michael Tran",  specialty: "Cardiology (Heart)",          lat: 37.7712, lng: -122.4176, networks: ["UnitedHealthcare"] },
      // Neurology (Brain & Nerves)
      { name: "Dr. Sarah Lin",     specialty: "Neurology (Brain & Nerves)",  lat: 37.7833, lng: -122.4167, networks: ["Atlas Health","Cigna Premium"] },
      { name: "Dr. David Okafor",  specialty: "Neurology (Brain & Nerves)",  lat: 37.7805, lng: -122.4140, networks: ["Atlas Health","UnitedHealthcare"] },
      { name: "Dr. Lisa Park",     specialty: "Neurology (Brain & Nerves)",  lat: 37.7850, lng: -122.4182, networks: ["Cigna Premium","UnitedHealthcare"] },
      // Orthopedics (Bones & Joints)
      { name: "Dr. James Carter",  specialty: "Orthopedics (Bones & Joints)",lat: 37.7699, lng: -122.4468, networks: ["Atlas Health","UnitedHealthcare"] },
      { name: "Dr. Rachel Kim",    specialty: "Orthopedics (Bones & Joints)",lat: 37.7672, lng: -122.4491, networks: ["Atlas Health","Cigna Premium"] },
      { name: "Dr. Carlos Mendez", specialty: "Orthopedics (Bones & Joints)",lat: 37.7725, lng: -122.4443, networks: ["Cigna Premium","UnitedHealthcare"] },
      // Oncology (Cancer)
      { name: "Dr. Emily Watson",  specialty: "Oncology (Cancer)",           lat: 37.7599, lng: -122.4368, networks: ["Atlas Health","Cigna Premium","UnitedHealthcare"] },
      { name: "Dr. Frank Okonkwo", specialty: "Oncology (Cancer)",           lat: 37.7575, lng: -122.4392, networks: ["Atlas Health","Cigna Premium"] },
      { name: "Dr. Grace Liu",     specialty: "Oncology (Cancer)",           lat: 37.7620, lng: -122.4345, networks: ["UnitedHealthcare"] },
      // Dermatology (Skin)
      { name: "Dr. Priya Sharma",  specialty: "Dermatology (Skin)",          lat: 37.7800, lng: -122.4100, networks: ["Cigna Premium"] },
      { name: "Dr. Kevin Brown",   specialty: "Dermatology (Skin)",          lat: 37.7778, lng: -122.4134, networks: ["Atlas Health","UnitedHealthcare"] },
      { name: "Dr. Nina Patel",    specialty: "Dermatology (Skin)",          lat: 37.7822, lng: -122.4088, networks: ["Atlas Health","Cigna Premium"] },
      // Endocrinology (Hormones)
      { name: "Dr. Marcus Bell",   specialty: "Endocrinology (Hormones)",    lat: 37.7650, lng: -122.4250, networks: ["Atlas Health","UnitedHealthcare"] },
      { name: "Dr. Olivia Reed",   specialty: "Endocrinology (Hormones)",    lat: 37.7628, lng: -122.4277, networks: ["Atlas Health","Cigna Premium"] },
      { name: "Dr. Samir Hassan",  specialty: "Endocrinology (Hormones)",    lat: 37.7675, lng: -122.4225, networks: ["Cigna Premium","UnitedHealthcare"] },
    ];
    for (const s of SPECIALIST_POOL) {
      const { data: existing } = await supabase.from("specialists").select("id").eq("full_name", s.name).maybeSingle();
      if (!existing) {
        await supabase.from("specialists").insert({
          full_name: s.name, specialty: s.specialty,
          location_lat: s.lat, location_lng: s.lng,
          insurance_networks: s.networks,
          calendar_api_token_ref: `token_${s.name.toLowerCase().replace(/\s/g, "_")}`,
        });
      }
    }

    // ── Seed demo cases ───────────────────────────────────────────────────
    const stages = ["intake", "pre_auth", "scheduling", "appointment", "follow_up", "closed"];
    const physicianId = userIds["physician"] || userId;
    const priorityOpts = ["routine", "urgent", "stat"];

    for (let i = 0; i < DEMO_PATIENTS.length; i++) {
      const p = DEMO_PATIENTS[i];
      const stageIdx = Math.min(i, stages.length - 1);
      const stage = stages[stageIdx];
      const priority = i < 2 ? "urgent" : i < 4 ? "routine" : "stat";
      const slaHours = priority === "stat" ? 2 : priority === "urgent" ? 8 : 48;

      const { data: caseRow } = await supabase.from("cases").insert({
        mrn: p.mrn, patient_name: p.name, patient_dob: p.dob,
        specialty: DEMO_SPECIALTIES[i % DEMO_SPECIALTIES.length],
        priority, stage,
        referring_physician_id: physicianId,
        referring_physician_name: "Dr. Sarah Chen",
        sla_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
        closed_at: stage === "closed" ? new Date().toISOString() : null,
      }).select().single();

      if (!caseRow) continue;

      await supabase.from("referrals").insert({
        case_id: caseRow.id, diagnosis_code: p.diag,
        diagnosis_description: p.diagDesc, clinical_notes: p.notes,
      });

      await supabase.from("case_events").insert({
        case_id: caseRow.id, actor_type: "human",
        actor_label: "Dr. Sarah Chen", event_type: "case_created",
        details: { source: "EMR Referral Portal" },
      });

      // Create stage-appropriate data and tasks
      if (stage === "intake") {
        await supabase.from("tasks").insert({
          case_id: caseRow.id, kind: "verify_insurance",
          title: "Verify patient insurance and demographics",
          description: "Confirm coverage with payer and validate patient demographics.",
          assignee_role: "coordinator",
          sla_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
        });
      }

      if (["pre_auth", "scheduling", "appointment", "follow_up", "closed"].includes(stage)) {
        // Mark insurance verified
        await supabase.from("tasks").insert({
          case_id: caseRow.id, kind: "verify_insurance",
          title: "Verify patient insurance and demographics",
          description: "Confirm coverage with payer and validate patient demographics.",
          assignee_role: "coordinator", status: "completed",
          completed_at: new Date(Date.now() - 86400000).toISOString(),
          sla_due_at: new Date(Date.now() - 86400000 + slaHours * 60 * 60 * 1000).toISOString(),
        });
        await supabase.from("case_events").insert({
          case_id: caseRow.id, actor_type: "system",
          actor_label: "MediFlow Orchestrator", event_type: "stage_transition",
          details: { from: "intake", to: "pre_auth" },
        });

        // Pre-auth
        if (i % 3 === 1) {
          await supabase.from("pre_authorizations").insert({
            case_id: caseRow.id, payer: "Atlas Health",
            status: "approved", authorization_number: `AUTH-${10000 + i}`,
            decided_at: new Date(Date.now() - 7200000).toISOString(),
          });
        }

        if (["scheduling", "appointment", "follow_up", "closed"].includes(stage)) {
          await supabase.from("tasks").insert({
            case_id: caseRow.id, kind: "review_preauth",
            title: "Review insurance pre-authorization",
            description: "Submit pre-auth request to payer and review decision.",
            assignee_role: "coordinator", status: "completed",
            completed_at: new Date(Date.now() - 7200000).toISOString(),
            sla_due_at: new Date(Date.now() - 7200000 + 8 * 60 * 60 * 1000).toISOString(),
          });
          await supabase.from("case_events").insert({
            case_id: caseRow.id, actor_type: "ai_agent",
            actor_label: "PreAuth Reasoning Agent", event_type: "stage_transition",
            details: { from: "pre_auth", to: "scheduling" },
          });
          await supabase.from("human_decisions" as any).insert({
            case_id: caseRow.id, decided_by: userId,
            decision: i % 3 === 1 ? "approve" : "complete",
            reasoning: "Pre-authorization approved. Coverage confirmed.",
          });
        }

        if (["appointment", "follow_up", "closed"].includes(stage)) {
          const spec = specialists[i % specialists.length];
          await supabase.from("appointments").insert({
            case_id: caseRow.id, specialist_id: null,
            specialist_name: spec.name,
            scheduled_at: new Date(Date.now() + (i - 2) * 86400000).toISOString(),
            status: stage === "appointment" ? "confirmed" : "completed",
            location: "Clinic A, MediFlow General Hospital",
            outcome_notes: stage === "follow_up" || stage === "closed" ? "Patient responded well to treatment. Follow-up in 3 months." : null,
            outcome_recorded_at: stage === "follow_up" || stage === "closed" ? new Date(Date.now() - 86400000).toISOString() : null,
          });
          await supabase.from("case_events").insert({
            case_id: caseRow.id, actor_type: "system",
            actor_label: "MediFlow Orchestrator", event_type: "stage_transition",
            details: { from: "scheduling", to: "appointment" },
          });
        }

        if (["follow_up", "closed"].includes(stage)) {
          await supabase.from("follow_ups" as any).insert({
            case_id: caseRow.id,
            outcome_notes: "Patient recovering well. Medication plan adjusted.",
            next_action: "Schedule follow-up in 3 months.",
          });
          await supabase.from("case_events").insert({
            case_id: caseRow.id, actor_type: "ai_agent",
            actor_label: "AI Summarisation Agent", event_type: "case_summary_generated",
            details: {},
          });
          await supabase.from("case_summaries").insert({
            case_id: caseRow.id, generated_by: "AI Clinical Summarisation Agent",
            summary_text: `Clinical summary for ${p.name} (MRN: ${p.mrn}): Patient presented with ${p.diagDesc}. Pre-authorization obtained, specialist consultation completed. All follow-up tasks closed. Case resolved.`,
          });
        }

        if (stage === "closed") {
          await supabase.from("case_events").insert({
            case_id: caseRow.id, actor_type: "system",
            actor_label: "MediFlow Orchestrator", event_type: "closure_webhook_sent",
            details: { destination: "EMR System", status: "delivered" },
          });
        }
      }

      results.push(`Created case ${caseRow.case_number} (${p.name}) — ${stage}`);
    }

    // ── Seed system config ────────────────────────────────────────────────
    const configs = [
      { key: "sla_hours_stat", val: "2" },
      { key: "sla_hours_urgent", val: "8" },
      { key: "sla_hours_routine", val: "48" },
      { key: "max_preauth_retries", val: "3" },
      { key: "preauth_retry_delay_seconds", val: "5" },
      { key: "followup_days_after_visit", val: "7" },
      { key: "escalation_days_no_outcome", val: "14" },
      { key: "action_center_sla_hours", val: "4" },
    ];
    for (const c of configs) {
      await supabase.from("system_config").upsert(
        { config_key: c.key, config_value: c.val, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "config_key" }
      );
    }

    return { ok: true, results };
  });

// ── Auto-Pilot: Advance a case to the next stage ───────────────────────────
export const advanceCaseStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caseRow } = await supabase.from("cases").select("*").eq("id", data.caseId).maybeSingle();
    if (!caseRow) throw new Error("Case not found");

    const NEXT_STAGE_MAP: Record<string, string> = {
      intake: "pre_auth", pre_auth: "scheduling", scheduling: "appointment",
      appointment: "follow_up", follow_up: "closed",
    };
    const nextStage = NEXT_STAGE_MAP[caseRow.stage as string];
    if (!nextStage) throw new Error(`Case already at final stage: ${caseRow.stage}`);

    // Simulate RPA agent action
    await supabase.from("tasks").insert({
      case_id: caseRow.id,
      kind: `rpa_auto_complete` as any,
      title: `[RPA] Auto-completed: ${caseRow.stage}`,
      description: `UiPath RPA robot processed stage "${caseRow.stage}" for case ${caseRow.case_number}.`,
      assignee_role: "coordinator" as any,
      status: "completed",
      completed_at: new Date().toISOString(),
      sla_due_at: new Date(Date.now() + 3600000).toISOString(),
    });

    await supabase.from("case_events").insert({
      case_id: caseRow.id, actor_type: "rpa",
      actor_label: "MediFlow RPA Robot",
      event_type: "rpa_stage_completed",
      details: { from: caseRow.stage, to: nextStage, automated: true },
    });

    // Advance stage
    await supabase.from("cases").update({
      stage: nextStage as any,
      closed_at: nextStage === "closed" ? new Date().toISOString() : null,
    }).eq("id", caseRow.id);

    await supabase.from("case_events").insert({
      case_id: caseRow.id, actor_type: "system",
      actor_label: "MediFlow Orchestrator", event_type: "stage_transition",
      details: { from: caseRow.stage, to: nextStage },
    });

    // Create next task if applicable
    const NEXT_TASK_MAP: Record<string, { kind: string; title: string; description: string }> = {
      intake: { kind: "verify_insurance", title: "Verify patient insurance and demographics", description: "Confirm coverage with payer." },
      pre_auth: { kind: "review_preauth", title: "Review insurance pre-authorization", description: "Submit pre-auth request and review decision." },
      scheduling: { kind: "select_specialist", title: "Select specialist and propose appointment slot", description: "Match patient with available specialist." },
      appointment: { kind: "confirm_slot", title: "Confirm appointment slot with patient", description: "Reach out to patient and confirm the scheduled time." },
      follow_up: null as any,
    };
    const nextTaskDef = NEXT_TASK_MAP[caseRow.stage as string];
    if (nextTaskDef) {
      await supabase.from("tasks").insert({
        case_id: caseRow.id, kind: nextTaskDef.kind as any,
        title: nextTaskDef.title, description: nextTaskDef.description,
        assignee_role: "coordinator" as any,
        sla_due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Fire UiPath robot job + sync Maestro case stage
    Promise.resolve().then(async () => {
      try {
        const procList = await listProcesses();
        if (procList.ok && Array.isArray(procList.data?.value)) {
          const proc = procList.data.value.find(
            (p: any) => p.Name && p.Name.toLowerCase().includes("mediflow")
          );
          if (proc) {
            await startJob(proc.Key, {
              CaseId: caseRow.id,
              PatientName: caseRow.patient_name,
              Stage: nextStage,
              PreviousStage: caseRow.stage,
              MRN: caseRow.mrn,
            });
          }
        }
      } catch {}
      try {
        await transitionMaestroCaseStage(
          caseRow.id,
          nextStage,
          `RPA robot auto-advanced from "${caseRow.stage}" to "${nextStage}"`
        );
      } catch {}
    });

    return { ok: true, previousStage: caseRow.stage, newStage: nextStage };
  });

export const getPublicStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!
    );
    const [c, t, b] = await Promise.all([
      supabase.from("cases").select("id", { count: "exact", head: true }).neq("stage", "closed").neq("stage", "cancelled"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "open").lt("sla_due_at", new Date().toISOString()),
    ]);
    return {
      activeCases: c.count ?? 0,
      openTasks: t.count ?? 0,
      slaBreaches: b.count ?? 0,
    };
  });

