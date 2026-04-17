"use client";

import { DollarSign } from "lucide-react";
import {
  formatCurrencyFull,
  getProjectTypeColor,
  type TypeGroup,
} from "@/lib/reflect-utils";

interface IncomeSummaryProps {
  totalIncome: number;
  projectCount: number;
  byType: TypeGroup[];
}

export function IncomeSummary({
  totalIncome,
  projectCount,
  byType,
}: IncomeSummaryProps) {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <DollarSign className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p
            className="text-3xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            {formatCurrencyFull(totalIncome)}
          </p>
          <p className="text-sm text-muted-foreground">
            from {projectCount} completed project{projectCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {byType.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {byType.map(({ type, total, count }) => (
            <div
              key={type}
              className="flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5"
            >
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getProjectTypeColor(type) }}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrencyFull(total)} &middot; {count}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
