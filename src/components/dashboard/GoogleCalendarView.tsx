"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { type Timestamp } from "firebase/firestore";
import { type Project } from "@/lib/projects";
import { type Session } from "@/lib/sessions";
import { type GoogleCalendarEvent } from "@/lib/googleCalendar";

const PROJECT_COLORS = [
  "#4A6FA5", "#2ABFBF", "#10B981", "#8B5CF6",
  "#F59E0B", "#EC4899", "#06B6D4", "#F97316",
];

function projectColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function toIso(ts: Timestamp) {
  return ts.toDate().toISOString();
}

interface Props {
  localProjects: Project[];
  localSessions: Session[];
  googleEvents: GoogleCalendarEvent[];
}

export function GoogleCalendarView({ localProjects, localSessions, googleEvents }: Props) {
  // Local session events (Everest-tracked)
  const sessionEvents = localSessions
    .filter((s) => s.endTime !== null && s.projectId)
    .map((s) => {
      const project = localProjects.find((p) => p.id === s.projectId);
      const color = projectColor(s.projectId!);
      return {
        id: s.id,
        title: project?.name ?? "Session",
        start: toIso(s.startTime),
        end: toIso(s.endTime as Timestamp),
        backgroundColor: color,
        borderColor: color,
        extendedProps: { source: "everest" },
      };
    });

  // Google Calendar events — deduplicate Everest-created ones
  // (they have "[Everest]" prefix so show them with a distinct style)
  const gcalEvents = googleEvents.map((e) => {
    const isEverest = e.summary?.startsWith("[Everest]");
    return {
      id: `gcal-${e.id}`,
      title: isEverest ? e.summary.replace("[Everest] ", "") : e.summary,
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
      allDay: !e.start.dateTime,
      backgroundColor: isEverest ? "#4A6FA5" : "#6B7280",
      borderColor: isEverest ? "#4A6FA5" : "#6B7280",
      opacity: isEverest ? 1 : 0.6,
      extendedProps: { source: isEverest ? "everest-gcal" : "google" },
    };
  });

  // Deduplicate: if a local session already has a matching gcal event, prefer local
  const localIds = new Set(sessionEvents.map((e) => e.id));
  const filteredGcal = gcalEvents.filter(
    (e) => !localIds.has(e.id.replace("gcal-", ""))
  );

  const events = [...sessionEvents, ...filteredGcal];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4">
        {localProjects.slice(0, 6).map((p) => (
          <div key={p.id} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: projectColor(p.id) }} />
            <span className="text-xs text-muted-foreground">{p.name}</span>
          </div>
        ))}
        {googleEvents.some((e) => !e.summary?.startsWith("[Everest]")) && (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-gray-400" />
            <span className="text-xs text-muted-foreground">Other Google events</span>
          </div>
        )}
      </div>

      <div className="[&_.fc]:font-sans [&_.fc-toolbar-title]:font-semibold [&_.fc-toolbar-title]:text-foreground [&_.fc-button]:rounded-lg [&_.fc-button]:border-border [&_.fc-button]:bg-background [&_.fc-button]:text-foreground [&_.fc-button]:shadow-none [&_.fc-button:hover]:bg-muted [&_.fc-button-primary:not(.fc-button-active)]:bg-background [&_.fc-button-primary:not(.fc-button-active)]:text-foreground [&_.fc-button-active]:bg-primary [&_.fc-button-active]:border-primary [&_.fc-daygrid-day-number]:text-sm [&_.fc-daygrid-day-number]:text-muted-foreground [&_.fc-col-header-cell-cushion]:text-xs [&_.fc-col-header-cell-cushion]:font-semibold [&_.fc-col-header-cell-cushion]:text-muted-foreground [&_.fc-col-header-cell-cushion]:uppercase [&_.fc-col-header-cell-cushion]:tracking-wide [&_.fc-event]:rounded-md [&_.fc-event]:text-xs [&_.fc-event]:font-medium [&_.fc-today-button:disabled]:opacity-40">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          buttonText={{ today: "Today", month: "Month", week: "Week" }}
          events={events}
          height="auto"
          dayMaxEvents={4}
          nowIndicator
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        />
      </div>
    </div>
  );
}
