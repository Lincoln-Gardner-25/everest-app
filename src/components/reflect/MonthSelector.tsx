"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonthLabel } from "@/lib/reflect-utils";

interface MonthSelectorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();

  function goBack() {
    if (month === 0) {
      onChange(year - 1, 11);
    } else {
      onChange(year, month - 1);
    }
  }

  function goForward() {
    if (isCurrentMonth) return;
    if (month === 11) {
      onChange(year + 1, 0);
    } else {
      onChange(year, month + 1);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="icon" onClick={goBack} className="h-9 w-9">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span
        className="min-w-[180px] text-center text-lg font-semibold text-foreground"
        style={{ fontFamily: "var(--font-libre-baskerville)" }}
      >
        {formatMonthLabel(year, month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={goForward}
        disabled={isCurrentMonth}
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
