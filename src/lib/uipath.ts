// ── UiPath Platform Integration Client ─────────────────────────────────────
// Wraps UiPath Automation Cloud REST APIs: Orchestrator, Action Center, Maestro Case.
// All operations gracefully skip when UIPATH_* env vars are not configured.

const UIPATH_ORG = process.env.UIPATH_ORG || "";
const UIPATH_TENANT = process.env.UIPATH_TENANT || "";
const UIPATH_CLIENT_ID = process.env.UIPATH_CLIENT_ID || "";
const UIPATH_CLIENT_SECRET = process.env.UIPATH_CLIENT_SECRET || "";
const UIPATH_ACCOUNT_LOGICAL_NAME = process.env.UIPATH_ACCOUNT_LOGICAL_NAME || "";

const CLOUD_URL = `https://cloud.uipath.com`;
const IDENTITY_URL = `${CLOUD_URL}/identity_/connect/token`;

function isConfigured(): boolean {
  return !!(UIPATH_ORG && UIPATH_TENANT && UIPATH_CLIENT_ID && UIPATH_CLIENT_SECRET);
}

let _token: { access: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!isConfigured()) return null;
  if (_token && Date.now() < _token.expiresAt) return _token.access;

  try {
    const res = await fetch(IDENTITY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: UIPATH_CLIENT_ID,
        client_secret: UIPATH_CLIENT_SECRET,
        scope: "OR.Administration OR.Execution OR.Jobs.Read OR.Monitoring OR.Robots.Read OR.Storages.Read OR.Tasks.Read OR.Tasks.Write OR.Maestro.Read OR.Maestro.Write",
      }),
    });
    if (!res.ok) {
      console.warn(`UiPath auth failed: ${res.status} ${await res.text().catch(() => "")}`);
      return null;
    }
    const body = await res.json();
    _token = { access: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 - 60000 };
    return _token.access;
  } catch (e) {
    console.warn("UiPath auth error:", e);
    return null;
  }
}

function apiUrl(service: "orchestrator" | "actioncenter" | "maestro", path: string): string {
  const base =
    service === "orchestrator" ? `${CLOUD_URL}/${UIPATH_ACCOUNT_LOGICAL_NAME}/${UIPATH_TENANT}/orchestrator_`
    : service === "actioncenter" ? `${CLOUD_URL}/${UIPATH_ACCOUNT_LOGICAL_NAME}/${UIPATH_TENANT}/actioncenter_`
    : `${CLOUD_URL}/${UIPATH_ACCOUNT_LOGICAL_NAME}/${UIPATH_TENANT}/maestro_`;
  return `${base}${path}`;
}

async function apiCall<T = any>(
  service: "orchestrator" | "actioncenter" | "maestro",
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await getToken();
  if (!token) return { ok: false, error: "UiPath not configured" };

  try {
    const res = await fetch(apiUrl(service, path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `UiPath ${res.status}: ${text.slice(0, 200)}` };
    }
    const text = await res.text();
    if (!text) return { ok: true, data: null as T };
    return { ok: true, data: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: `UiPath network error: ${e.message}` };
  }
}

// ── Orchestrator — Jobs & Robots ────────────────────────────────────────

export async function startJob(releaseKey: string, inputArgs?: Record<string, unknown>) {
  return apiCall<any>("orchestrator", "POST", "/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs", {
    startInfo: {
      ReleaseKey: releaseKey,
      RobotIds: [],
      NoOfRobots: 1,
      Strategy: "Modern",
      InputArguments: inputArgs ? JSON.stringify(inputArgs) : "{}",
      JobsCount: 1,
    },
  });
}

export async function listJobs(top = 20) {
  return apiCall<any>("orchestrator", "GET", `/odata/Jobs?$top=${top}&$orderby=CreationTime desc`);
}

export async function listProcesses() {
  return apiCall<any>("orchestrator", "GET", "/odata/Releases?$select=Key,ProcessKey,ProcessVersion,Name,Description&$top=50");
}

// ── Action Center — Human Tasks ─────────────────────────────────────────

export interface UiPathTask {
  Id?: string;
  Title: string;
  Description: string;
  TaskType?: string;
  Priority?: "Low" | "Medium" | "High" | "Critical";
  Status?: "Unassigned" | "Pending" | "Completed" | "Expired";
  AssignedTo?: string;
  CaseId?: string;
  Reference?: string;
  CreatorJobKey?: string;
}

export async function createActionCenterTask(task: UiPathTask) {
  return apiCall<any>("actioncenter", "POST", "/api/Tasks", task);
}

export async function updateActionCenterTask(taskId: string, updates: Partial<UiPathTask>) {
  return apiCall<any>("actioncenter", "PUT", `/api/Tasks/${taskId}`, updates);
}

export async function listActionCenterTasks(status?: string) {
  const filter = status ? `?$filter=Status eq '${status}'` : "";
  return apiCall<any>("actioncenter", "GET", `/api/Tasks${filter}`);
}

// ── Maestro Case — Case Orchestration ─────────────────────────────────

export interface UiPathCase {
  Id?: string;
  Title: string;
  Description?: string;
  Status?: string;
  Stage?: string;
  Priority?: "Low" | "Medium" | "High" | "Critical";
  AssignedTo?: string;
  CaseType?: string;
  Reference?: string;
  Properties?: Record<string, unknown>;
}

export async function createMaestroCase(caseData: UiPathCase) {
  return apiCall<any>("maestro", "POST", "/api/Cases", caseData);
}

export async function updateMaestroCase(caseId: string, updates: Partial<UiPathCase>) {
  return apiCall<any>("maestro", "PUT", `/api/Cases/${caseId}`, updates);
}

export async function getMaestroCase(caseId: string) {
  return apiCall<any>("maestro", "GET", `/api/Cases/${caseId}`);
}

export async function transitionMaestroCaseStage(caseId: string, stage: string, comment?: string) {
  return apiCall<any>("maestro", "PUT", `/api/Cases/${caseId}/stage`, {
    stage,
    comment: comment || `Auto-transitioned to ${stage} by MediFlow AI`,
  });
}

// ── Convenience: create both Maestro case + Action Center task ─────────

export async function syncCaseToUiPath(params: {
  caseId: string;
  patientName: string;
  specialty: string;
  stage: string;
  priority: string;
  mrn: string;
}) {
  const result: { maestro?: any; actionCenter?: any } = {};

  const maestro = await createMaestroCase({
    Title: `Referral: ${params.patientName} — ${params.specialty}`,
    Description: `MRN: ${params.mrn} | Stage: ${params.stage} | Priority: ${params.priority}`,
    Priority: params.priority === "stat" ? "Critical" : params.priority === "urgent" ? "High" : "Medium",
    Stage: params.stage,
    Reference: params.caseId,
    Properties: { mrn: params.mrn, specialty: params.specialty },
  });
  if (maestro.ok) result.maestro = maestro.data;

  const task = await createActionCenterTask({
    Title: `Process referral: ${params.patientName}`,
    Description: `New ${params.priority} priority referral for ${params.specialty}. Patient MRN: ${params.mrn}. Case ID: ${params.caseId}`,
    Priority: params.priority === "stat" ? "Critical" : params.priority === "urgent" ? "High" : "Medium",
    Reference: params.caseId,
  });
  if (task.ok) result.actionCenter = task.data;

  return result;
}

export async function syncStageToUiPath(params: {
  caseId: string;
  stage: string;
  previousStage: string;
  patientName: string;
}) {
  const result: { stageTransition?: any } = {};

  // Transition Maestro case stage
  const trans = await transitionMaestroCaseStage(params.caseId, params.stage);
  if (trans.ok) result.stageTransition = trans.data;

  // Create Action Center task for human-in-the-loop if needed
  const humanStages = ["pre_auth", "scheduling", "follow_up"];
  if (humanStages.includes(params.stage)) {
    await createActionCenterTask({
      Title: `Human review required: ${params.patientName} at "${params.stage}" stage`,
      Description: `Case transitioned from "${params.previousStage}" to "${params.stage}". Coordinator action is required to proceed.`,
      Priority: "High",
      Reference: params.caseId,
    });
  }

  return result;
}

export default {
  isConfigured,
  startJob,
  listJobs,
  listProcesses,
  createActionCenterTask,
  updateActionCenterTask,
  listActionCenterTasks,
  createMaestroCase,
  updateMaestroCase,
  getMaestroCase,
  transitionMaestroCaseStage,
  syncCaseToUiPath,
  syncStageToUiPath,
};
