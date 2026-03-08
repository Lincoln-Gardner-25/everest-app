"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import { subscribeToUserSessions, type Session } from "@/lib/sessions";

// Dynamically imported to avoid SSR issues with FullCalendar's browser APIs
const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView").then((m) => m.CalendarView),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border bg-card h-[600px] animate-pulse" />
    ),
  }
);

export default function CalendarPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserSessions(user.uid, setSessions);
  }, [user]);

  const completedSessions = sessions.filter((s) => s.endTime !== null);
  const totalHours = completedSessions.reduce((sum, s) => sum + s.durationMinutes / 60, 0);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Calendar
          </h1>
          <p className="text-muted-foreground">
            Your sessions and completed projects by month.
          </p>
        </div>

        {/* Quick stats */}
        {completedSessions.length > 0 && (
          <div className="flex gap-5 shrink-0 pt-1">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total sessions</p>
              <p className="text-sm font-semibold text-foreground">
                {completedSessions.length}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total hours</p>
              <p className="text-sm font-semibold text-foreground">
                {totalHours.toFixed(1)}h
              </p>
            </div>
          </div>
        )}
      </div>

      <CalendarView projects={projects} sessions={sessions} />
    </div>
  );
}
