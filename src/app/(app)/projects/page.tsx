"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeToProjects,
  createProject,
  updateProject,
  completeProject,
  deleteProject,
  createHistoricalProject,
  type Project,
  type ProjectInput,
} from "@/lib/projects";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectReviewDialog } from "@/components/projects/ProjectReviewDialog";
import { PastProjectDialog } from "@/components/projects/PastProjectDialog";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Clock,
  DollarSign,
  MoreHorizontal,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  review: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  review: "In Review",
  completed: "Completed",
};

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function IPHBadge({ quoted, hours }: { quoted: number; hours: number }) {
  if (!hours) return <span className="text-muted-foreground text-sm">—</span>;
  const iph = quoted / hours;
  return (
    <span className="text-sm font-semibold text-foreground">${iph.toFixed(0)}/hr</span>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pastDialogOpen, setPastDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [reviewProject, setReviewProject] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToProjects(user.uid, setProjects);
  }, [user]);

  const active = projects.filter((p) => p.status === "active");
  const review = projects.filter((p) => p.status === "review");
  const completed = projects.filter((p) => p.status === "completed");

  async function handleCreate(data: ProjectInput) {
    if (!user) return;
    await createProject(user.uid, data);
  }

  async function handleLogPast(data: Parameters<typeof createHistoricalProject>[1]) {
    if (!user) return;
    await createHistoricalProject(user.uid, data);
  }

  async function handleEdit(data: ProjectInput) {
    if (!editingProject) return;
    await updateProject(editingProject.id, data);
  }

  function handleComplete(project: Project) {
    setReviewProject(project);
    setMenuOpen(null);
  }

  async function handleConfirmComplete() {
    if (!reviewProject) return;
    await completeProject(reviewProject.id);
    setReviewProject(null);
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setMenuOpen(null);
    try {
      await deleteProject(project.id);
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message.includes("permission")
          ? "Permission denied — make sure Firestore rules are published in the Firebase Console."
          : `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  function openEdit(project: Project) {
    setEditingProject(project);
    setDialogOpen(true);
    setMenuOpen(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingProject(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Projects
          </h1>
          <p className="text-muted-foreground">
            {active.length} active · {completed.length} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPastDialogOpen(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Log past project
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New project
          </Button>
        </div>
      </div>

      {deleteError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive flex-1">{deleteError}</p>
          <button
            onClick={() => setDeleteError(null)}
            className="text-destructive/60 hover:text-destructive text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <DollarSign className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No projects yet</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs">
            Create your first project to start tracking time and income per hour.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New project
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {[
            { label: "Active", items: active },
            { label: "In Review", items: review },
            { label: "Completed", items: completed },
          ].map(
            ({ label, items }) =>
              items.length > 0 && (
                <div key={label}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    {label}
                  </h2>
                  <div className="space-y-3">
                    {items.map((project) => (
                      <div
                        key={project.id}
                        className="relative rounded-xl border bg-card p-5 flex items-center gap-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="w-1 self-stretch rounded-full bg-primary/30 shrink-0" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-foreground truncate">
                              {project.name}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status]}`}
                            >
                              {STATUS_LABELS[project.status]}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {project.clientName} · {project.projectType}
                          </p>
                        </div>

                        <div className="hidden sm:flex items-center gap-6 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-0.5">Quoted</p>
                            <p className="text-sm font-semibold">
                              ${project.quotedAmount.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-0.5">
                              {project.status === "completed" ? "Actual" : "Est."}
                            </p>
                            <div className="flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <p className="text-sm font-semibold">
                                {project.status === "completed"
                                  ? formatHours(project.actualHoursTotal)
                                  : formatHours(project.estimatedHours)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right w-16">
                            <p className="text-xs text-muted-foreground mb-0.5">IPH</p>
                            <IPHBadge
                              quoted={project.quotedAmount}
                              hours={
                                project.status === "completed"
                                  ? project.actualHoursTotal || project.estimatedHours
                                  : project.estimatedHours
                              }
                            />
                          </div>
                        </div>

                        <div className="relative shrink-0">
                          <button
                            onClick={() =>
                              setMenuOpen(menuOpen === project.id ? null : project.id)
                            }
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuOpen === project.id && (
                            <div className="absolute right-0 top-9 z-10 w-44 rounded-lg border bg-card shadow-md py-1">
                              <button
                                onClick={() => openEdit(project)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              {project.status !== "completed" && (
                                <button
                                  onClick={() => handleComplete(project)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-green-700"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Mark complete
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(project)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      )}

      <ProjectFormDialog
        open={dialogOpen}
        onClose={closeDialog}
        onSubmit={editingProject ? handleEdit : handleCreate}
        project={editingProject}
      />

      <PastProjectDialog
        open={pastDialogOpen}
        onClose={() => setPastDialogOpen(false)}
        onSubmit={handleLogPast}
      />

      <ProjectReviewDialog
        project={reviewProject}
        open={!!reviewProject}
        onClose={() => setReviewProject(null)}
        onConfirm={handleConfirmComplete}
      />

      {menuOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  );
}
