"use client";

import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import {
  filterProjectsByMonth,
  groupByProjectType,
  formatMonthLabel,
} from "@/lib/reflect-utils";
import { MonthSelector } from "@/components/reflect/MonthSelector";
import { IncomeSummary } from "@/components/reflect/IncomeSummary";
import { IncomeWaterfallChart } from "@/components/reflect/IncomeWaterfallChart";
import { RankedProjectList } from "@/components/reflect/RankedProjectList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, CalendarX2, Loader2, Target } from "lucide-react";

export function IncomeReportPage() {
  const { user } = useAuth();

  // ── Goals state ────────────────────────────────────────────────────────
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Reflect state ──────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [reflectLoading, setReflectLoading] = useState(true);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  // ── Load goals ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMonthlyGoal(data.monthlyGoal ? String(data.monthlyGoal) : "");
        setTargetRate(data.targetHourlyRate ? String(data.targetHourlyRate) : "");
      }
      setGoalsLoading(false);
    });
  }, [user]);

  // ── Load projects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setReflectLoading(true);
    return subscribeToProjects(
      user.uid,
      (p) => {
        setProjects(p);
        setReflectLoading(false);
      },
      (err) => {
        console.error("Income Report subscribeToProjects error:", err);
        setReflectLoading(false);
      }
    );
  }, [user]);

  // ── Input handlers ─────────────────────────────────────────────────────
  function handleMonthlyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setMonthlyGoal(v);
  }

  function handleRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setTargetRate(v);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const monthly = parseFloat(monthlyGoal) || 0;
      const rate = parseFloat(targetRate) || 0;
      await setDoc(
        doc(db, "users", user.uid),
        {
          monthlyGoal: monthly,
          yearlyGoal: monthly * 12,
          targetHourlyRate: rate,
        },
        { merge: true }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Reflect derived data ───────────────────────────────────────────────
  const monthProjects = useMemo(
    () => filterProjectsByMonth(projects, selectedYear, selectedMonth),
    [projects, selectedYear, selectedMonth]
  );

  const totalIncome = useMemo(
    () => monthProjects.reduce((sum, p) => sum + p.quotedAmount, 0),
    [monthProjects]
  );

  const byType = useMemo(
    () => groupByProjectType(monthProjects),
    [monthProjects]
  );

  const monthly = parseFloat(monthlyGoal) || 0;

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Income Report
        </h1>
        <p className="text-muted-foreground">
          Set your income goals and review your monthly performance.
        </p>
      </div>

      {/* ── Goals card ────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-6 mb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Income Goals</h2>
              <p className="text-sm text-muted-foreground">
                Set your monthly target and desired hourly rate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <Button onClick={handleSave} disabled={saving || goalsLoading}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {goalsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="monthly-goal">Monthly income goal</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                  $
                </span>
                <Input
                  id="monthly-goal"
                  type="text"
                  inputMode="decimal"
                  placeholder="5000"
                  value={monthlyGoal}
                  onChange={handleMonthlyChange}
                  className="pl-7"
                />
              </div>
              {monthly > 0 && (
                <p className="text-xs text-muted-foreground">
                  Yearly:{" "}
                  <span className="text-foreground font-medium">
                    ${(monthly * 12).toLocaleString()}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-rate">Target hourly rate</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                  $
                </span>
                <Input
                  id="target-rate"
                  type="text"
                  inputMode="decimal"
                  placeholder="75"
                  value={targetRate}
                  onChange={handleRateChange}
                  className="pl-7 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                  /hr
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Compared against your actual IPH on each completed project.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Progress divider ──────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 border-t border-border" />
        <div className="flex items-center justify-between w-full">
          <h2
            className="text-xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Your Progress
          </h2>
          <MonthSelector
            year={selectedYear}
            month={selectedMonth}
            onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m); }}
          />
        </div>
      </div>

      {/* ── Reflect content ───────────────────────────────────────── */}
      {reflectLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : monthProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <CalendarX2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3
            className="text-lg font-semibold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            No completed projects in {formatMonthLabel(selectedYear, selectedMonth)}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Complete a project and it will show up here along with income breakdowns and rankings.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <IncomeSummary
            totalIncome={totalIncome}
            projectCount={monthProjects.length}
            byType={byType}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <IncomeWaterfallChart byType={byType} />
            <RankedProjectList projects={monthProjects} />
          </div>
        </div>
      )}
    </div>
  );
}
