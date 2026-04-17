import type { Project } from "@/lib/projects";

// ── Project type colors (hex for SVG/Recharts compatibility) ────────
export const PROJECT_TYPE_COLORS: Record<string, string> = {
  Wedding: "#4A6FA5",
  "Corporate / Brand": "#2ABFBF",
  "Short-form / Social": "#F59E0B",
  Documentary: "#10B981",
  Events: "#8B5CF6",
  "Music Videos": "#EF4444",
  "Real Estate": "#6B9BD2",
  Other: "#9CA3AF",
};

const DEFAULT_COLOR = "#9CA3AF";

export function getProjectTypeColor(type: string): string {
  return PROJECT_TYPE_COLORS[type] ?? DEFAULT_COLOR;
}

// ── Month range helpers ─────────────────────────────────────────────
export function getMonthRange(year: number, month: number): { start: number; end: number } {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return { start, end };
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// ── Filtering ───────────────────────────────────────────────────────
export function filterProjectsByMonth(
  projects: Project[],
  year: number,
  month: number
): Project[] {
  const { start, end } = getMonthRange(year, month);
  return projects.filter((p) => {
    if (p.status !== "completed" || !p.completedAt) return false;
    const ts = p.completedAt.toMillis ? p.completedAt.toMillis() : 0;
    return ts >= start && ts < end;
  });
}

// ── Grouping by project type ────────────────────────────────────────
export interface TypeGroup {
  type: string;
  total: number;
  count: number;
  hours: number;
}

export function groupByProjectType(projects: Project[]): TypeGroup[] {
  const map = new Map<string, TypeGroup>();

  for (const p of projects) {
    const existing = map.get(p.projectType);
    if (existing) {
      existing.total += p.quotedAmount;
      existing.count += 1;
      existing.hours += p.actualHoursTotal;
    } else {
      map.set(p.projectType, {
        type: p.projectType,
        total: p.quotedAmount,
        count: 1,
        hours: p.actualHoursTotal,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ── Formatting ──────────────────────────────────────────────────────
export function formatCurrency(n: number): string {
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatCurrencyFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
