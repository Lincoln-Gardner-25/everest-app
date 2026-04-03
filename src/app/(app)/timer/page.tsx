"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import {
  clockIn,
  clockOut,
  subscribeToActiveSession,
  subscribeToProjectSessions,
  type Session,
} from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { Clock, PlayCircle, StopCircle, AlertCircle } from "lucide-react";

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(ts: { toDate?: () => Date } | null) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: { toDate?: () => Date } | null) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString([], { month: "short", day: "numeric" });
}

// Firestore resolves serverTimestamp() asynchronously — the first local
// snapshot may have startTime as null. This guard prevents calling
// toMillis() on a pending FieldValue.
function isValidTimestamp(ts: unknown): ts is { toMillis: () => number } {
  return ts != null && typeof (ts as { toMillis?: unknown }).toMillis === "function";
}

export default function TimerPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [projectSessions, setProjectSessions] = useState<Session[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(
      user.uid,
      (all) => {
        setProjects(all.filter((p) => p.status === "active"));
      },
      (err) => {
        console.error("subscribeToProjects error:", err);
        setError(
          err.message.includes("index")
            ? "A Firestore index is missing. Check the browser console for a link to create it."
            : `Failed to load projects: ${err.message}`
        );
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveSession(
      user.uid,
      (session) => {
        setActiveSession(session);
        if (session) setSelectedProjectId(session.projectId);
      },
      (err) => {
        console.error("subscribeToActiveSession error:", err);
        setError(
          err.message.includes("index")
            ? "A Firestore index is missing. Open the browser console and click the link in the error to create it."
            : `Session error: ${err.message}`
        );
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user || !selectedProjectId) {
      setProjectSessions([]);
      return;
    }
    return subscribeToProjectSessions(
      selectedProjectId,
      user.uid,
      setProjectSessions,
      (err) => {
        console.error("subscribeToProjectSessions error:", err);
        setError(
          err.message.includes("index")
            ? "A Firestore index is missing. Open the browser console and click the link in the error to create it."
            : `Session history error: ${err.message}`
        );
      }
    );
  }, [user, selectedProjectId]);

  // Tick every second — only starts once serverTimestamp() resolves
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

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSession]);

  async function handleClockIn() {
    if (!user || !selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      await clockIn(user.uid, selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clock in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!user || !activeSession) return;
    // Wait for serverTimestamp to resolve before allowing clock out
    if (!isValidTimestamp(activeSession.startTime)) return;
    setLoading(true);
    setError(null);
    try {
      await clockOut(
        activeSession.id,
        activeSession.projectId,
        activeSession.startTime as never
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clock out.");
    } finally {
      setLoading(false);
    }
  }

  const isActive = !!activeSession;
  // Clock Out is only enabled once the server timestamp has resolved
  const startTimeReady = isActive && isValidTimestamp(activeSession?.startTime);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const completedSessions = projectSessions.filter((s) => s.endTime !== null);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
    <div className="max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Timer
        </h1>
        <p className="text-muted-foreground">Clock in and out of your projects.</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-4 max-w-lg">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Clock panel */}
      <div className="rounded-2xl border bg-card p-8 mb-6 max-w-lg">
        {/* Project selector */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
            Project
          </label>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active projects. Create one first.
            </p>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={isActive}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.clientName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Elapsed display */}
        <div className="text-center mb-8">
          <div
            className="text-6xl font-bold tracking-tight tabular-nums"
            style={{
              color: isActive
                ? "oklch(0.485 0.092 255)"
                : "oklch(0.22 0.02 264)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatElapsed(elapsedSeconds)}
          </div>
          {isActive && (
            <p className="text-sm text-muted-foreground mt-2">
              {startTimeReady
                ? `Started at ${formatTime(activeSession?.startTime ?? null)}`
                : "Starting…"}
            </p>
          )}
        </div>

        {/* Clock in / out button */}
        {isActive ? (
          <Button
            onClick={handleClockOut}
            disabled={loading || !startTimeReady}
            className="w-full h-12 text-base font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <StopCircle className="h-5 w-5 mr-2" />
            {startTimeReady ? "Clock Out" : "Starting…"}
          </Button>
        ) : (
          <Button
            onClick={handleClockIn}
            disabled={loading || !selectedProjectId}
            className="w-full h-12 text-base font-semibold"
          >
            <PlayCircle className="h-5 w-5 mr-2" />
            Clock In
          </Button>
        )}
      </div>

      {/* Session history */}
      {selectedProjectId && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Session History
              {selectedProject && ` — ${selectedProject.name}`}
            </h2>
            {selectedProject && (
              <span className="text-sm text-muted-foreground">
                {selectedProject.actualHoursTotal.toFixed(1)}h total
              </span>
            )}
          </div>

          {completedSessions.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No sessions logged yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {completedSessions.map((session) => (
                <div key={session.id} className="flex items-center px-5 py-3 gap-4">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(session.startTime)}
                    </span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {formatTime(session.startTime)} → {formatTime(session.endTime)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {formatDuration(session.durationMinutes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
