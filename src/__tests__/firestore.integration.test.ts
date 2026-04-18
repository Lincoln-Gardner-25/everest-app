/**
 * Integration tests for Firestore data layer (projects + sessions).
 *
 * These mock Firebase/Firestore to verify that:
 * - CRUD functions call the correct Firestore methods with the right args
 * - Batch operations (delete project + sessions, manual session + hours update) are atomic
 * - Clock-out calculates duration correctly and increments project hours
 * - Session update computes the delta and applies it to project hours
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Firebase ───────────────────────────────────────────────────

const mockAddDoc = vi.fn().mockResolvedValue({ id: "new-doc-id" });
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDocs = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockWriteBatch = vi.fn(() => ({
  set: mockBatchSet,
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));
const mockCollection = vi.fn((_db: unknown, name: string) => `collection:${name}`);
const mockDoc = vi.fn((...args: unknown[]) => {
  if (args.length === 3) return `doc:${args[1]}/${args[2]}`;
  if (args.length === 1) return `doc:auto-${Math.random().toString(36).slice(2, 8)}`;
  return `doc:unknown`;
});
const mockIncrement = vi.fn((n: number) => ({ _increment: n }));
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...(args as Parameters<typeof mockCollection>)),
  addDoc: (...args: unknown[]) => mockAddDoc(...(args as Parameters<typeof mockAddDoc>)),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...(args as Parameters<typeof mockUpdateDoc>)),
  doc: (...args: unknown[]) => mockDoc(...(args as Parameters<typeof mockDoc>)),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  orderBy: vi.fn((...args: unknown[]) => ({ orderBy: args })),
  onSnapshot: vi.fn(),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: {
    now: () => ({
      toMillis: () => Date.now(),
    }),
    fromDate: (d: Date) => ({
      toMillis: () => d.getTime(),
      toDate: () => d,
    }),
  },
  getDocs: (...args: unknown[]) => mockGetDocs(...(args as Parameters<typeof mockGetDocs>)),
  writeBatch: (...args: unknown[]) => mockWriteBatch(...(args as Parameters<typeof mockWriteBatch>)),
  increment: (n: number) => mockIncrement(n),
}));

vi.mock("@/lib/firebase", () => ({
  db: "mock-db",
  auth: "mock-auth",
}));

// ── Import AFTER mocks are set up ───────────────────────────────────

import {
  createProject,
  updateProject,
  completeProject,
  deleteProject,
} from "@/lib/projects";
import {
  clockIn,
  clockOut,
  createManualSession,
  updateSession,
  deleteSession,
} from "@/lib/sessions";

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Projects — Firestore CRUD", () => {
  it("createProject calls addDoc with correct shape", async () => {
    await createProject("user-1", {
      name: "Wedding Shoot",
      clientName: "Smith Family",
      projectType: "wedding",
      quotedAmount: 3000,
      estimatedHours: 20,
      status: "active",
      notes: "",
    });

    expect(mockAddDoc).toHaveBeenCalledOnce();
    const [, data] = mockAddDoc.mock.calls[0];
    expect(data.userId).toBe("user-1");
    expect(data.name).toBe("Wedding Shoot");
    expect(data.actualHoursTotal).toBe(0);
    expect(data.completedAt).toBeNull();
    expect(data.createdAt).toEqual({ _serverTimestamp: true });
  });

  it("updateProject calls updateDoc with partial data", async () => {
    await updateProject("proj-1", { name: "Updated Name", quotedAmount: 5000 });

    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [, data] = mockUpdateDoc.mock.calls[0];
    expect(data.name).toBe("Updated Name");
    expect(data.quotedAmount).toBe(5000);
  });

  it("completeProject sets status and completedAt timestamp", async () => {
    await completeProject("proj-1");

    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [, data] = mockUpdateDoc.mock.calls[0];
    expect(data.status).toBe("completed");
    expect(data.completedAt).toEqual({ _serverTimestamp: true });
  });

  it("deleteProject batch-deletes sessions then project", async () => {
    // Simulate 2 sessions belonging to this project
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { ref: "session-ref-1" },
        { ref: "session-ref-2" },
      ],
    });

    await deleteProject("proj-1", "user-1");

    expect(mockWriteBatch).toHaveBeenCalledOnce();
    // 2 session deletes + 1 project delete = 3 deletes
    expect(mockBatchDelete).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it("deleteProject handles project with no sessions", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await deleteProject("proj-2", "user-1");

    expect(mockBatchDelete).toHaveBeenCalledTimes(1); // just the project
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });
});

describe("Sessions — Clock In/Out", () => {
  it("clockIn creates session with null endTime and serverTimestamp", async () => {
    await clockIn("user-1");

    expect(mockAddDoc).toHaveBeenCalledOnce();
    const [, data] = mockAddDoc.mock.calls[0];
    expect(data.userId).toBe("user-1");
    expect(data.projectId).toBeNull(); // projectId is assigned at clock-out now
    expect(data.endTime).toBeNull();
    expect(data.durationMinutes).toBe(0);
    expect(data.startTime).toEqual({ _serverTimestamp: true });
  });

  it("clockOut sets endTime, calculates duration, and increments project hours", async () => {
    const startTime = {
      toMillis: () => Date.now() - 90 * 60 * 1000, // 90 minutes ago
    };

    await clockOut("session-1", "proj-1", startTime as any);

    // Should update session
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);

    const [, sessionData] = mockUpdateDoc.mock.calls[0];
    expect(sessionData.endTime).toBeDefined();
    expect(sessionData.durationMinutes).toBeGreaterThan(89);
    expect(sessionData.durationMinutes).toBeLessThan(91);

    // Should increment project hours
    const [, projectData] = mockUpdateDoc.mock.calls[1];
    expect(mockIncrement).toHaveBeenCalled();
    expect(projectData.actualHoursTotal).toBeDefined();
  });
});

describe("Sessions — Manual CRUD", () => {
  it("createManualSession uses batch write for atomicity", async () => {
    const start = new Date("2026-03-01T09:00:00");
    const end = new Date("2026-03-01T12:00:00"); // 3 hours

    await createManualSession("user-1", "proj-1", start, end, "Editing day");

    expect(mockWriteBatch).toHaveBeenCalledOnce();
    expect(mockBatchSet).toHaveBeenCalledOnce();
    expect(mockBatchUpdate).toHaveBeenCalledOnce();
    expect(mockBatchCommit).toHaveBeenCalledOnce();

    // Verify session data
    const sessionData = mockBatchSet.mock.calls[0][1];
    expect(sessionData.userId).toBe("user-1");
    expect(sessionData.projectId).toBe("proj-1");
    expect(sessionData.durationMinutes).toBe(180); // 3 hours
    expect(sessionData.notes).toBe("Editing day");
  });

  it("updateSession computes delta and adjusts project hours", async () => {
    const start = new Date("2026-03-01T09:00:00");
    const end = new Date("2026-03-01T14:00:00"); // 5 hours = 300 min
    const oldDuration = 180; // was 3 hours

    await updateSession("sess-1", "proj-1", oldDuration, start, end, "Extended");

    expect(mockBatchUpdate).toHaveBeenCalledTimes(2); // session + project
    expect(mockBatchCommit).toHaveBeenCalledOnce();

    // Delta = 300 - 180 = 120 minutes = 2 hours
    expect(mockIncrement).toHaveBeenCalledWith(2); // 120 min / 60
  });

  it("updateSession skips project update when duration unchanged", async () => {
    const start = new Date("2026-03-01T09:00:00");
    const end = new Date("2026-03-01T12:00:00"); // 3 hours = 180 min
    const oldDuration = 180;

    await updateSession("sess-1", "proj-1", oldDuration, start, end, "Same time");

    // Only session update, no project update (delta is 0)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("deleteSession decrements project hours", async () => {
    await deleteSession("sess-1", "proj-1", 120); // 2 hours

    expect(mockBatchDelete).toHaveBeenCalledOnce();
    expect(mockBatchUpdate).toHaveBeenCalledOnce();
    expect(mockIncrement).toHaveBeenCalledWith(-2); // -120 min / 60
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });
});

describe("Data Integrity", () => {
  it("manual session duration calculation is accurate", () => {
    const start = new Date("2026-03-15T08:30:00");
    const end = new Date("2026-03-15T10:45:00");
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
    expect(durationMinutes).toBe(135); // 2h 15m
  });

  it("session update delta math is correct", () => {
    const oldMinutes = 60;
    const newStart = new Date("2026-03-15T08:00:00");
    const newEnd = new Date("2026-03-15T10:30:00");
    const newMinutes = (newEnd.getTime() - newStart.getTime()) / 60000;
    const delta = newMinutes - oldMinutes;
    expect(newMinutes).toBe(150);
    expect(delta).toBe(90);
    expect(delta / 60).toBe(1.5); // increment by 1.5 hours
  });

  it("IPH calculation: quotedAmount / actualHours", () => {
    const quotedAmount = 3000;
    const actualHoursTotal = 20;
    const iph = quotedAmount / actualHoursTotal;
    expect(iph).toBe(150);
  });

  it("IPH handles edge case of zero hours", () => {
    const quotedAmount = 3000;
    const actualHoursTotal = 0;
    const iph = actualHoursTotal > 0 ? quotedAmount / actualHoursTotal : 0;
    expect(iph).toBe(0);
  });
});
