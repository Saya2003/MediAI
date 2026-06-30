import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_ENV = {
  UIPATH_ORG: "medi AI",
  UIPATH_TENANT: "DefaultTenant",
  UIPATH_CLIENT_ID: "16b183eb-d963-4d72-8fe6-e2ba065fc2c6",
  UIPATH_CLIENT_SECRET: "test-secret",
  UIPATH_ACCOUNT_LOGICAL_NAME: "mediai",
};

function stubAllEnv() {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

// ── isConfigured ───────────────────────────────────────────────────────

describe("isConfigured", () => {
  it("returns true when all env vars are set", async () => {
    stubAllEnv();
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(true);
  });

  it("returns false when ORG is missing", async () => {
    stubAllEnv();
    vi.stubEnv("UIPATH_ORG", "");
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(false);
  });

  it("returns false when TENANT is missing", async () => {
    stubAllEnv();
    vi.stubEnv("UIPATH_TENANT", "");
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(false);
  });

  it("returns false when CLIENT_ID is missing", async () => {
    stubAllEnv();
    vi.stubEnv("UIPATH_CLIENT_ID", "");
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(false);
  });

  it("returns false when CLIENT_SECRET is missing", async () => {
    stubAllEnv();
    vi.stubEnv("UIPATH_CLIENT_SECRET", "");
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(false);
  });

  it("returns false when all env vars are empty", async () => {
    const uipath = await import("../uipath");
    expect(uipath.default.isConfigured()).toBe(false);
  });
});

// ── API functions (with mocked fetch) ──────────────────────────────────

describe("API functions (mocked fetch)", () => {
  let uipath: typeof import("../uipath")["default"];
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    stubAllEnv();
    mockFetch = vi.fn() as any;
    global.fetch = mockFetch as any;
    uipath = (await import("../uipath")).default;
  });

  describe("startJob", () => {
    it("sends a POST to /odata/Jobs/UiPath.Server.Configuration.OData.StartJobs", async () => {
      const authResponse = {
        ok: true,
        json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }),
      };
      mockFetch.mockResolvedValueOnce(authResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ value: [{ Id: "job-1" }] })),
      });

      const result = await uipath.startJob("release-key", { CaseId: "case-1" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[0]).toContain("/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs");
      expect(apiCall[1].method).toBe("POST");
      expect(result.ok).toBe(true);
    });

    it("gracefully handles network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const result = await uipath.startJob("release-key");
      expect(result.ok).toBe(false);
    });
  });

  describe("createActionCenterTask", () => {
    it("sends a POST to /api/Tasks", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "task-1" })) });

      const result = await uipath.createActionCenterTask({ Title: "Test", Description: "Desc" });

      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[0]).toContain("/actioncenter_/api/Tasks");
      expect(apiCall[1].method).toBe("POST");
      expect(result.ok).toBe(true);
    });
  });

  describe("createMaestroCase", () => {
    it("sends a POST to /api/Cases", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "case-uip-1" })) });

      const result = await uipath.createMaestroCase({ Title: "Test Case", Stage: "intake" });

      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[0]).toContain("/maestro_/api/Cases");
      expect(apiCall[1].method).toBe("POST");
      expect(result.ok).toBe(true);
    });
  });

  describe("transitionMaestroCaseStage", () => {
    it("sends a PUT to /api/Cases/:id/stage", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("{}") });

      const result = await uipath.transitionMaestroCaseStage("case-1", "pre_auth");

      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[0]).toContain("/maestro_/api/Cases/case-1/stage");
      expect(apiCall[1].method).toBe("PUT");
      expect(JSON.parse(apiCall[1].body)).toMatchObject({ stage: "pre_auth" });
      expect(result.ok).toBe(true);
    });
  });

  describe("syncCaseToUiPath", () => {
    it("creates both a Maestro case and an Action Center task", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "maestro-1" })) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "task-1" })) });

      const result = await uipath.syncCaseToUiPath({
        caseId: "case-1", patientName: "John Doe",
        specialty: "Cardiology", stage: "intake",
        priority: "urgent", mrn: "MRN-001",
      });

      expect(result.maestro).toBeDefined();
      expect(result.actionCenter).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("syncStageToUiPath", () => {
    it("creates an Action Center task for human-review stages", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("{}") });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "ac-task" })) });

      const result = await uipath.syncStageToUiPath({
        caseId: "case-1", stage: "pre_auth",
        previousStage: "intake", patientName: "Jane",
      });

      expect(result.stageTransition).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("skips Action Center task for non-human stages like closed", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("{}") });

      const result = await uipath.syncStageToUiPath({
        caseId: "case-1", stage: "closed",
        previousStage: "follow_up", patientName: "Jane",
      });

      expect(result.stageTransition).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getMaestroCase", () => {
    it("sends a GET to /api/Cases/:id", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ Id: "case-1", Stage: "intake" })) });

      const result = await uipath.getMaestroCase("case-1");

      expect(mockFetch.mock.calls[1][0]).toContain("/maestro_/api/Cases/case-1");
      expect(mockFetch.mock.calls[1][1].method).toBe("GET");
      expect(result.ok).toBe(true);
    });
  });
});

// ── Token caching ──────────────────────────────────────────────────────

describe("token caching", () => {
  it("reuses the cached token for subsequent calls", async () => {
    stubAllEnv();
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "cached-token", expires_in: 3600 }),
      text: () => Promise.resolve("{}"),
    });

    const uipath = await import("../uipath");
    await uipath.default.getMaestroCase("case-1");
    await uipath.default.getMaestroCase("case-2");

    const authCalls = mockFetch.mock.calls.filter((c: any) => c[0]?.includes("connect/token"));
    expect(authCalls.length).toBe(1);
  });
});

// ── Not configured gracefulness ────────────────────────────────────────

describe("graceful degradation when not configured", () => {
  beforeEach(async () => {
    global.fetch = vi.fn();
  });

  it("returns { ok: false } for all API calls when env vars are missing", async () => {
    const uipath = await import("../uipath");

    const results = await Promise.all([
      uipath.default.startJob("key"),
      uipath.default.createActionCenterTask({ Title: "t", Description: "t" }),
      uipath.default.createMaestroCase({ Title: "t", Description: "t" }),
      uipath.default.getMaestroCase("id"),
      uipath.default.transitionMaestroCaseStage("id", "stage"),
      uipath.default.listProcesses(),
      uipath.default.listJobs(),
      uipath.default.listActionCenterTasks(),
      uipath.default.updateActionCenterTask("id", {}),
      uipath.default.updateMaestroCase("id", {}),
    ]);

    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.ok === false ? (r as any).error : null).toBe("UiPath not configured");
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Default export structure ───────────────────────────────────────────

describe("default export", () => {
  it("exposes all expected functions", async () => {
    stubAllEnv();
    const uipath = await import("../uipath");
    const exported = uipath.default;
    expect(typeof exported.isConfigured).toBe("function");
    expect(typeof exported.startJob).toBe("function");
    expect(typeof exported.listJobs).toBe("function");
    expect(typeof exported.listProcesses).toBe("function");
    expect(typeof exported.createActionCenterTask).toBe("function");
    expect(typeof exported.updateActionCenterTask).toBe("function");
    expect(typeof exported.listActionCenterTasks).toBe("function");
    expect(typeof exported.createMaestroCase).toBe("function");
    expect(typeof exported.updateMaestroCase).toBe("function");
    expect(typeof exported.getMaestroCase).toBe("function");
    expect(typeof exported.transitionMaestroCaseStage).toBe("function");
    expect(typeof exported.syncCaseToUiPath).toBe("function");
    expect(typeof exported.syncStageToUiPath).toBe("function");
  });
});
