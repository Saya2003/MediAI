# MediFlow AI — Patient Care Coordination Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Track:** Track 1 — UiPath Maestro Case  
**Hackathon:** UiPath AgentHack 2026

MediFlow AI is an AI-enhanced patient care coordination platform that manages the end-to-end referral lifecycle on **UiPath Automation Cloud**. It uses **UiPath Maestro Case** for case orchestration, **UiPath Action Center** for human-in-the-loop approvals, **UiPath RPA Robots** for automated stage transitions, and **AI Agents (OpenRouter / DeepSeek V4 Flash)** for intelligent triage and document extraction.

**Agent Type:** This solution uses **Coded Agents** (TypeScript server functions with OpenRouter/DeepSeek V4 Flash for AI reasoning) alongside **UiPath Low-code Agents** (Maestro Case, Action Center, Orchestrator) — both are integrated through the UiPath REST API layer in `src/lib/uipath.ts`.

## Problem Statement

Patient referrals in healthcare involve multiple handoffs: physician submits a referral → coordinator verifies insurance → pre-authorization is obtained → specialist is selected → appointment is scheduled → follow-up is recorded. Each step can fail (denial, reschedule, missing documents) and has SLA deadlines. Without orchestration, coordinators juggle spreadsheets, emails, and phone calls. MediFlow AI solves this by providing a unified case management platform with AI assistance, RPA automation, and human oversight — all governed through UiPath Maestro Case.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Web App (TanStack Start)                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ Dashboard│  │Case Detail│  │ Admin Console  │  │ Task Inbox     │ │
│  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │ (Action Center)│ │
│       └──────────────┼────────────────┼───────────────┘              │
│                      ▼                ▼                              │
│          ┌─────────────────────────────────────┐                     │
│          │       Server Functions Layer         │                     │
│          │  (createReferral, actOnTask,          │                     │
│          │   advanceCaseStage, checkSlaBreaches) │                     │
│          └──┬──────┬──────┬──────┬──────────────┘                     │
│             │      │      │      │                                    │
└─────────────┼──────┼──────┼──────┼────────────────────────────────────┘
              │      │      │      │
     ┌────────▼──┐ ┌─▼─────┐ ┌▼──────────┐ ┌▼───────────────────────────┐
     │  Supabase │ │OpenRouter│ │ Supabase  │ │   UiPath Automation Cloud │
     │ (Postgres)│ │(DeepSeek│ │  Storage  │ │                           │
     │  Auth, RLS│ │ V4 Flash│ │ (Uploads) │ │  ┌─────────────────────┐ │
     │  Audit Log│ │AI Agent│ │           │ │  │ Maestro Case         │ │
     │  Seed Data│ │        │ │           │ │  │ (Case Orchestration)  │ │
     └───────────┘ └────────┘ └───────────┘ │  ├─────────────────────┤ │
                                            │  │ Action Center        │ │
                                            │  │ (Human Tasks)        │ │
                                            │  ├─────────────────────┤ │
                                            │  │ Orchestrator / Robots│ │
                                            │  │ (RPA Automation)     │ │
                                            │  └─────────────────────┘ │
                                            └───────────────────────────┘
```

### UiPath Integration Points

| Component | Implementation | Status |
|-----------|---------------|--------|
| **Maestro Case** | `createMaestroCase()` on referral intake, `transitionMaestroCaseStage()` on every stage change, `getMaestroCase()` for status sync | ✅ Active (fire-and-forget when configured) |
| **Action Center** | `createActionCenterTask()` for human approvals (pre-auth review, specialist selection, follow-up), status sync on completion | ✅ Active (fire-and-forget when configured) |
| **RPA Robots** | `startJob()` kicks off UiPath robot processes from `advanceCaseStage`; robot actions logged in audit trail with `actor_type: "rpa"` | ✅ Active (fire-and-forget when configured) |
| **Orchestrator** | `listProcesses()` discovers MediFlow robot processes, `listJobs()` monitors execution | ✅ Active (fire-and-forget when configured) |
| **Agent Builder / AI Agents** | AI-powered document extraction (`aiExtractDocumentFields`), referral triage (`createReferral`), and case summaries via OpenRouter (DeepSeek V4 Flash) | ✅ Live |
| **Audit Trail** | Append-only `case_events` table records every human, AI, RPA, and system action with actor typing | ✅ Built-in |

## Features

- **Referral Intake** — Physicians submit referrals with patient info, diagnosis (ICD-10), insurance, and clinical notes
- **Case Stages** — Intake → Pre-Authorization → Scheduling → Appointment → Follow-Up → Closed, with exception branches (denial, reschedule)
- **Task Inbox (Action Center)** — Human-in-the-loop tasks: approve/deny pre-auth, pick specialist, confirm slot, record outcome, escalate
- **AI Document Extraction** — Upload referral PDFs; AI extracts patient name, MRN, diagnosis code, and payer automatically
- **AI-Powered Summaries** — AI generates case summaries using DeepSeek V4 Flash
- **RPA Auto-Advance** — One-click RPA simulation advances cases through stages, logged as robot actions in the audit trail
- **SLA Breach Detection** — Automated detection of overdue tasks with escalation triggers
- **Dashboard & KPIs** — Active cases, pending tasks, SLA breaches, average cycle time
- **Role-Based Access** — Coordinator, Physician, Specialist, Supervisor with row-level security
- **Audit Log** — Every state transition tracked with actor type (human/AI/RPA/system) and timestamp
- **Document Management** — Upload referral PDFs linked to cases via Supabase Storage
- **Webhook Delivery** — Case closure triggers webhook notifications to external EMR systems

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | TanStack Start (React 19, SSR) |
| **Styling** | Tailwind CSS v4, shadcn/ui, Radix UI |
| **Database** | Supabase (PostgreSQL, Row-Level Security, Auth) |
| **AI Provider** | OpenRouter (DeepSeek DeepSeek-V4-Flash) |
| **File Storage** | Supabase Storage (document uploads) |
| **Language** | TypeScript (strict mode) |
| **Build Tool** | Vite 8 |

## Setup

### Prerequisites

- Node.js 20+
- A Supabase project ([supabase.com](https://supabase.com))
- An OpenRouter API key ([openrouter.ai](https://openrouter.ai))

### Installation

```bash
git clone https://github.com/Saya2003/medi-ai.git
cd medi-ai
npm install
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<your-publishable-key>"
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="deepseek/deepseek-v4-flash"

# Optional: Webhook URL for case closure notifications
# EMR_WEBHOOK_URL="https://..."

# Optional: Resend API key for email notifications
# RESEND_API_KEY="re_..."

# UiPath Automation Cloud (enables Maestro Case, Action Center, RPA robot orchestration)
# Get these from UiPath Cloud Portal > Admin > API Access
# UIPATH_ORG="MyOrganization"
# UIPATH_TENANT="DefaultTenant"
# UIPATH_CLIENT_ID="..."
# UIPATH_CLIENT_SECRET="..."
# UIPATH_ACCOUNT_LOGICAL_NAME="..."
```

### Database Setup

Run the migration file in the Supabase SQL Editor:

```
supabase/migrations/20260623085800_add_srs_tables.sql
```

This creates all tables (`cases`, `user_roles`, `referrals`, `tasks`, `pre_authorizations`, `appointments`, `follow_ups`, `case_events`, `notifications`, `case_documents`, `specialists`, `icd10_codes`, `system_config`, and more) and seeds reference data (ICD-10 codes, insurance policies, specialists).

### Run the App

```bash
npm run dev
```

## User Roles & Demo Flow

### Seed Demo Data

1. Sign in as `coordinator@mediflow.demo` (password: `demo123456`)
2. Navigate to **Admin** → click **Generate Demo Data**
3. This creates 3 test users and 6 cases across all stages

### Role Credentials

| Role | Email | Password |
|------|-------|----------|
| Physician | `physician@mediflow.demo` | `demo123456` |
| Specialist | `specialist@mediflow.demo` | `demo123456` |
| Supervisor | `supervisor@mediflow.demo` | `demo123456` |

### End-to-End Walkthrough

1. **Coordinator Dashboard** — View KPIs: active cases, pending tasks, SLA breaches
2. **Create a Referral** — Fill patient info, diagnosis, insurance, clinical notes
3. **Case Detail** — View stage timeline, task inbox, activity log, documents
4. **Complete Pre-Auth** — Approve/deny pre-authorization (triggers stage transition)
5. **Select Specialist** — Choose from available specialists
6. **Schedule Appointment** — Confirm date/time slot
7. **Record Follow-Up** — Document visit outcome
8. **Auto-Advance (RPA)** — Click the amber Zap icon to simulate RPA robot advancing the case
9. **Upload Document** — Upload a referral PDF; AI extracts structured fields automatically
10. **SLA Check** — Admin page: run SLA breach detection
11. **Supervisor View** — Escalations queue, aggregate reporting, audit log

## API Overview (Server Functions)

| Function | Description |
|----------|-------------|
| `createReferral` | Creates a new case with referral, auto-creates initial pre-auth task |
| `completeTask` | Completes a task and triggers stage transitions |
| `getCaseDetail` | Fetches case, tasks, events, documents |
| `listCases` | Lists cases with filtering (stage, priority, assignee) |
| `listTasks` | Lists tasks for the action-center inbox |
| `getDashboardMetrics` | Returns KPIs for the dashboard |
| `checkSlaBreaches` | Detects overdue tasks and creates escalation events |
| `advanceCaseStage` | RPA robot simulation — advances case one stage |
| `uploadCaseDocument` | Uploads document and triggers AI field extraction |
| `aiExtractDocumentFields` | AI extracts structured data from uploaded documents |
| `seedDemoData` | Creates test users, demo cases, and reference data |
| `deliverWebhook` | Sends case-closure webhook to external EMR |

## Judging Criteria Alignment

| Criterion | How MediFlow AI Addresses It |
|-----------|------------------------------|
| **Platform Usage** | Maestro-style case orchestration, AI Agent integration, Action Center task inbox, RPA robot audit trail |
| **Business Impact** | Reduces referral processing time via AI-assisted document extraction and automated stage transitions |
| **Technical Execution** | TypeScript, strict RLS policies, comprehensive audit logging, proper error handling |
| **Completeness** | Working prototype with seed data, demo workflow, this README, demo video |
| **Creativity & Innovation** | AI-powered document extraction, RPA simulation, SLA breach detection |
| **Coding Agents Bonus** | Developed with the assistance of AI coding agents during implementation |

## Coding Agents Disclosure

This project was developed with the assistance of AI coding agents, including Claude Code / OpenCode. The AI agents contributed to:

- Implementation of server functions (referral creation, task orchestration, SLA detection)
- AI integration with OpenRouter (DeepSeek V4 Flash)
- UI components (document upload, admin panel, case detail)
- Database schema design and migration scripts
- Seed data generation and testing workflows

Evidence of AI agent usage is available in the repository's development history.

## Demo Video

[Link to demo video (5 min max) — insert URL here]

## Presentation Deck

[Link to presentation deck — insert URL here]

## License

[MIT](LICENSE)
