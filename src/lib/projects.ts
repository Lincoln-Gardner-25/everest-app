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
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ProjectStatus = "active" | "review" | "completed";

export interface Project {
  id: string;
  userId: string;
  name: string;
  clientName: string;
  projectType: string;
  quotedAmount: number;
  estimatedHours: number;
  actualHoursTotal: number;
  status: ProjectStatus;
  notes: string;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  dueDate?: Timestamp | null;
  gmailMessageId?: string;
  gmailThreadId?: string;
}

export type ProjectInput = Omit<Project, "id" | "userId" | "actualHoursTotal" | "createdAt" | "completedAt">;

export async function createProject(userId: string, data: ProjectInput) {
  return addDoc(collection(db, "projects"), {
    ...data,
    userId,
    actualHoursTotal: 0,
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

export async function updateProject(projectId: string, data: Partial<ProjectInput>) {
  return updateDoc(doc(db, "projects", projectId), data);
}

export async function completeProject(projectId: string) {
  return updateDoc(doc(db, "projects", projectId), {
    status: "completed",
    completedAt: serverTimestamp(),
  });
}

/** Update only the completedAt date — used when the user corrects which month a project belongs to. */
export async function updateProjectCompletedAt(projectId: string, date: Date) {
  return updateDoc(doc(db, "projects", projectId), {
    completedAt: Timestamp.fromDate(date),
  });
}

export async function deleteProject(projectId: string, userId: string) {
  // Delete all sessions for this project + user, then the project itself, in one batch
  const sessionsSnap = await getDocs(
    query(
      collection(db, "sessions"),
      where("projectId", "==", projectId),
      where("userId", "==", userId)
    )
  );
  const batch = writeBatch(db);
  sessionsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "projects", projectId));
  return batch.commit();
}

export async function createHistoricalProject(
  userId: string,
  data: {
    name: string;
    clientName: string;
    projectType: string;
    quotedAmount: number;
    actualHours: number;
    completedAt: Date;
    notes: string;
  }
) {
  return addDoc(collection(db, "projects"), {
    userId,
    name: data.name,
    clientName: data.clientName,
    projectType: data.projectType,
    quotedAmount: data.quotedAmount,
    estimatedHours: data.actualHours,
    actualHoursTotal: data.actualHours,
    status: "completed",
    notes: data.notes,
    createdAt: serverTimestamp(),
    completedAt: Timestamp.fromDate(data.completedAt),
  });
}

export function subscribeToProjects(
  userId: string,
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, "projects"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      callback(projects);
    },
    onError
  );
}
