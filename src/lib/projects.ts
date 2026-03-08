import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
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

export async function deleteProject(projectId: string) {
  return deleteDoc(doc(db, "projects", projectId));
}

export function subscribeToProjects(
  userId: string,
  callback: (projects: Project[]) => void
) {
  const q = query(
    collection(db, "projects"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
    callback(projects);
  });
}
