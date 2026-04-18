"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { subscribeToProjects, type Project } from "@/lib/projects";
import { subscribeToUserSessions, type Session } from "@/lib/sessions";
import { getCalendarEvents, type GoogleCalendarEvent } from "@/lib/googleCalendar";
import { CalendarDays, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Dynamically import FullCalendar to avoid SSR issues
const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView").then((m) => m.CalendarView),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> }
);

// Minimal FullCalendar for Google Calendar events only
const GoogleCalView = dynamic(
  () => import("./GoogleCalendarView").then((m) => m.GoogleCalendarView),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> }
);

export function DashboardCalendar() {
  const { user, calendarAccessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingGCal, setLoadingGCal] = useState(false);
  const [gcalError, setGcalError] = useState<string | null>(null);

  // Subscribe to local data
  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserSessions(user.uid, setSessions);
  }, [user]);

  // Fetch Google Calendar events when token is available
  useEffect(() => {
    if (!calendarAccessToken) {
      setGoogleEvents([]);
      return;
    }
    setLoadingGCal(true);
    setGcalError(null);
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    const end = new Date();
    end.setMonth(end.getMonth() + 2);

    getCalendarEvents(calendarAccessToken, start, end)
      .then((events) => setGoogleEvents(events))
      .catch((err) => {
        console.error("Google Calendar fetch error:", err);
        setGcalError("Could not load Google Calendar events. Try reconnecting in Settings.");
      })
      .finally(() => setLoadingGCal(false));
  }, [calendarAccessToken]);

  // Stats
  const completedSessions = useMemo(() => sessions.filter((s) => s.endTime !== null), [sessions]);
  const totalHours = useMemo(
    () => completedSessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0) / 60, 0),
    [completedSessions]
  );

  return (
    <div className="rounded-2xl border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Calendar</h2>
            <p className="text-xs text-muted-foreground">
              {completedSessions.length} sessions · {totalHours.toFixed(1)}h logged
            </p>
          </div>
        </div>

        {!calendarAccessToken && (
          <Link href="/settings">
            <Button size="sm" variant="outline">
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Connect Google Calendar
            </Button>
          </Link>
        )}
        {calendarAccessToken && (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
            Google Calendar synced
          </span>
        )}
      </div>

      {gcalError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700 mb-4">
          {gcalError}
        </div>
      )}

      {loadingGCal && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your Google Calendar...
        </div>
      )}

      {/* Calendar display */}
      {calendarAccessToken && !loadingGCal ? (
        <GoogleCalView
          localProjects={projects}
          localSessions={sessions}
          googleEvents={googleEvents}
        />
      ) : (
        <CalendarView projects={projects} sessions={sessions} />
      )}
    </div>
  );
}
