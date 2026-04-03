"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import {
  searchSignedContracts,
  getImportedEmailIds,
  isGmailScanEnabled,
  type GmailContractEmail,
} from "@/lib/gmail";
import { GmailImportCards } from "@/components/projects/GmailImportWizard";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  DollarSign,
  Briefcase,
  AlertCircle,
  Mail,
  Loader2,
} from "lucide-react";

interface UserProfile {
  monthlyGoal: number;
  targetHourlyRate: number;
}

function getMonthMeta() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysTotal = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
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

type Pace = "ahead" | "on-track" | "behind" | "neutral";

const PACE_CONFIG: Record<
  Pace,
  {
    label: string;
    detail: string;
    iconColor: string;
    bg: string;
    border: string;
    Icon: React.ElementType;
  }
> = {
  ahead: {
    label: "Ahead of pace",
    detail: "You're earning faster than needed this month. Keep it up.",
    iconColor: "oklch(0.70 0.16 162)",
    bg: "bg-green-50",
    border: "border-green-200",
    Icon: TrendingUp,
  },
  "on-track": {
    label: "On track",
    detail: "You're right where you need to be. Steady as she goes.",
    iconColor: "oklch(0.485 0.092 255)",
    bg: "bg-primary/5",
    border: "border-primary/20",
    Icon: Minus,
  },
  behind: {
    label: "Behind pace",
    detail: "You'll need to pick up the pace to hit your monthly goal.",
    iconColor: "oklch(0.76 0.18 72)",
    bg: "bg-amber-50",
    border: "border-amber-200",
    Icon: TrendingDown,
  },
  neutral: {
    label: "Set a monthly goal",
    detail: "Head to Settings to add a goal and start tracking your pace.",
    iconColor: "oklch(0.55 0.02 264)",
    bg: "bg-muted/40",
    border: "border-border",
    Icon: Minus,
  },
};

export default function DashboardPage() {
  const { user, gmailAccessToken, connectGmail } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Gmail import state
  const [contractEmails, setContractEmails] = useState<GmailContractEmail[]>(
    []
  );
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [hasAutoScanned, setHasAutoScanned] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(true);

  const scanGmail = useCallback(
    async (token: string, uid: string) => {
      setGmailScanning(true);
      setGmailError(null);
      try {
        const emails = await searchSignedContracts(token);
        // Filter out already-imported/dismissed emails
        const imported = await getImportedEmailIds(uid);
        const newEmails = emails.filter((e) => !imported.has(e.id));
        setContractEmails(newEmails);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "GMAIL_AUTH_EXPIRED") {
          setGmailError("Gmail access expired. Click below to reconnect.");
        } else {
          setGmailError("Could not scan Gmail. Try reconnecting.");
        }
      } finally {
        setGmailScanning(false);
      }
    },
    []
  );

  // Auto-scan Gmail on first load when token is available and scanning is enabled
  useEffect(() => {
    if (!user || !gmailAccessToken || hasAutoScanned) return;

    async function autoScan() {
      const enabled = await isGmailScanEnabled(user!.uid);
      setScanEnabled(enabled);
      if (!enabled) {
        setHasAutoScanned(true);
        return;
      }
      setHasAutoScanned(true);
      scanGmail(gmailAccessToken!, user!.uid);
    }

    autoScan();
  }, [user, gmailAccessToken, hasAutoScanned, scanGmail]);

  async function handleConnectGmail() {
    setGmailError(null);
    try {
      const token = await connectGmail();
      if (token && user) {
        await scanGmail(token, user.uid);
      }
    } catch {
      setGmailError("Gmail connection was cancelled or failed.");
    }
  }

  // Realtime user profile
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile);
    });
  }, [user]);

  // Realtime projects
  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects, (err) => {
      console.error("subscribeToProjects error:", err);
      setProjectsError(
        err.message.includes("index")
          ? "A Firestore index is missing. Check the browser console for a link to create it."
          : `Failed to load projects: ${err.message}`
      );
    });
  }, [user]);

  // ── Derived stats ────────────────────────────────────────────────
  const { startTs, daysTotal, dayElapsed } = getMonthMeta();

  const completedThisMonth = projects.filter((p) => {
    if (!p.completedAt) return false;
    const ts = p.completedAt.toMillis ? p.completedAt.toMillis() : 0;
    return ts >= startTs;
  });
  const monthlyIncome = completedThisMonth.reduce(
    (sum, p) => sum + p.quotedAmount,
    0
  );

  const monthlyGoal = profile?.monthlyGoal ?? 0;
  const goalPct =
    monthlyGoal > 0 ? Math.min(monthlyIncome / monthlyGoal, 1) : 0;
  const monthPct = dayElapsed / daysTotal;

  const completedWithHours = projects.filter(
    (p) => p.status === "completed" && p.actualHoursTotal > 0
  );
  const totalEarned = completedWithHours.reduce(
    (sum, p) => sum + p.quotedAmount,
    0
  );
  const totalHours = completedWithHours.reduce(
    (sum, p) => sum + p.actualHoursTotal,
    0
  );
  const iph = totalHours > 0 ? totalEarned / totalHours : null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const completedProjects = projects.filter((p) => p.status === "completed");

  const pace: Pace =
    monthlyGoal === 0
      ? "neutral"
      : goalPct >= monthPct + 0.05
        ? "ahead"
        : goalPct >= monthPct - 0.1
          ? "on-track"
          : "behind";

  const pc = PACE_CONFIG[pace];

  const monthLabel = new Date().toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          {greeting()}.
        </h1>
        <p className="text-muted-foreground">{monthLabel} overview.</p>
      </div>

      {/* Projects error */}
      {projectsError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-6">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{projectsError}</p>
        </div>
      )}

      {/* Pace banner */}
      <div
        className={`rounded-2xl border ${pc.bg} ${pc.border} p-5 mb-6 flex items-center gap-4`}
      >
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `color-mix(in oklch, ${pc.iconColor} 15%, transparent)`,
          }}
        >
          <pc.Icon className="h-5 w-5" style={{ color: pc.iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{pc.label}</p>
          <p className="text-sm text-muted-foreground">{pc.detail}</p>
        </div>
        {monthlyGoal > 0 && (
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">
              Day {dayElapsed} of {daysTotal}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {Math.round(goalPct * 100)}% of goal
            </p>
          </div>
        )}
      </div>

      {/* Gmail import cards — signed contract imports */}
      {user && contractEmails.length > 0 && (
        <GmailImportCards
          emails={contractEmails}
          userId={user.uid}
          completedProjects={completedProjects}
          onImported={() => setContractEmails([])}
        />
      )}

      {/* Gmail connect / status bar (only show if scanning is enabled) */}
      {scanEnabled && !contractEmails.length && (
        <div className="rounded-2xl border bg-card p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  Contract Scanner
                </p>
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
                onClick={() =>
                  user && scanGmail(gmailAccessToken, user.uid)
                }
                disabled={gmailScanning}
              >
                {gmailScanning ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  "Rescan"
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnectGmail}
                disabled={gmailScanning}
              >
                {gmailScanning ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect Gmail"
                )}
              </Button>
            )}
          </div>
          {gmailError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{gmailError}</span>
            </div>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly goal */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Monthly Income
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(monthlyIncome)}
            <span className="text-base font-normal text-muted-foreground ml-1">
              /{" "}
              {monthlyGoal > 0
                ? formatCurrency(monthlyGoal)
                : "no goal set"}
            </span>
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{
                width: `${goalPct * 100}%`,
                backgroundColor: "oklch(0.485 0.092 255)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {completedThisMonth.length === 0
              ? "No projects completed this month"
              : `${completedThisMonth.length} project${completedThisMonth.length !== 1 ? "s" : ""} completed this month`}
          </p>
        </div>

        {/* IPH */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: "oklch(0.73 0.11 192 / 0.15)",
              }}
            >
              <Clock
                className="h-4 w-4"
                style={{ color: "oklch(0.73 0.11 192)" }}
              />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Income Per Hour
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {iph !== null ? `$${Math.round(iph)}/hr` : "\u2014"}
          </p>
          {iph !== null && profile?.targetHourlyRate ? (
            <p className="text-xs text-muted-foreground mt-2">
              Target: ${profile.targetHourlyRate}/hr ·{" "}
              <span
                style={{
                  color:
                    iph >= profile.targetHourlyRate
                      ? "oklch(0.70 0.16 162)"
                      : "oklch(0.76 0.18 72)",
                  fontWeight: 500,
                }}
              >
                {iph >= profile.targetHourlyRate
                  ? "above target"
                  : "below target"}
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

        {/* Active projects */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Active Projects
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {activeProjects.length}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {activeProjects.length === 0
              ? "No active projects"
              : activeProjects
                  .slice(0, 2)
                  .map((p) => p.name)
                  .join(", ") +
                (activeProjects.length > 2
                  ? ` +${activeProjects.length - 2} more`
                  : "")}
          </p>
        </div>
      </div>
    </div>
  );
}
