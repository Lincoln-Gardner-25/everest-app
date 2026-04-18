"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Clock, X, Check, Play, Square } from "lucide-react";
import {
  subscribeToProjectSessions,
  subscribeToActiveSession,
  clockIn,
  clockOut,
  createManualSession,
  updateSession,
  deleteSession,
  type Session,
} from "@/lib/sessions";
import type { Project } from "@/lib/projects";
import { completeProject } from "@/lib/projects";
import { Timestamp } from "firebase/firestore";

interface Props {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  userId: string;
  allProjects?: Project[];
}

// Firestore resolves serverTimestamp() asynchronously — the first local
// snapshot may have startTime as null. This guard prevents calling
// toMillis() on a pending FieldValue.
function isValidTimestamp(ts: unknown): ts is { toMillis: () => number } {
  return ts != null && typeof (ts as { toMillis?: unknown }).toMillis === "function";
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHours(h: number) {
  if (h === 0) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function formatDuration(minutes: number) {
  return formatHours(minutes / 60);
}

function formatSessionDate(ts: Timestamp) {
  const d = ts.toDate();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - sessionDay.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSessionTime(ts: Timestamp) {
  return ts.toDate().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const QUICK_HOURS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];

interface FormState {
  date: string;
  hours: string;
  notes: string;
}

const EMPTY_FORM: FormState = { date: "", hours: "", notes: "" };

export function ProjectSessionsDialog({ open, onClose, project, userId, allProjects }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clock in/out state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clockLoading, setClockLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const projectId = project?.id;

  // Subscribe to active session (any project) for this user
  useEffect(() => {
    if (!open || !userId) return;
    return subscribeToActiveSession(userId, setActiveSession, (err) => {
      console.error("subscribeToActiveSession error:", err);
    });
  }, [open, userId]);

  // Live elapsed timer
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (activeSession && activeSession.projectId === projectId && isValidTimestamp(activeSession.startTime)) {
      const tick = () => {
        const startMs = (activeSession.startTime as { toMillis: () => number }).toMillis();
        setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSession, projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    return subscribeToProjectSessions(projectId, userId, setSessions, (err) => {
      console.error("subscribeToProjectSessions error:", err);
    });
  }, [open, projectId, userId]);

  useEffect(() => {
    if (!open) {
      setShowForm(false);
      setEditingSession(null);
      setForm(EMPTY_FORM);
      setFormError("");
      setJustSaved(false);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    }
  }, [open]);

  // Auto-focus hours field when form opens
  useEffect(() => {
    if (showForm && hoursRef.current) {
      setTimeout(() => hoursRef.current?.focus(), 50);
    }
  }, [showForm]);

  if (!project) return null;
  const p = project;

  const totalHours = p.actualHoursTotal ?? 0;
  const projectedIPH =
    p.estimatedHours > 0 ? p.quotedAmount / p.estimatedHours : null;
  const actualIPH = totalHours > 0 ? p.quotedAmount / totalHours : null;
  const hourDelta = totalHours - p.estimatedHours;

  function openAdd() {
    setEditingSession(null);
    setForm({ date: toInputDate(new Date()), hours: "", notes: "" });
    setFormError("");
    setJustSaved(false);
    setShowForm(true);
  }

  function openEdit(session: Session) {
    if (!session.endTime) return;
    setEditingSession(session);
    setForm({
      date: toInputDate(session.startTime.toDate()),
      hours: (session.durationMinutes / 60).toFixed(2).replace(/\.?0+$/, ""),
      notes: session.notes ?? "",
    });
    setFormError("");
    setJustSaved(false);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingSession(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setJustSaved(false);
  }

  function selectQuickHours(h: number) {
    setForm((f) => ({ ...f, hours: String(h) }));
    setFormError("");
  }


  function validateAndParse(): { hours: number; start: Date; end: Date } | string {
    if (!form.date) return "Date is required.";
    const h = parseFloat(form.hours);
    if (!form.hours || isNaN(h) || h <= 0) return "Enter hours worked (e.g. 2.5).";
    if (h > 24) return "Cannot exceed 24 hours.";
    const dateObj = new Date(form.date + "T09:00");
    if (isNaN(dateObj.getTime())) return "Invalid date.";
    return { hours: h, start: dateObj, end: new Date(dateObj.getTime() + h * 3600000) };
  }

  async function handleSave() {
    const result = validateAndParse();
    if (typeof result === "string") { setFormError(result); return; }

    setSaving(true);
    setFormError("");
    setJustSaved(false);
    try {
      if (editingSession) {
        await updateSession(
          editingSession.id,
          p.id,
          editingSession.durationMinutes,
          result.start,
          result.end,
          form.notes
        );
        cancelForm();
      } else {
        await createManualSession(userId, p.id, result.start, result.end, form.notes);
        // Stay in add mode for batch entry — clear hours + notes, keep date
        setForm((f) => ({ ...f, hours: "", notes: "" }));
        setJustSaved(true);
        timersRef.current.push(setTimeout(() => setJustSaved(false), 2000));
        timersRef.current.push(setTimeout(() => hoursRef.current?.focus(), 50));
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      cancelForm();
    }
  }

  async function handleDelete(session: Session) {
    if (!confirm("Delete this time entry? This cannot be undone.")) return;
    try {
      await deleteSession(session.id, p.id, session.durationMinutes);
    } catch (e) {
      console.error("Delete session error:", e);
    }
  }

  async function handleClockIn() {
    if (!project) return;
    setClockLoading(true);
    try {
      await clockIn(userId);
    } catch (e) {
      console.error("Clock in error:", e);
    } finally {
      setClockLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeSession || !project) return;
    if (!isValidTimestamp(activeSession.startTime)) return;
    setClockLoading(true);
    try {
      await clockOut(activeSession.id, project.id, activeSession.startTime as Timestamp);
    } catch (e) {
      console.error("Clock out error:", e);
    } finally {
      setClockLoading(false);
    }
  }

  async function handleMarkComplete() {
    if (!confirm(`Mark "${p.name}" as complete? This will close the project.`)) return;
    setCompleting(true);
    try {
      await completeProject(p.id);
      onClose();
    } catch (e) {
      console.error("Complete project error:", e);
    } finally {
      setCompleting(false);
    }
  }

  const isClockedInToThis = !!activeSession && activeSession.projectId === projectId;
  const isClockedInToOther = !!activeSession && activeSession.projectId !== projectId;
  const otherProjectName = isClockedInToOther && allProjects
    ? allProjects.find((p) => p.id === activeSession.projectId)?.name ?? "another project"
    : "another project";
  const startTimeReady = isClockedInToThis && isValidTimestamp(activeSession?.startTime);

  const completedSessions = sessions.filter((s) => s.endTime !== null);
  const activeSessions = sessions.filter((s) => s.endTime === null);

  // Compute what IPH would be with the pending hours
  const pendingHours = parseFloat(form.hours) || 0;
  const rawPreviewTotal = totalHours + (editingSession ? pendingHours - editingSession.durationMinutes / 60 : pendingHours);
  const previewTotal = Math.max(0, rawPreviewTotal);
  const previewIPH = previewTotal > 0.001 ? p.quotedAmount / previewTotal : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl" style={{ fontFamily: "var(--font-libre-baskerville)" }}>
            {p.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{p.clientName} · {p.projectType}</p>
        </DialogHeader>

        {/* Clock In/Out */}
        {p.status === "active" && (
          <div className="mt-1">
            {isClockedInToThis ? (
              <Button
                className="w-full h-12 text-base font-semibold bg-red-600 hover:bg-red-700 text-white"
                onClick={handleClockOut}
                disabled={clockLoading || !startTimeReady}
              >
                <Square className="h-4 w-4 mr-2" />
                {startTimeReady
                  ? <>Clock Out — <span className="font-mono">{formatElapsed(elapsedSeconds)}</span></>
                  : "Starting..."}
              </Button>
            ) : isClockedInToOther ? (
              <Button
                className="w-full h-12 text-base font-semibold"
                variant="outline"
                disabled
              >
                <Clock className="h-4 w-4 mr-2" />
                Currently clocked in to {otherProjectName}
              </Button>
            ) : (
              <Button
                className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleClockIn}
                disabled={clockLoading}
              >
                <Play className="h-4 w-4 mr-2" />
                Clock In to {p.name}
              </Button>
            )}
            <div className="border-b mt-4 mb-1" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Hours Logged</p>
            <p className="text-lg font-semibold">{formatHours(totalHours)}</p>
            {p.estimatedHours > 0 && (
              <p className="text-xs text-muted-foreground">of {formatHours(p.estimatedHours)} est.</p>
            )}
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Actual IPH</p>
            <p className="text-lg font-semibold">
              {actualIPH ? `$${actualIPH.toFixed(0)}/hr` : "\u2014"}
            </p>
            {projectedIPH && (
              <p className="text-xs text-muted-foreground">proj. ${projectedIPH.toFixed(0)}/hr</p>
            )}
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Quoted</p>
            <p className="text-lg font-semibold">${p.quotedAmount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">vs Budget</p>
            <p className={`text-lg font-semibold ${hourDelta > 0.05 ? "text-destructive" : hourDelta < -0.05 ? "text-green-600" : "text-foreground"}`}>
              {hourDelta === 0 || p.estimatedHours === 0
                ? "\u2014"
                : `${hourDelta > 0 ? "+" : ""}${formatHours(hourDelta)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {hourDelta > 0.05 ? "over budget" : hourDelta < -0.05 ? "under budget" : "on budget"}
            </p>
          </div>
        </div>

        <div className="border-t pt-4 mt-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Time Entries
            </h3>
            {!showForm && (
              <Button size="sm" variant="outline" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add entry
              </Button>
            )}
          </div>

          {/* Add/Edit form */}
          {showForm && (
            <div
              className="rounded-lg border bg-muted/20 p-4 mb-4 space-y-3"
              onKeyDown={handleKeyDown}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {editingSession ? "Edit time entry" : "Log time"}
                  </p>
                  {justSaved && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium animate-in fade-in">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                </div>
                <button onClick={cancelForm} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* Hours with quick presets */}
              <div className="space-y-1.5">
                <Label className="text-xs">Hours worked</Label>
                <Input
                  ref={hoursRef}
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  placeholder="e.g. 2.5"
                  value={form.hours}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, hours: e.target.value }));
                    setFormError("");
                  }}
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => selectQuickHours(h)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        form.hours === String(h)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted border-border text-muted-foreground"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="What did you work on?"
                />
              </div>

              {/* Live preview of impact */}
              {pendingHours > 0 && !editingSession && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Adding {formatHours(pendingHours)} will bring total to{" "}
                  <span className="font-medium text-foreground">{formatHours(previewTotal)}</span>
                  {previewIPH && (
                    <>
                      {" "}at{" "}
                      <span className="font-medium text-foreground">
                        ${previewIPH.toFixed(0)}/hr
                      </span>
                    </>
                  )}
                </div>
              )}

              {formError && <p className="text-xs text-destructive">{formError}</p>}

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  {editingSession ? "" : "Enter to save, Esc to cancel"}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelForm}>
                    {editingSession ? "Cancel" : "Done"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : editingSession ? "Save changes" : "Add entry"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Active sessions */}
          {activeSessions.length > 0 && (
            <div className="mb-3 space-y-2">
              {activeSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">In progress</p>
                    {s.startTime && (
                      <p className="text-xs text-muted-foreground">
                        Started {formatSessionTime(s.startTime)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-primary font-medium">Active</span>
                </div>
              ))}
            </div>
          )}

          {/* Completed sessions */}
          {completedSessions.length === 0 && activeSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No time entries yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the timer or add a manual entry above.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {completedSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/30 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{formatSessionDate(s.startTime)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSessionTime(s.startTime)} – {s.endTime ? formatSessionTime(s.endTime) : ""}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{formatDuration(s.durationMinutes)}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEdit(s)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mark complete — shown for active and review projects */}
        {(p.status === "active" || p.status === "review") && (
          <div className="border-t pt-4 mt-2">
            <Button
              variant="outline"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={handleMarkComplete}
              disabled={completing || isClockedInToThis}
              title={isClockedInToThis ? "Clock out before completing" : undefined}
            >
              <Check className="h-4 w-4 mr-2" />
              {completing ? "Completing..." : "Mark project as complete"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
