"use client";

import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import {
  clockIn,
  assignAndClockOut,
  subscribeToActiveSession,
  type Session,
} from "@/lib/sessions";
import { AssignProjectDialog } from "@/components/project-tracker/AssignProjectDialog";
import { QuickLeadSearch } from "@/components/dashboard/QuickLeadSearch";
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  DollarSign,
  Briefcase,
  AlertCircle,
  PlayCircle,
  StopCircle,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserProfile {
  monthlyGoal: number;
  targetHourlyRate: number;
}

function getMonthMeta() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { startTs: start.getTime(), daysTotal, dayElapsed: now.getDate() };
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function isValidTimestamp(ts: unknown): ts is { toMillis: () => number } {
  return ts != null && typeof (ts as { toMillis?: unknown }).toMillis === "function";
}

type Pace = "ahead" | "on-track" | "behind" | "neutral";

const PACE_CONFIG: Record<Pace, {
  label: string;
  detail: string;
  iconColor: string;
  bg: string;
  border: string;
  Icon: React.ElementType;
}> = {
  ahead: {
    label: "Ahead of pace",
    detail: "You're earning faster than needed this month.",
    iconColor: "oklch(0.70 0.16 162)",
    bg: "bg-green-50",
    border: "border-green-200",
    Icon: TrendingUp,
  },
  "on-track": {
    label: "On track",
    detail: "Right where you need to be. Steady as she goes.",
    iconColor: "oklch(0.485 0.092 255)",
    bg: "bg-primary/5",
    border: "border-primary/20",
    Icon: Minus,
  },
  behind: {
    label: "Behind pace",
    detail: "You'll need to pick up the pace to hit your goal.",
    iconColor: "oklch(0.76 0.18 72)",
    bg: "bg-amber-50",
    border: "border-amber-200",
    Icon: TrendingDown,
  },
  neutral: {
    label: "Set a monthly goal",
    detail: "Head to Income Report to add a goal and track your pace.",
    iconColor: "oklch(0.55 0.02 264)",
    bg: "bg-muted/40",
    border: "border-border",
    Icon: Minus,
  },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Active session / quick clock
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clockLoading, setClockLoading] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Subscriptions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects, (err) => {
      setProjectsError(
        err.message.includes("index")
          ? "A Firestore index is missing. Check the browser console."
          : `Failed to load projects: ${err.message}`
      );
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveSession(user.uid, setActiveSession);
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

  // ── Clock handlers ───────────────────────────────────────────────────

  async function handleClockIn() {
    if (!user) return;
    setClockLoading(true);
    setClockError(null);
    try {
      await clockIn(user.uid);
    } catch (err) {
      setClockError(err instanceof Error ? err.message : "Failed to clock in.");
    } finally {
      setClockLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeSession || !isValidTimestamp(activeSession.startTime)) return;
    setAssignDialogOpen(true);
  }

  async function handleAssignConfirm(projectId: string) {
    if (!activeSession || !isValidTimestamp(activeSession.startTime)) return;
    await assignAndClockOut(activeSession.id, projectId, activeSession.startTime as never);
    setAssignDialogOpen(false);
  }

  // ── Derived stats ────────────────────────────────────────────────────

  const { startTs, daysTotal, dayElapsed } = getMonthMeta();

  const completedThisMonth = projects.filter((p) => {
    if (!p.completedAt) return false;
    const ts = p.completedAt.toMillis ? p.completedAt.toMillis() : 0;
    return ts >= startTs;
  });
  const monthlyIncome = completedThisMonth.reduce((sum, p) => sum + p.quotedAmount, 0);

  const monthlyGoal = profile?.monthlyGoal ?? 0;
  const goalPct = monthlyGoal > 0 ? Math.min(monthlyIncome / monthlyGoal, 1) : 0;
  const monthPct = dayElapsed / daysTotal;

  const completedWithHours = projects.filter(
    (p) => p.status === "completed" && p.actualHoursTotal > 0
  );
  const totalEarned = completedWithHours.reduce((sum, p) => sum + p.quotedAmount, 0);
  const totalHours = completedWithHours.reduce((sum, p) => sum + p.actualHoursTotal, 0);
  const iph = totalHours > 0 ? totalEarned / totalHours : null;

  const activeProjects = projects.filter((p) => p.status === "active");

  const pace: Pace =
    monthlyGoal === 0
      ? "neutral"
      : goalPct >= monthPct + 0.05
        ? "ahead"
        : goalPct >= monthPct - 0.1
          ? "on-track"
          : "behind";

  const pc = PACE_CONFIG[pace];

  // Most recent active project for quick clock-in
  const mostRecentActive = activeProjects.length > 0
    ? activeProjects.sort((a, b) =>
        (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      )[0]
    : null;

  const isActive = !!activeSession;
  const startTimeReady = isActive && isValidTimestamp(activeSession?.startTime);

  const monthLabel = new Date().toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-2">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          {greeting()}.
        </h1>
        <p className="text-muted-foreground">{monthLabel} overview.</p>
      </div>

      {projectsError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{projectsError}</p>
        </div>
      )}

      {/* ── Row 1: KPI cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Monthly Income */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Monthly Income</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(monthlyIncome)}
            <span className="text-base font-normal text-muted-foreground ml-1">
              / {monthlyGoal > 0 ? formatCurrency(monthlyGoal) : "no goal set"}
            </span>
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{ width: `${goalPct * 100}%`, backgroundColor: "oklch(0.485 0.092 255)" }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {completedThisMonth.length === 0
              ? "No projects completed this month"
              : `${completedThisMonth.length} project${completedThisMonth.length !== 1 ? "s" : ""} completed`}
          </p>
        </div>

        {/* IPH */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "oklch(0.73 0.11 192 / 0.15)" }}>
              <Clock className="h-4 w-4" style={{ color: "oklch(0.73 0.11 192)" }} />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Income Per Hour</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {iph !== null ? `$${Math.round(iph)}/hr` : "—"}
          </p>
          {iph !== null && profile?.targetHourlyRate ? (
            <p className="text-xs text-muted-foreground mt-2">
              Target: ${profile.targetHourlyRate}/hr ·{" "}
              <span style={{ color: iph >= profile.targetHourlyRate ? "oklch(0.70 0.16 162)" : "oklch(0.76 0.18 72)", fontWeight: 500 }}>
                {iph >= profile.targetHourlyRate ? "above target" : "below target"}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              {completedWithHours.length === 0
                ? "Complete a timed project to see IPH"
                : `Across ${completedWithHours.length} completed project${completedWithHours.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        {/* Active Projects */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{activeProjects.length}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {activeProjects.length === 0
              ? "No active projects"
              : activeProjects.slice(0, 2).map((p) => p.name).join(", ") +
                (activeProjects.length > 2 ? ` +${activeProjects.length - 2} more` : "")}
          </p>
        </div>
      </div>

      {/* ── Row 2: Pace/Goals + Quick Clock-In ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Pace + Goals box (left 2/3) */}
        <div className={`lg:col-span-2 rounded-2xl border ${pc.bg} ${pc.border} p-6`}>
          <div className="flex items-start gap-4 mb-5">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `color-mix(in oklch, ${pc.iconColor} 15%, transparent)` }}
            >
              <pc.Icon className="h-5 w-5" style={{ color: pc.iconColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{pc.label}</p>
              <p className="text-sm text-muted-foreground">{pc.detail}</p>
            </div>
            {monthlyGoal > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">Day {dayElapsed} of {daysTotal}</p>
                <p className="text-sm font-semibold text-foreground">{Math.round(goalPct * 100)}% of goal</p>
              </div>
            )}
          </div>

          {/* Goal details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-black/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Monthly Goal</p>
              </div>
              <p className="text-xl font-bold text-foreground">
                {monthlyGoal > 0 ? formatCurrency(monthlyGoal) : "—"}
              </p>
              {monthlyGoal > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Earned: {formatCurrency(monthlyIncome)}
                  <span className="ml-1">({Math.round(goalPct * 100)}%)</span>
                </p>
              )}
            </div>

            <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-black/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Target IPH</p>
              </div>
              <p className="text-xl font-bold text-foreground">
                {profile?.targetHourlyRate ? `$${profile.targetHourlyRate}/hr` : "—"}
              </p>
              {iph !== null && (
                <p className="text-xs mt-1" style={{
                  color: iph >= (profile?.targetHourlyRate ?? 0)
                    ? "oklch(0.70 0.16 162)"
                    : "oklch(0.76 0.18 72)"
                }}>
                  Actual: ${Math.round(iph)}/hr
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Clock-In panel (right 1/3) */}
        <div className="rounded-2xl border bg-card p-6 flex flex-col">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Quick Clock-In
          </p>

          {clockError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-3">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{clockError}</p>
            </div>
          )}

          {isActive ? (
            <>
              <div className="flex-1 flex flex-col items-center justify-center text-center mb-4">
                <p className="text-xs text-muted-foreground mb-1">Session in progress</p>
                <p
                  className="text-4xl font-bold tabular-nums mb-1"
                  style={{ color: "oklch(0.485 0.092 255)", fontVariantNumeric: "tabular-nums" }}
                >
                  {formatElapsed(elapsedSeconds)}
                </p>
                {startTimeReady && (
                  <p className="text-xs text-muted-foreground">
                    Started at {(activeSession!.startTime as { toDate: () => Date }).toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <Button
                onClick={handleClockOut}
                disabled={clockLoading || !startTimeReady}
                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <StopCircle className="h-4 w-4 mr-2" />
                {startTimeReady ? "Clock Out" : "Starting…"}
              </Button>
            </>
          ) : (
            <>
              {mostRecentActive ? (
                <div className="flex-1 mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Most recent project</p>
                  <p className="font-semibold text-foreground truncate">{mostRecentActive.name}</p>
                  {mostRecentActive.clientName && (
                    <p className="text-xs text-muted-foreground truncate">{mostRecentActive.clientName}</p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center mb-4">
                  <p className="text-sm text-muted-foreground">
                    No active projects yet. Create one in Project Tracker.
                  </p>
                </div>
              )}
              <Button
                onClick={handleClockIn}
                disabled={clockLoading || !mostRecentActive}
                className="w-full"
                title={!mostRecentActive ? "Create an active project first" : undefined}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {mostRecentActive ? "Clock In" : "No active projects"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Row 3: Quick Lead Finder ─────────────────────────────────── */}
      <QuickLeadSearch />

      {/* ── Row 4: Calendar ─────────────────────────────────────────── */}
      <DashboardCalendar />

      {/* Assign project dialog (shown when clocking out from dashboard) */}
      <AssignProjectDialog
        open={assignDialogOpen}
        elapsedSeconds={elapsedSeconds}
        projects={activeProjects}
        onConfirm={handleAssignConfirm}
        onCancel={() => setAssignDialogOpen(false)}
      />
    </div>
  );
}
