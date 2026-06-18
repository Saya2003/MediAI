
# MediFlow AI — Build Plan (v1)

A web app for **patient coordinators** to manage referral cases end-to-end, modeled on the SRS but scoped to what lives inside a Lovable web app. UiPath Maestro / RPA / external agents are represented as orchestrated *stage transitions* and *automated task actors* — the workflow logic runs in our backend instead of UiPath.

## Scope (in)

1. **Auth & roles** — email/password + Google; roles: `coordinator`, `physician`, `specialist`, `supervisor`.
2. **Dashboard** — KPIs (active cases, pending tasks, SLA breaches, avg cycle time) + recent activity.
3. **Case list** — filter by stage, priority, assignee; search by patient/MRN.
4. **Case detail** —
   - Patient + referral summary
   - **Stage timeline** (Intake → Pre-Auth → Scheduling → Appointment → Follow-Up → Closed) with exception branches (denial, reschedule)
   - **Task inbox** (Action Center equivalent): approve/deny pre-auth, pick specialist, confirm slot, record outcome, escalate
   - **Activity log** (every transition, who/what actor, timestamp)
   - Documents tab (uploaded referral PDFs via Cloud storage)
5. **New referral intake form** — physician submits; auto-creates case + initial automated tasks.
6. **Supervisor view** — aggregate reporting, escalations queue, user management.
7. **Notifications panel** — in-app toast + persisted notification list.
8. **Audit log** — append-only, viewable by supervisors.

## Out of scope (v1)

UiPath Cloud integration, real EMR/FHIR sync, real insurance portal RPA, SMS/email delivery, FHIR import, webhook delivery to external EMRs. These are *simulated* with backend functions that mimic the agent/RPA actor.

## Visual direction — "Clinical & trustworthy"

- Palette: soft off-white background, deep medical teal primary (`oklch(0.45 0.08 200)`), calm slate text, restrained status colors (amber=pending, green=approved, red=denied/SLA-breach, blue=in-progress).
- Typography: **Instrument Serif** for hero/headings (editorial, trustworthy), **Inter** body.
- Generous whitespace, hairline borders, soft shadows, no gradients-on-white tropes. Status pills with subtle tinted backgrounds. Timeline rendered as a vertical rail with stage chips.

## Technical details

**Stack:** TanStack Start (existing) + Lovable Cloud (Supabase) + shadcn + Tailwind v4.

**Schema (Supabase):**
- `profiles` (id → auth.users, full_name, email, organization)
- `user_roles` (user_id, role enum: coordinator/physician/specialist/supervisor) + `has_role()` SECURITY DEFINER fn
- `cases` (id, mrn, patient_name, patient_dob, referring_physician_id, specialty, priority, stage enum, sla_due_at, created_at, closed_at)
- `referrals` (case_id, diagnosis_code, clinical_notes, document_url)
- `pre_authorizations` (case_id, payer, status enum, denial_reason, decided_at)
- `appointments` (case_id, specialist_id, scheduled_at, status enum, location)
- `follow_ups` (case_id, outcome_notes, recorded_at, next_action)
- `tasks` (id, case_id, kind enum, assignee_role, assignee_user_id nullable, status enum, sla_due_at, payload jsonb, created_at, completed_at)
- `case_events` (case_id, actor_type enum: human/rpa/ai_agent/system, actor_label, event_type, details jsonb, created_at) — audit + timeline source
- `notifications` (user_id, case_id, message, read_at)

All tables: `GRANT` to authenticated + service_role, RLS enabled, policies scoped via `has_role()`. Coordinators see all cases in their org; physicians see their submitted referrals; specialists see assigned appointments; supervisors see everything.

**Server functions (`createServerFn`):**
- `createReferral` — physician/coordinator creates case, inserts initial `pre-auth review` task, emits `case_created` event.
- `actOnTask` — completes a task; transitions case stage; auto-creates the next task (simulating the Maestro orchestration).
- `getCaseDetail`, `listCases`, `listTasks`, `getDashboardMetrics`.
- All use `requireSupabaseAuth`; supervisor-only fns check `has_role(uid, 'supervisor')`.

**Routes:**
- `/` public marketing/landing (brief explainer + sign-in CTA)
- `/auth` sign-in/up
- `/_authenticated/dashboard`
- `/_authenticated/cases` + `/_authenticated/cases/$caseId`
- `/_authenticated/tasks`
- `/_authenticated/referrals/new`
- `/_authenticated/admin` (supervisor-gated child layout)

**Seed data:** a migration inserts ~12 demo cases across all stages with realistic tasks/events so the dashboard isn't empty on first load.

## Deliverables

Working app where a coordinator can sign in, see dashboard, open a case, complete a pre-auth task, and watch the case advance to scheduling — with every action logged to `case_events` and visible in the timeline.
