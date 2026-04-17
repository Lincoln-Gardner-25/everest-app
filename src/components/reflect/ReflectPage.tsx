"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import {
  filterProjectsByMonth,
  groupByProjectType,
} from "@/lib/reflect-utils";
import { MonthSelector } from "./MonthSelector";
import { IncomeSummary } from "./IncomeSummary";
import { IncomeWaterfallChart } from "./IncomeWaterfallChart";
import { RankedProjectList } from "./RankedProjectList";
import { CalendarX2, Loader2 } from "lucide-react";
import { formatMonthLabel } from "@/lib/reflect-utils";

export function ReflectPage() {
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return subscribeToProjects(
      user.uid,
      (p) => {
        setProjects(p);
        setLoading(false);
      },
      (err) => {
        console.error("Reflect subscribeToProjects error:", err);
        setLoading(false);
      }
    );
  }, [user]);

  const monthProjects = useMemo(
    () =>
      filterProjectsByMonth(projects, selectedYear, selectedMonth).sort(
        (a, b) => b.quotedAmount - a.quotedAmount
      ),
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

  function handleMonthChange(year: number, month: number) {
    setSelectedYear(year);
    setSelectedMonth(month);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Reflect
          </h1>
          <p className="text-sm text-muted-foreground">
            Review your income and project performance
          </p>
        </div>
        <MonthSelector
          year={selectedYear}
          month={selectedMonth}
          onChange={handleMonthChange}
        />
      </div>

      {/* Content */}
      {monthProjects.length === 0 ? (
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
            Your next great project could be the first. Complete a project and
            it will show up here.
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
