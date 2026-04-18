import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Session {
  id: string;
  userId: string;
  projectId: string | null;  // null until assigned at clock-out
  startTime: Timestamp;
  endTime: Timestamp | null;
  durationMinutes: number;
  notes: string;
  calendarEventId?: string | null; // Google Calendar event ID (optional)
}

/** Clock in without selecting a project — project is assigned at clock-out. */
export async function clockIn(userId: string) {
  return addDoc(collection(db, "sessions"), {
    userId,
    projectId: null,
    startTime: serverTimestamp(),
    endTime: null,
    durationMinutes: 0,
    notes: "",
    calendarEventId: null,
  });
}

/** Legacy clockOut — for sessions that had a projectId set at clock-in. */
export async function clockOut(
  sessionId: string,
  projectId: string,
  startTime: Timestamp
) {
  const now = Timestamp.now();
  const durationMinutes = (now.toMillis() - startTime.toMillis()) / 60000;

  const batch = writeBatch(db);
  batch.update(doc(db, "sessions", sessionId), {
    endTime: now,
    durationMinutes,
  });
  batch.update(doc(db, "projects", projectId), {
    actualHoursTotal: increment(durationMinutes / 60),
  });
  return batch.commit();
}

/**
 * Assign a project and clock out in one atomic operation.
 * Used by the new Project Tracker flow where project is chosen at clock-out.
 */
export async function assignAndClockOut(
  sessionId: string,
  projectId: string,
  startTime: Timestamp,
  calendarEventId?: string | null
) {
  const now = Timestamp.now();
  const durationMinutes = (now.toMillis() - startTime.toMillis()) / 60000;

  const batch = writeBatch(db);
  batch.update(doc(db, "sessions", sessionId), {
    projectId,
    endTime: now,
    durationMinutes,
    ...(calendarEventId !== undefined ? { calendarEventId } : {}),
  });
  batch.update(doc(db, "projects", projectId), {
    actualHoursTotal: increment(durationMinutes / 60),
  });
  return batch.commit();
}

export async function createManualSession(
  userId: string,
  projectId: string,
  startTime: Date,
  endTime: Date,
  notes: string
) {
  const startTs = Timestamp.fromDate(startTime);
  const endTs = Timestamp.fromDate(endTime);
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

  const sessionRef = doc(collection(db, "sessions"));
  const batch = writeBatch(db);
  batch.set(sessionRef, {
    userId,
    projectId,
    startTime: startTs,
    endTime: endTs,
    durationMinutes,
    notes,
  });
  batch.update(doc(db, "projects", projectId), {
    actualHoursTotal: increment(durationMinutes / 60),
  });
  return batch.commit();
}

export async function updateSession(
  sessionId: string,
  projectId: string,
  oldDurationMinutes: number,
  startTime: Date,
  endTime: Date,
  notes: string
) {
  const startTs = Timestamp.fromDate(startTime);
  const endTs = Timestamp.fromDate(endTime);
  const newDurationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
  const delta = newDurationMinutes - oldDurationMinutes;

  const batch = writeBatch(db);
  batch.update(doc(db, "sessions", sessionId), {
    startTime: startTs,
    endTime: endTs,
    durationMinutes: newDurationMinutes,
    notes,
  });
  if (delta !== 0) {
    batch.update(doc(db, "projects", projectId), {
      actualHoursTotal: increment(delta / 60),
    });
  }
  return batch.commit();
}

export async function deleteSession(
  sessionId: string,
  projectId: string,
  durationMinutes: number
) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "sessions", sessionId));
  batch.update(doc(db, "projects", projectId), {
    actualHoursTotal: increment(-durationMinutes / 60),
  });
  return batch.commit();
}

export function subscribeToActiveSession(
  userId: string,
  callback: (session: Session | null) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, "sessions"),
    where("userId", "==", userId),
    where("endTime", "==", null)
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        callback(null);
      } else {
        const d = snap.docs[0];
        callback({ id: d.id, ...d.data() } as Session);
      }
    },
    onError
  );
}

export function subscribeToUserSessions(
  userId: string,
  callback: (sessions: Session[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, "sessions"),
    where("userId", "==", userId),
    orderBy("startTime", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session));
      callback(sessions);
    },
    onError
  );
}

export function subscribeToProjectSessions(
  projectId: string,
  userId: string,
  callback: (sessions: Session[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, "sessions"),
    where("projectId", "==", projectId),
    where("userId", "==", userId),
    orderBy("startTime", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session));
      callback(sessions);
    },
    onError
  );
}
