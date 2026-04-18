/**
 * Google Calendar API service for Everest.
 *
 * All functions take a short-lived OAuth access token with the
 * `https://www.googleapis.com/auth/calendar` scope.
 *
 * Events are written to the user's primary Google Calendar.
 */

const BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  htmlLink?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────

async function calendarFetch(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error ${res.status}: ${text}`);
  }

  // 204 No Content (DELETE)
  if (res.status === 204) return null;
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Creates an all-day event on the day a project is created.
 * Returns the created event ID (store on the project for later updates).
 */
export async function createProjectEvent(
  token: string,
  project: { name: string; clientName?: string; projectType?: string; quotedAmount: number }
): Promise<string> {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const description = [
    project.clientName ? `Client: ${project.clientName}` : null,
    project.projectType ? `Type: ${project.projectType}` : null,
    `Quoted: $${project.quotedAmount.toLocaleString()}`,
    "",
    "Created via Everest",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    summary: `[Everest] ${project.name}`,
    description,
    start: { date: today },
    end: { date: today },
    colorId: "9", // blueberry
  };

  const data = (await calendarFetch(BASE_URL, token, {
    method: "POST",
    body: JSON.stringify(body),
  })) as GoogleCalendarEvent;

  return data.id;
}

/**
 * Creates a timed event when a user clocks in.
 * Returns the event ID so it can be updated when they clock out.
 */
export async function createClockInEvent(
  token: string,
  sessionId: string,
  projectName: string,
  startTime: Date
): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1h placeholder

  const body = {
    summary: `[Everest] ${projectName} — Working`,
    description: `Session ID: ${sessionId}\nTracked via Everest`,
    start: { dateTime: startTime.toISOString(), timeZone },
    end: { dateTime: endTime.toISOString(), timeZone },
    colorId: "7", // peacock
  };

  const data = (await calendarFetch(BASE_URL, token, {
    method: "POST",
    body: JSON.stringify(body),
  })) as GoogleCalendarEvent;

  return data.id;
}

/**
 * Updates a clock-in event with the actual end time and duration once the
 * user clocks out.
 */
export async function finalizeClockOutEvent(
  token: string,
  eventId: string,
  projectName: string,
  startTime: Date,
  endTime: Date,
  durationMinutes: number
): Promise<void> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hours = Math.floor(durationMinutes / 60);
  const mins = Math.round(durationMinutes % 60);
  const durationLabel =
    hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim() : `${mins}m`;
  const iph = durationMinutes > 0 ? null : null; // IPH not available at this point

  const body = {
    summary: `[Everest] ${projectName} — ${durationLabel}`,
    description: `Duration: ${durationLabel}${iph ? `\nIPH: $${iph}/hr` : ""}\nTracked via Everest`,
    start: { dateTime: startTime.toISOString(), timeZone },
    end: { dateTime: endTime.toISOString(), timeZone },
    colorId: "2", // sage
  };

  await calendarFetch(`${BASE_URL}/${eventId}`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Fetches events from the user's primary calendar within a date range.
 * Returns them sorted by start time ascending.
 */
export async function getCalendarEvents(
  token: string,
  startDate: Date,
  endDate: Date
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const data = (await calendarFetch(`${BASE_URL}?${params}`, token)) as {
    items: GoogleCalendarEvent[];
  };

  return data.items ?? [];
}

/**
 * Deletes a calendar event. Safe to call even if the event doesn't exist
 * (errors are swallowed).
 */
export async function deleteCalendarEvent(
  token: string,
  eventId: string
): Promise<void> {
  try {
    await calendarFetch(`${BASE_URL}/${eventId}`, token, { method: "DELETE" });
  } catch (err) {
    console.warn("Could not delete calendar event:", err);
  }
}
