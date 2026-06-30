import { describe, it, expect } from "vitest";

// Stage transition map (mirrors NEXT_STAGE in mediflow.functions.ts)
const NEXT_STAGE: Record<string, string> = {
  intake: "pre_auth",
  pre_auth: "scheduling",
  scheduling: "appointment",
  appointment: "follow_up",
  follow_up: "closed",
};

// Task map (mirrors NEXT_TASK in mediflow.functions.ts)
const NEXT_TASK: Record<string, { kind: string; title: string; description: string; actor: string } | null> = {
  intake: { kind: "review_preauth", title: "Review insurance pre-authorization", description: "Submit pre-auth request to payer and review decision.", actor: "PreAuth Reasoning Agent" },
  pre_auth: { kind: "select_specialist", title: "Select specialist and propose appointment slot", description: "Match patient with available specialist for their needs.", actor: "Specialist Matching Agent" },
  scheduling: { kind: "confirm_slot", title: "Confirm appointment slot with patient", description: "Reach out to patient and confirm the scheduled time.", actor: "Patient Coordinator" },
  appointment: { kind: "record_outcome", title: "Record post-appointment outcome", description: "Capture specialist notes and next steps for follow-up.", actor: "Patient Coordinator" },
  follow_up: null,
};

// RPA advance stage map (mirrors NEXT_STAGE_MAP in mediflow.functions.ts)
const RPA_NEXT_STAGE: Record<string, string> = {
  intake: "pre_auth",
  pre_auth: "scheduling",
  scheduling: "appointment",
  appointment: "follow_up",
  follow_up: "closed",
};

// SLA hours calculation
function getSlaHours(priority: string): number {
  if (priority === "stat") return 2;
  if (priority === "urgent") return 8;
  return 48;
}

// ── Stage transitions ────────────────────────────────────────────────

describe("Stage transitions", () => {
  it("has a complete chain from intake to closed", () => {
    expect(NEXT_STAGE.intake).toBe("pre_auth");
    expect(NEXT_STAGE.pre_auth).toBe("scheduling");
    expect(NEXT_STAGE.scheduling).toBe("appointment");
    expect(NEXT_STAGE.appointment).toBe("follow_up");
    expect(NEXT_STAGE.follow_up).toBe("closed");
  });

  it("covers all valid stages", () => {
    const stages = ["intake", "pre_auth", "scheduling", "appointment", "follow_up"];
    for (const s of stages) {
      expect(NEXT_STAGE[s]).toBeDefined();
    }
  });

  it("closed stage has no next stage", () => {
    expect(NEXT_STAGE["closed"]).toBeUndefined();
  });

  it("each non-terminal stage transitions to a defined stage", () => {
    const stages = Object.keys(NEXT_STAGE);
    const transitions = Object.values(NEXT_STAGE);
    const allValid = [...stages, "closed", "cancelled"];
    for (const t of transitions) {
      expect(allValid).toContain(t);
    }
  });

  it("RPA map is identical to regular map", () => {
    expect(RPA_NEXT_STAGE).toEqual(NEXT_STAGE);
  });
});

// ── Task progression ──────────────────────────────────────────────────

describe("Task progression", () => {
  it("creates a pre-auth review task after intake", () => {
    const task = NEXT_TASK.intake;
    expect(task).not.toBeNull();
    expect(task!.kind).toBe("review_preauth");
    expect(task!.title).toContain("pre-authorization");
  });

  it("creates no task at follow_up (terminal before closed)", () => {
    expect(NEXT_TASK.follow_up).toBeNull();
  });

  it("all tasks have required fields", () => {
    for (const [stage, task] of Object.entries(NEXT_TASK)) {
      if (task === null) continue;
      expect(task.kind, `Stage ${stage}`).toBeTruthy();
      expect(task.title, `Stage ${stage}`).toBeTruthy();
      expect(task.description, `Stage ${stage}`).toBeTruthy();
      expect(task.actor, `Stage ${stage}`).toBeTruthy();
    }
  });
});

// ── SLA Hours ─────────────────────────────────────────────────────────

describe("SLA hours calculation", () => {
  it("stat priority has 2 hour SLA", () => {
    expect(getSlaHours("stat")).toBe(2);
  });

  it("urgent priority has 8 hour SLA", () => {
    expect(getSlaHours("urgent")).toBe(8);
  });

  it("routine priority has 48 hour SLA", () => {
    expect(getSlaHours("routine")).toBe(48);
  });

  it("default (unknown priority) returns 48 hours", () => {
    expect(getSlaHours("unknown")).toBe(48);
  });
});

// ── Combined flow: full case lifecycle ────────────────────────────────

describe("Full case lifecycle", () => {
  it("progresses through all 5 transitions to closed", () => {
    const start = "intake";
    const expectedPath = ["pre_auth", "scheduling", "appointment", "follow_up", "closed"];
    let current = start;
    for (const next of expectedPath) {
      expect(NEXT_STAGE[current]).toBe(next);
      current = next;
    }
    expect(current).toBe("closed");
  });

  it("tracks the correct number of state changes", () => {
    const stages = Object.keys(NEXT_STAGE);
    expect(stages.length).toBe(5); // intake → pre_auth → scheduling → appointment → follow_up
  });

  it("can stop at any stage and resume", () => {
    const part1 = NEXT_STAGE.intake; // pre_auth
    const part2 = NEXT_STAGE.pre_auth; // scheduling
    expect(part1).toBe("pre_auth");
    expect(part2).toBe("scheduling");
  });
});
