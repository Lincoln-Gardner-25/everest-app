"use client";

import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import type { Project } from "@/lib/projects";
import {
  formatCurrencyFull,
  getProjectTypeColor,
} from "@/lib/reflect-utils";

type SortMode = "income" | "iph";

interface RankedProjectListProps {
  projects: Project[];
}

export function RankedProjectList({ projects }: RankedProjectListProps) {
  const [sortBy, setSortBy] = useState<SortMode>("income");

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (sortBy === "iph") {
        const iphA = a.actualHoursTotal > 0 ? a.quotedAmount / a.actualHoursTotal : 0;
        const iphB = b.actualHoursTotal > 0 ? b.quotedAmount / b.actualHoursTotal : 0;
        return iphB - iphA;
      }
      return b.quotedAmount - a.quotedAmount;
    });
  }, [projects, sortBy]);

  if (projects.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Trophy className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3
              className="font-semibold text-foreground"
              style={{ fontFamily: "var(--font-libre-baskerville)" }}
            >
              Project Rankings
            </h3>
            <p className="text-xs text-muted-foreground">
              {projects.length} project{projects.length !== 1 ? "s" : ""} this month
            </p>
          </div>
        </div>

        {/* Sort toggle — segmented control */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5 shrink-0">
          <button
            onClick={() => setSortBy("income")}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              sortBy === "income"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Income
          </button>
          <button
            onClick={() => setSortBy("iph")}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              sortBy === "iph"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            IPH
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((project, idx) => {
          const iph =
            project.actualHoursTotal > 0
              ? project.quotedAmount / project.actualHoursTotal
              : null;

          // Swap what's shown as primary vs secondary based on sort mode
          const primaryValue =
            sortBy === "iph"
              ? iph !== null
                ? `$${Math.round(iph)}/hr`
                : "\u2014"
              : formatCurrencyFull(project.quotedAmount);

          const secondaryValue =
            sortBy === "iph"
              ? formatCurrencyFull(project.quotedAmount)
              : iph !== null
              ? `$${Math.round(iph)}/hr`
              : null;

          return (
            <div
              key={project.id}
              className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3"
            >
              {/* Rank */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold flex-shrink-0">
                {idx + 1}
              </div>

              {/* Name + client */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {project.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {project.clientName}
                </p>
              </div>

              {/* Type badge */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: getProjectTypeColor(project.projectType),
                  }}
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {project.projectType}
                </span>
              </div>

              {/* Primary stat (bold) + secondary stat (muted) */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-foreground">
                  {primaryValue}
                </p>
                {secondaryValue && (
                  <p className="text-xs text-muted-foreground">{secondaryValue}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
