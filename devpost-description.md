## Inspiration

Healthcare referrals are broken. When a physician refers a patient to a specialist, the case passes through 5+ handoffs: insurance verification, pre-authorization, specialist matching, scheduling, appointment, and follow-up. Each handoff can fail — denials, reschedules, missing documents, missed SLAs. Coordinators manage this chaos with spreadsheets, sticky notes, and phone calls. Patients wait weeks. Hospitals lose revenue from denied claims.

We built MediFlow AI because we believe AI orchestration can transform this. The technology exists — Maestro Case, Action Center, AI agents, RPA robots — but nobody has tied them together into a unified referral coordination platform. We wanted to prove it's possible.

## What it does

MediFlow AI is a patient care coordination platform that runs entirely on **UiPath Automation Cloud**. It manages the end-to-end referral lifecycle:

- **AI Triage Agent** analyzes clinical notes on submission, assigns priority (routine/urgent/stat), suggests ICD-10 codes, and recommends the right specialty — before a human touches the case
- **Maestro Case** orchestrates every stage: Intake → Pre-Authorization → Scheduling → Appointment → Follow-Up → Closed, with exception branches for denials, reschedules, and escalations
- **Action Center** surfaces human-in-the-loop tasks: approve pre-auth, select a specialist, confirm a slot, record outcomes — keeping coordinators in control at key decision points
- **RPA Robots** (triggered via Orchestrator) auto-advance cases through routine stages, logged with `actor_type: "rpa"` in the audit trail
- **AI Document Extraction** reads uploaded referral PDFs and extracts patient name, MRN, diagnosis code, and payer automatically
- **SLA Breach Detection** monitors task deadlines and auto-escalates overdue items to supervisors
- **Audit Trail** records every action — human, AI agent, RPA robot, or system — in an append-only log

The result: referrals that used to take days move through in hours. Coordinators stop chasing and start managing.

## How we built it

**Frontend & Backend:** TanStack Start (React 19, SSR) with TypeScript strict mode. Server functions handle all business logic — no separate API server needed.

**Database:** Supabase (PostgreSQL) with Row-Level Security. 15+ tables, 15+ RLS policies enforcing role-based access for coordinator, physician, specialist, and supervisor roles. Append-only `case_events` table for audit.

**AI:** OpenRouter with DeepSeek V4 Flash powers three AI agents:
- Triage Agent (analyzes referrals, recommends priority/ICD-10/specialty)
- Document Extraction Agent (parses uploaded PDF text into structured fields)
- Summarisation Agent (generates clinical summaries at case milestones)

**UiPath Integration:** A dedicated `src/lib/uipath.ts` client wraps three API surfaces:
- **Maestro Case API** — `createMaestroCase()`, `transitionMaestroCaseStage()`, `getMaestroCase()`
- **Action Center API** — `createActionCenterTask()`, `updateActionCenterTask()`
- **Orchestrator API** — `listProcesses()`, `startJob()` (fires RPA robots)

All calls are fire-and-forget with graceful degradation — the platform works standalone and lights up with full UiPath capabilities when credentials are configured.

**Testing:** 67 automated tests with Vitest covering the UiPath client (mocked fetch), business logic (stage transitions, SLA rules), and Zod input validation for all 9 server functions.

**Coding Agents:** We used Claude Code / OpenCode as a coding agent throughout development — it assisted with server function implementation, AI integration, UI components, database schema design, seed data generation, and the UiPath REST API client.

## Challenges we ran into

**1. DeepSeek JSON mode quirks.** The DeepSeek V4 Flash model supports `response_format: { type: "json_object" }` but occasionally returns markdown-wrapped JSON. We had to add defensive parsing with fallbacks.

**2. UiPath API scope discovery.** The Maestro Case and Action Center APIs use specific OAuth scopes that weren't immediately obvious from documentation. We had to iterate on the scope string to get the correct permissions.

**3. Stage consistency across two systems.** Keeping Supabase case stage and UiPath Maestro case stage in sync required careful fire-and-forget design — we chose eventual consistency over blocking the user experience.

**4. Deprecation churn.** The TanStack Start `createServerFn().inputValidator()` was deprecated during development in favor of `.validator()`. We migrated all 12 call sites.

**5. Seed data complexity.** Creating realistic demo data spanning 6 cases across 5 stages with the right task/event/decision history required carefully ordered inserts to satisfy foreign key constraints.

## Accomplishments that we're proud of

- **67 passing automated tests** covering the UiPath integration, business logic state machine, and all API input validation
- **Clean build** — TypeScript strict mode, zero errors, zero warnings, production build passes
- **AI that actually helps** — the Triage Agent correctly re-prioritizes referrals based on clinical severity as extracted from ICD-10 codes
- **Graceful degradation** — the platform works standalone with pure simulation, or connects to UiPath Cloud for real orchestration. No credentials? No problem. Everything degrades gracefully with log warnings.
- **Full audit trail** — every state transition records who (human, AI agent, RPA robot, system) did what and when. Judges can see the complete provenance of every case.

## What we learned

- **Maestro Case is genuinely powerful** for exception-heavy workflows. The stage-based model with human checkpoints maps naturally to real-world referral coordination.
- **AI + RPA + Human = trust.** The most compelling pattern wasn't full automation — it was AI assisting triage, RPA handling routine advances, and humans making the actual decisions at key approval gates.
- **Coding agents accelerate but don't replace.** Claude Code was excellent for scaffolding server functions, writing tests, and generating boilerplate — but the architecture decisions, API integration design, and error handling strategy required human judgment.
- **SLA management is surprisingly hard.** Calculating SLA deadlines across multiple stages with different priority levels, detecting breaches, and avoiding duplicate escalations required careful deduplication logic.

## What's next for Medi AI

- **Real-time UiPath sync.** Move from fire-and-forget to bidirectional sync with UiPath Maestro via webhook receivers, so stage changes in either system reflect in both
- **FHIR integration.** Connect to actual EMR systems via HL7 FHIR APIs for real patient data ingestion
- **SMS notifications.** Add two-way SMS (Twilio) so patients can confirm appointments via text
- **Dashboard analytics.** Add trend charts (referral volume over time, SLA compliance rates, coordinator workload) using the event data already being collected
- **Multi-tenant org support.** Expand beyond the single-organization model to support multiple hospital systems with isolated data
- **Actual UiPath Robot deployment.** Package the RPA workflows as proper UiPath Studio processes, deploy via Orchestrator, and connect them to the advancement API
