"use client";

import { type Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function formatHours(h: number) {
  if (h === 0) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function getNarrative(
  projectedIph: number,
  actualIph: number | null,
  estimatedHours: number,
  actualHours: number
): { heading: string; body: string; sentiment: "positive" | "neutral" | "negative" } {
  if (actualHours === 0) {
    return {
      heading: "No time logged",
      body: "You didn't log any sessions for this project. Clock in next time to track your real IPH.",
      sentiment: "neutral",
    };
  }

  const iphDiff = actualIph! - projectedIph;
  const hoursDiff = actualHours - estimatedHours;
  const iphPct = Math.abs(iphDiff / projectedIph);

  if (iphDiff >= 0 && iphPct < 0.05) {
    return {
      heading: "Right on target",
      body: `You finished in ${formatHours(actualHours)} against an estimate of ${formatHours(estimatedHours)}. Your IPH landed exactly where you projected — great scoping.`,
      sentiment: "neutral",
    };
  }

  if (iphDiff > 0) {
    const extra = hoursDiff < 0 ? `You saved ${formatHours(Math.abs(hoursDiff))} vs. your estimate.` : "";
    return {
      heading: "Better than projected",
      body: `Your actual IPH of $${Math.round(actualIph!)}/hr beat your projected $${Math.round(projectedIph)}/hr. ${extra} That's ${Math.round(iphPct * 100)}% above projection — worth noting for future quotes.`.trim(),
      sentiment: "positive",
    };
  }

  // iphDiff < 0
  const over = hoursDiff > 0 ? `This project ran ${formatHours(hoursDiff)} over estimate.` : "";
  return {
    heading: "Below projection",
    body: `Your actual IPH of $${Math.round(actualIph!)}/hr came in below the projected $${Math.round(projectedIph)}/hr. ${over} Consider tightening your time estimate or adjusting your rate on similar projects.`.trim(),
    sentiment: "negative",
  };
}

const SENTIMENT_STYLES = {
  positive: {
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
    headingColor: "text-green-700",
  },
  neutral: {
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    headingColor: "text-foreground",
  },
  negative: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    headingColor: "text-amber-700",
  },
};

const SENTIMENT_ICONS = {
  positive: TrendingUp,
  neutral: Minus,
  negative: TrendingDown,
};

export function ProjectReviewDialog({ project, open, onClose, onConfirm }: Props) {
  if (!project) return null;

  const estimatedHours = project.estimatedHours;
  const actualHours = project.actualHoursTotal ?? 0;
  const projectedIph = estimatedHours > 0 ? project.quotedAmount / estimatedHours : 0;
  const actualIph = actualHours > 0 ? project.quotedAmount / actualHours : null;

  const hoursDiff = actualHours - estimatedHours;
  const hoursDiffPct = estimatedHours > 0 ? hoursDiff / estimatedHours : 0;

  const narrative = getNarrative(projectedIph, actualIph, estimatedHours, actualHours);
  const styles = SENTIMENT_STYLES[narrative.sentiment];
  const SentimentIcon = SENTIMENT_ICONS[narrative.sentiment];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-xl"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Project Review
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {project.name} · {project.clientName}
          </p>
        </DialogHeader>

        {/* Stats comparison */}
        <div className="grid grid-cols-2 gap-3 my-2">
          {/* Hours */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Hours
              </span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Estimated</p>
                <p className="text-lg font-bold text-foreground">{formatHours(estimatedHours)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Actual</p>
                <p
                  className="text-lg font-bold"
                  style={{
                    color:
                      actualHours === 0
                        ? "oklch(0.55 0.02 264)"
                        : hoursDiff <= 0
                        ? "oklch(0.70 0.16 162)"
                        : hoursDiffPct > 0.2
                        ? "oklch(0.76 0.18 72)"
                        : "oklch(0.22 0.02 264)",
                  }}
                >
                  {actualHours === 0 ? "—" : formatHours(actualHours)}
                </p>
              </div>
            </div>
            {actualHours > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {hoursDiff < 0
                  ? `${formatHours(Math.abs(hoursDiff))} under`
                  : hoursDiff > 0
                  ? `${formatHours(hoursDiff)} over`
                  : "Exact estimate"}
              </p>
            )}
          </div>

          {/* IPH */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                IPH
              </span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Projected</p>
                <p className="text-lg font-bold text-foreground">
                  {projectedIph > 0 ? `$${Math.round(projectedIph)}/hr` : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Actual</p>
                <p
                  className="text-lg font-bold"
                  style={{
                    color:
                      actualIph === null
                        ? "oklch(0.55 0.02 264)"
                        : actualIph >= projectedIph
                        ? "oklch(0.70 0.16 162)"
                        : "oklch(0.76 0.18 72)",
                  }}
                >
                  {actualIph !== null ? `$${Math.round(actualIph)}/hr` : "—"}
                </p>
              </div>
            </div>
            {actualIph !== null && projectedIph > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {actualIph >= projectedIph
                  ? `+$${Math.round(actualIph - projectedIph)}/hr vs. projection`
                  : `-$${Math.round(projectedIph - actualIph)}/hr vs. projection`}
              </p>
            )}
          </div>
        </div>

        {/* Narrative insight */}
        <div className={`rounded-xl border p-4 ${styles.iconBg} border-transparent`}>
          <div className="flex items-start gap-3">
            <div className={`h-7 w-7 rounded-full bg-white/60 flex items-center justify-center shrink-0 mt-0.5`}>
              <SentimentIcon className={`h-3.5 w-3.5 ${styles.iconColor}`} />
            </div>
            <div>
              <p className={`text-sm font-semibold mb-1 ${styles.headingColor}`}>
                {narrative.heading}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{narrative.body}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>
            Keep editing
          </Button>
          <Button onClick={onConfirm} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Complete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
