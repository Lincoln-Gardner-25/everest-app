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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Session {
  id: string;
  userId: string;
  projectId: string;
  startTime: Timestamp;
  endTime: Timestamp | null;
  durationMinutes: number;
  notes: string;
}

export async function clockIn(userId: string, projectId: string) {
  return addDoc(collection(db, "sessions"), {
    userId,
    projectId,
    startTime: serverTimestamp(),
    endTime: null,
    durationMinutes: 0,
    notes: "",
  });
}

export async function clockOut(
  sessionId: string,
  projectId: string,
  startTime: Timestamp
) {
  const now = Timestamp.now();
  const durationMinutes = (now.toMillis() - startTime.toMillis()) / 60000;

  await updateDoc(doc(db, "sessions", sessionId), {
    endTime: now,
    durationMinutes,
  });

  await updateDoc(doc(db, "projects", projectId), {
    actualHoursTotal: increment(durationMinutes / 60),
  });
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
