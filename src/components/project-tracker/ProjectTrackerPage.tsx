"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeToProjects,
  createProject,
  updateProject,
  completeProject,
  deleteProject,
  createHistoricalProject,
  type Project,
  type ProjectInput,
} from "@/lib/projects";
import {
  clockIn,
  assignAndClockOut,
  subscribeToActiveSession,
  type Session,
} from "@/lib/sessions";
import {
  createProjectEvent,
  createClockInEvent,
  finalizeClockOutEvent,
} from "@/lib/googleCalendar";
import {
  searchSignedContracts,
  getImportedEmailIds,
  isGmailScanEnabled,
  type GmailContractEmail,
} from "@/lib/gmail";
import { GmailImportCards } from "@/components/projects/GmailImportWizard";
import { AssignProjectDialog } from "@/components/project-tracker/AssignProjectDialog";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectReviewDialog } from "@/components/projects/ProjectReviewDialog";
import { PastProjectDialog } from "@/components/projects/PastProjectDialog";
import { ProjectSessionsDialog } from "@/components/projects/ProjectSessionsDialog";
import { Button } from "@/components/ui/button";
import {
  PlayCircle,
  StopCircle,
  Clock,
  DollarSign,
  MoreHorizontal,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertCircle,
  Timer,
  Plus,
  Mail,
  Loader2,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatHours(h: number) {
  if (h <= 0) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function isValidTimestamp(ts: unknown): ts is { toMillis: () => number } {
  return ts != null && typeof (ts as { toMillis?: unknown }).toMillis === "function";
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  review: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  review: "In Review",
  completed: "Completed",
};

function getIPHBarColor(project: Project, targetRate: number): string {
  const hours = project.actualHoursTotal;
  if (!hours || hours < 0.001) return "bg-primary/30";
  const actualIPH = project.quotedAmount / hours;
  const projectedIPH =
    project.estimatedHours > 0 ? project.quotedAmount / project.estimatedHours : 0;
  if (projectedIPH > 0 && actualIPH >= projectedIPH) return "bg-green-500";
  if (targetRate > 0 && actualIPH < targetRate) return "bg-red-500";
  return "bg-amber-400";
}

function IPHBadge({ project, targetRate }: { project: Project; targetRate: number }) {
  const hours = project.actualHoursTotal;
  const hasActual = hours && hours > 0.001;
  const displayHours = hasActual ? hours : project.estimatedHours;
  if (!displayHours) return <span className="text-muted-foreground text-sm">—</span>;
  const iph = project.quotedAmount / displayHours;
  let textColor = "text-foreground";
  if (hasActual) {
    const projectedIPH =
      project.estimatedHours > 0 ? project.quotedAmount / project.estimatedHours : 0;
    if (projectedIPH > 0 && iph >= projectedIPH) textColor = "text-green-600";
    else if (targetRate > 0 && iph < targetRate) textColor = "text-red-600";
    else textColor = "text-amber-600";
  }
  return (
    <div className="text-right">
      <span className={`text-sm font-semibold ${textColor}`}>${iph.toFixed(0)}/hr</span>
      {!hasActual && <p className="text-xs text-muted-foreground">projected</p>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ProjectTrackerPage() {
  const { user, gmailAccessToken, connectGmail, calendarAccessToken } = useAuth();
  // Store the pending clock-in calendar event ID so we can finalize it on clock-out
  const pendingCalendarEventId = useRef<string | null>(null);

  // Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [targetRate, setTargetRate] = useState(0);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Timer state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerLoading, setTimerLoading] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  // Projects dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pastDialogOpen, setPastDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [reviewProject, setReviewProject] = useState<Project | null>(null);
  const [sessionsProjectId, setSessionsProjectId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Gmail scanner state
  const [contractEmails, setContractEmails] = useState<GmailContractEmail[]>([]);
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [hasAutoScanned, setHasAutoScanned] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(true);

  // ── Subscriptions ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects, (err) => {
      setProjectsError(
        err.message.includes("index")
          ? "A Firestore index is missing. Check the browser console for a link to create it."
          : `Failed to load projects: ${err.message}`
      );
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setTargetRate(snap.data().targetHourlyRate ?? 0);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveSession(
      user.uid,
      (session) => setActiveSession(session),
      (err) => {
        setTimerError(
          err.message.includes("index")
            ? "A Firestore index is missing. Check the browser console."
            : `Session error: ${err.message}`
        );
      }
    );
  }, [user]);

  // Elapsed ticker
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (activeSession && isValidTimestamp(activeSession.startTime)) {
      const tick = () => {
        const startMs = (activeSession.startTime as { toMillis: () => number }).toMillis();
        setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSession]);

  // ── Gmail scanner ──────────────────────────────────────────────────────

  const scanGmail = useCallback(async (token: string, uid: string) => {
    setGmailScanning(true);
    setGmailError(null);
    try {
      const emails = await searchSignedContracts(token);
      const imported = await getImportedEmailIds(uid);
      setContractEmails(emails.filter((e) => !imported.has(e.id)));
    } catch (err) {
      if (err instanceof Error && err.message === "GMAIL_AUTH_EXPIRED") {
        setGmailError("Gmail access expired. Click below to reconnect.");
      } else {
        setGmailError("Could not scan Gmail. Try reconnecting.");
      }
    } finally {
      setGmailScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !gmailAccessToken || hasAutoScanned) return;
    async function autoScan() {
      const enabled = await isGmailScanEnabled(user!.uid);
      setScanEnabled(enabled);
      setHasAutoScanned(true);
      if (enabled) scanGmail(gmailAccessToken!, user!.uid);
    }
    autoScan();
  }, [user, gmailAccessToken, hasAutoScanned, scanGmail]);

  async function handleConnectGmail() {
    setGmailError(null);
    try {
      const token = await connectGmail();
      if (token && user) await scanGmail(token, user.uid);
    } catch {
      setGmailError("Gmail connection was cancelled or failed.");
    }
  }

  // ── Timer handlers ────────────────────────────────────────────────────

  async function handleClockIn() {
    if (!user) return;
    setTimerLoading(true);
    setTimerError(null);
    try {
      const sessionRef = await clockIn(user.uid);

      // If Google Calendar is connected, create a "Working Session" event now
      // (we'll update it with the project name when they clock out)
      if (calendarAccessToken) {
        try {
          const eventId = await createClockInEvent(
            calendarAccessToken,
            sessionRef.id,
            "Working Session",
            new Date()
          );
          pendingCalendarEventId.current = eventId;
        } catch (calErr) {
          console.warn("Calendar clock-in event failed (non-blocking):", calErr);
        }
      }
    } catch (err) {
      setTimerError(err instanceof Error ? err.message : "Failed to clock in.");
    } finally {
      setTimerLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeSession || !isValidTimestamp(activeSession.startTime)) return;
    setAssignDialogOpen(true);
  }

  async function handleAssignConfirm(projectId: string) {
    if (!activeSession || !isValidTimestamp(activeSession.startTime)) return;

    const startTime = (activeSession.startTime as { toDate: () => Date }).toDate();
    const endTime = new Date();
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

    // If Google Calendar is connected, finalize the event or create a new one
    let calendarEventId: string | null = null;
    if (calendarAccessToken) {
      try {
        const project = projects.find((p) => p.id === projectId);
        const projectName = project?.name ?? "Session";

        if (pendingCalendarEventId.current) {
          // Update the existing clock-in event with real end time + project name
          await finalizeClockOutEvent(
            calendarAccessToken,
            pendingCalendarEventId.current,
            projectName,
            startTime,
            endTime,
            durationMinutes
          );
          calendarEventId = pendingCalendarEventId.current;
          pendingCalendarEventId.current = null;
        } else {
          // No pending event (e.g., browser refreshed) — create a complete event
          const eventId = await createClockInEvent(
            calendarAccessToken,
            activeSession.id,
            projectName,
            startTime
          );
          await finalizeClockOutEvent(
            calendarAccessToken,
            eventId,
            projectName,
            startTime,
            endTime,
            durationMinutes
          );
          calendarEventId = eventId;
        }
      } catch (calErr) {
        console.warn("Calendar clock-out event failed (non-blocking):", calErr);
      }
    }

    await assignAndClockOut(
      activeSession.id,
      projectId,
      activeSession.startTime as Timestamp,
      calendarEventId
    );
    setAssignDialogOpen(false);
  }

  // ── Project CRUD handlers ──────────────────────────────────────────────

  async function handleCreate(data: ProjectInput) {
    if (!user) return;
    await createProject(user.uid, data);
    // Silently create an all-day Google Calendar event for the new project
    if (calendarAccessToken) {
      try {
        await createProjectEvent(calendarAccessToken, {
          name: data.name,
          clientName: data.clientName,
          projectType: data.projectType,
          quotedAmount: data.quotedAmount,
        });
      } catch (calErr) {
        console.warn("Calendar project event failed (non-blocking):", calErr);
      }
    }
  }

  async function handleLogPast(data: Parameters<typeof createHistoricalProject>[1]) {
    if (!user) return;
    await createHistoricalProject(user.uid, data);
  }

  async function handleEdit(data: ProjectInput) {
    if (!editingProject) return;
    await updateProject(editingProject.id, data);
  }

  function handleComplete(project: Project) {
    setReviewProject(project);
    setMenuOpen(null);
  }

  async function handleConfirmComplete() {
    if (!reviewProject) return;
    await completeProject(reviewProject.id);
    setReviewProject(null);
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setMenuOpen(null);
    try {
      await deleteProject(project.id, user!.uid);
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message.includes("permission")
          ? "Permission denied — make sure Firestore rules are published."
          : `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  function openEdit(project: Project) {
    setEditingProject(project);
    setDialogOpen(true);
    setMenuOpen(null);
  }

  function openSessions(project: Project) {
    setSessionsProjectId(project.id);
    setMenuOpen(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingProject(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────

  const activeProjects = projects.filter((p) => p.status === "active");
  const reviewProjects = projects.filter((p) => p.status === "review");
  const completedProjects = projects.filter((p) => p.status === "completed");
  const isActive = !!activeSession;
  const startTimeReady = isActive && isValidTimestamp(activeSession?.startTime);

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Gmail Contract Scanner ─────────────────────────────────── */}
      {scanEnabled && (
        <div className="rounded-2xl border bg-card p-5 mb-6">
          {contractEmails.length > 0 && user ? (
            <GmailImportCards
              emails={contractEmails}
              userId={user.uid}
              completedProjects={completedProjects}
              onImported={() => setContractEmails([])}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Contract Scanner</p>
                  <p className="text-xs text-muted-foreground">
                    {gmailAccessToken
                      ? "No new signed contracts detected"
                      : "Connect Gmail to auto-detect signed contracts"}
                  </p>
                </div>
              </div>
              {gmailAccessToken ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => user && scanGmail(gmailAccessToken, user.uid)}
                  disabled={gmailScanning}
                >
                  {gmailScanning ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Scanning...</>
                  ) : "Rescan"}
                </Button>
              ) : (
                <Button size="sm" onClick={handleConnectGmail} disabled={gmailScanning}>
                  {gmailScanning ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Connecting...</>
                  ) : "Connect Gmail"}
                </Button>
              )}
            </div>
          )}
          {gmailError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{gmailError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Project Tracker
          </h1>
          <p className="text-muted-foreground">
            {activeProjects.length} active · {completedProjects.length} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPastDialogOpen(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Add past project
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New project
          </Button>
        </div>
      </div>

      {/* ── Timer panel ───────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-8 mb-8">
        {timerError && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-5">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{timerError}</p>
          </div>
        )}

        <div className="flex flex-col items-center">
          {/* Status label */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {isActive ? "Session in progress" : "Ready to work"}
          </p>

          {/* Big clock */}
          <div
            className="text-7xl font-bold tracking-tight tabular-nums mb-3"
            style={{
              color: isActive ? "oklch(0.485 0.092 255)" : "oklch(0.22 0.02 264)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatElapsed(elapsedSeconds)}
          </div>

          {isActive && (
            <p className="text-sm text-muted-foreground mb-6">
              {startTimeReady
                ? `Started at ${(activeSession!.startTime as { toDate: () => Date }).toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Starting…"}
            </p>
          )}

          {!isActive && (
            <p className="text-sm text-muted-foreground mb-6">
              Hit Clock In to start a session — you'll assign it to a project when you're done.
            </p>
          )}

          {/* Clock In / Out button */}
          <div className="w-full max-w-xs">
            {isActive ? (
              <Button
                onClick={handleClockOut}
                disabled={timerLoading || !startTimeReady}
                className="w-full h-12 text-base font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <StopCircle className="h-5 w-5 mr-2" />
                {startTimeReady ? "Clock Out" : "Starting…"}
              </Button>
            ) : (
              <Button
                onClick={handleClockIn}
                disabled={timerLoading}
                className="w-full h-12 text-base font-semibold"
              >
                <PlayCircle className="h-5 w-5 mr-2" />
                Clock In
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Projects list ─────────────────────────────────────────── */}
      {(projectsError || deleteError) && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive flex-1">
            {projectsError || deleteError}
          </p>
          <button
            onClick={() => { setProjectsError(null); setDeleteError(null); }}
            className="text-destructive/60 hover:text-destructive text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <DollarSign className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No projects yet</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs">
            Create your first project to start tracking time and income per hour.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New project
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {[
            { label: "Active", items: activeProjects },
            { label: "In Review", items: reviewProjects },
            { label: "Completed", items: completedProjects },
          ].map(
            ({ label, items }) =>
              items.length > 0 && (
                <div key={label}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    {label}
                  </h2>
                  <div className="space-y-3">
                    {items.map((project) => {
                      const barColor = getIPHBarColor(project, targetRate);
                      const hasHours = project.actualHoursTotal && project.actualHoursTotal > 0.001;
                      return (
                        <div
                          key={project.id}
                          onClick={() => openSessions(project)}
                          className="relative rounded-xl border bg-card p-5 flex items-center gap-4 hover:shadow-sm transition-shadow cursor-pointer"
                        >
                          <div className={`w-1 self-stretch rounded-full shrink-0 ${barColor} transition-colors duration-300`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-foreground truncate">{project.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status]}`}>
                                {STATUS_LABELS[project.status]}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {project.clientName} · {project.projectType}
                            </p>
                          </div>

                          <div className="hidden sm:flex items-center gap-6 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground mb-0.5">Quoted</p>
                              <p className="text-sm font-semibold">${project.quotedAmount.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground mb-0.5">{hasHours ? "Logged" : "Est."}</p>
                              <div className="flex items-center gap-1 justify-end">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <p className="text-sm font-semibold">
                                  {hasHours ? formatHours(project.actualHoursTotal) : formatHours(project.estimatedHours)}
                                </p>
                              </div>
                              {hasHours && project.estimatedHours > 0 && (
                                <p className="text-xs text-muted-foreground text-right">of {formatHours(project.estimatedHours)}</p>
                              )}
                            </div>
                            <div className="text-right w-20">
                              <p className="text-xs text-muted-foreground mb-0.5">IPH</p>
                              <IPHBadge project={project} targetRate={targetRate} />
                            </div>
                          </div>

                          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuOpen === project.id && (
                              <div className="absolute right-0 top-9 z-10 w-48 rounded-lg border bg-card shadow-md py-1">
                                <button onClick={() => openSessions(project)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                                  <Timer className="h-3.5 w-3.5" />Time entries
                                </button>
                                <button onClick={() => openEdit(project)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />Edit
                                </button>
                                {project.status !== "completed" && (
                                  <button onClick={() => handleComplete(project)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-green-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" />Mark complete
                                  </button>
                                )}
                                <button onClick={() => handleDelete(project)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <AssignProjectDialog
        open={assignDialogOpen}
        elapsedSeconds={elapsedSeconds}
        projects={activeProjects}
        onConfirm={handleAssignConfirm}
        onCancel={() => setAssignDialogOpen(false)}
      />

      <ProjectFormDialog
        open={dialogOpen}
        onClose={closeDialog}
        onSubmit={editingProject ? handleEdit : handleCreate}
        project={editingProject}
      />

      <PastProjectDialog
        open={pastDialogOpen}
        onClose={() => setPastDialogOpen(false)}
        onSubmit={handleLogPast}
      />

      <ProjectReviewDialog
        project={reviewProject}
        open={!!reviewProject}
        onClose={() => setReviewProject(null)}
        onConfirm={handleConfirmComplete}
      />

      <ProjectSessionsDialog
        open={!!sessionsProjectId}
        onClose={() => setSessionsProjectId(null)}
        project={projects.find((pr) => pr.id === sessionsProjectId) ?? null}
        userId={user?.uid ?? ""}
        allProjects={projects}
      />

      {menuOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  );
}
