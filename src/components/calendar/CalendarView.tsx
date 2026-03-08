"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { type Timestamp } from "firebase/firestore";
import { type Project } from "@/lib/projects";
import { type Session } from "@/lib/sessions";

// Brand-aligned project color palette
const PROJECT_COLORS = [
  "#4A6FA5", // slate blue (primary)
  "#2ABFBF", // teal (secondary)
  "#10B981", // green (success)
  "#8B5CF6", // purple
  "#F59E0B", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

function toIso(ts: Timestamp) {
  return ts.toDate().toISOString();
}

function toDateStr(ts: Timestamp) {
  return ts.toDate().toISOString().split("T")[0];
}

interface Props {
  projects: Project[];
  sessions: Session[];
}

export function CalendarView({ projects, sessions }: Props) {
  // Stable color map keyed by project id
  const colorMap = new Map<string, string>();
  projects.forEach((p, i) => {
    colorMap.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]);
  });

  // Completed session events — shown as time blocks in week view
  const sessionEvents = sessions
    .filter((s) => s.endTime !== null)
    .map((s) => {
      const project = projects.find((p) => p.id === s.projectId);
      const color = colorMap.get(s.projectId) ?? PROJECT_COLORS[0];
      const hours = s.durationMinutes / 60;
      return {
        id: s.id,
        title: project?.name ?? "Session",
        start: toIso(s.startTime),
        end: toIso(s.endTime as Timestamp),
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
          type: "session",
          hours: hours.toFixed(1),
        },
      };
    });

  // Project completion events — all-day badges in month view
  const completionEvents = projects
    .filter((p) => p.status === "completed" && p.completedAt)
    .map((p) => {
      const color = colorMap.get(p.id) ?? PROJECT_COLORS[0];
      return {
        id: `complete-${p.id}`,
        title: `${p.name}  ·  $${p.quotedAmount.toLocaleString()}`,
        start: toDateStr(p.completedAt as Timestamp),
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { type: "completion" },
      };
    });

  const events = [...completionEvents, ...sessionEvents];

  return (
    <div>
      {/* Legend */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5">
          {projects.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
              />
              <span className="text-sm text-muted-foreground">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar */}
      <div className="rounded-2xl border bg-card p-4 [&_.fc]:font-sans [&_.fc-toolbar-title]:font-semibold [&_.fc-toolbar-title]:text-foreground [&_.fc-button]:rounded-lg [&_.fc-button]:border-border [&_.fc-button]:bg-background [&_.fc-button]:text-foreground [&_.fc-button]:shadow-none [&_.fc-button:hover]:bg-muted [&_.fc-button-primary:not(.fc-button-active)]:bg-background [&_.fc-button-primary:not(.fc-button-active)]:text-foreground [&_.fc-button-active]:bg-primary [&_.fc-button-active]:border-primary [&_.fc-daygrid-day-number]:text-sm [&_.fc-daygrid-day-number]:text-muted-foreground [&_.fc-col-header-cell-cushion]:text-xs [&_.fc-col-header-cell-cushion]:font-semibold [&_.fc-col-header-cell-cushion]:text-muted-foreground [&_.fc-col-header-cell-cushion]:uppercase [&_.fc-col-header-cell-cushion]:tracking-wide [&_.fc-event]:rounded-md [&_.fc-event]:text-xs [&_.fc-event]:font-medium [&_.fc-event-title]:truncate [&_.fc-daygrid-dot-event]:gap-1 [&_.fc-today-button:disabled]:opacity-40">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          buttonText={{
            today: "Today",
            month: "Month",
            week: "Week",
          }}
          events={events}
          height="auto"
          dayMaxEvents={4}
          nowIndicator
          eventTimeFormat={{
            hour: "numeric",
            minute: "2-digit",
            meridiem: "short",
          }}
        />
      </div>
    </div>
  );
}
