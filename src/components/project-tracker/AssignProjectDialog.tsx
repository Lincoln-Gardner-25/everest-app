"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, FolderOpen } from "lucide-react";
import type { Project } from "@/lib/projects";

interface AssignProjectDialogProps {
  open: boolean;
  elapsedSeconds: number;
  projects: Project[];
  onConfirm: (projectId: string) => Promise<void>;
  onCancel: () => void;
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function AssignProjectDialog({
  open,
  elapsedSeconds,
  projects,
  onConfirm,
  onCancel,
}: AssignProjectDialogProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      await onConfirm(selectedProjectId);
      setSelectedProjectId("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <h2
            className="text-xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Nice work!
          </h2>
          <p className="text-sm text-muted-foreground">
            You worked for{" "}
            <span className="font-semibold text-foreground">
              {formatElapsed(elapsedSeconds)}
            </span>
            . Which project should this time go towards?
          </p>
        </div>

        {/* Project selector */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
            Assign to Project
          </label>
          {projects.length === 0 ? (
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <FolderOpen className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-sm text-muted-foreground">
                No active projects. Create one first.
              </p>
            </div>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.clientName ? ` — ${p.clientName}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={saving}
            className="flex-1"
          >
            Keep Running
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !selectedProjectId}
            className="flex-1"
          >
            {saving ? "Saving..." : "Log Time"}
          </Button>
        </div>
      </div>
    </div>
  );
}
