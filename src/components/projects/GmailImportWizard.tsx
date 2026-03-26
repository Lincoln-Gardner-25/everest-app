"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, DollarSign, Clock, Mail, User, TrendingUp } from "lucide-react";
import type { GmailContractEmail } from "@/lib/gmail";
import { markEmailsAsImported } from "@/lib/gmail";
import { createProject, type ProjectInput, type Project } from "@/lib/projects";

interface Props {
  emails: GmailContractEmail[];
  userId: string;
  /** Completed projects used for smart estimate hints */
  completedProjects: Project[];
  onImported: () => void;
}

interface CardState {
  name: string;
  clientName: string;
  quotedAmount: string;
  estimatedHours: string;
  importing: boolean;
  done: boolean;
}

/** Find similar past projects and return average hours + IPH */
function getSmartEstimate(
  projectName: string,
  completedProjects: Project[]
): { avgHours: number; avgIph: number; count: number } | null {
  if (completedProjects.length === 0) return null;

  // Look for projects with overlapping words in the name
  const words = projectName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3); // skip short words like "of", "the"

  if (words.length === 0) return null;

  const similar = completedProjects.filter((p) => {
    const pName = p.name.toLowerCase();
    return words.some((w) => pName.includes(w));
  });

  if (similar.length === 0) return null;

  const withHours = similar.filter((p) => p.actualHoursTotal > 0);
  if (withHours.length === 0) return null;

  const avgHours =
    withHours.reduce((sum, p) => sum + p.actualHoursTotal, 0) / withHours.length;
  const totalEarned = withHours.reduce((sum, p) => sum + p.quotedAmount, 0);
  const totalHrs = withHours.reduce((sum, p) => sum + p.actualHoursTotal, 0);
  const avgIph = totalHrs > 0 ? totalEarned / totalHrs : 0;

  return { avgHours: Math.round(avgHours * 10) / 10, avgIph: Math.round(avgIph), count: withHours.length };
}

export function GmailImportCards({ emails, userId, completedProjects, onImported }: Props) {
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const initial: Record<string, CardState> = {};
    for (const email of emails) {
      initial[email.id] = {
        name: email.suggestedProjectName,
        clientName: email.suggestedClientName,
        quotedAmount: email.suggestedAmount ? String(email.suggestedAmount) : "",
        estimatedHours: "",
        importing: false,
        done: false,
      };
    }
    return initial;
  });

  function updateCard(id: string, patch: Partial<CardState>) {
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleImport(email: GmailContractEmail) {
    const card = cards[email.id];
    if (!card.name || !card.quotedAmount || !card.estimatedHours) return;

    updateCard(email.id, { importing: true });

    try {
      const projectData: ProjectInput = {
        name: card.name,
        clientName: card.clientName,
        projectType: "",
        quotedAmount: parseFloat(card.quotedAmount) || 0,
        estimatedHours: parseFloat(card.estimatedHours) || 0,
        status: "active",
        notes: "",
        gmailMessageId: email.id,
        gmailThreadId: email.threadId,
      };

      await createProject(userId, projectData);
      await markEmailsAsImported(userId, [email.id]);
      updateCard(email.id, { importing: false, done: true });

      const updated = { ...cards, [email.id]: { ...cards[email.id], done: true } };
      const allDone = emails.every((e) => updated[e.id]?.done);
      if (allDone) setTimeout(onImported, 600);
    } catch {
      updateCard(email.id, { importing: false });
    }
  }

  async function handleDismiss(emailId: string) {
    await markEmailsAsImported(userId, [emailId]);
    updateCard(emailId, { done: true });

    const updated = { ...cards, [emailId]: { ...cards[emailId], done: true } };
    const allDone = emails.every((e) => updated[e.id]?.done);
    if (allDone) setTimeout(onImported, 300);
  }

  const visibleEmails = emails.filter((e) => !cards[e.id]?.done);

  if (visibleEmails.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {visibleEmails.length} new signed contract{visibleEmails.length !== 1 ? "s" : ""} detected
        </p>
      </div>

      {visibleEmails.map((email) => {
        const card = cards[email.id];
        const canImport =
          card.name.trim() !== "" &&
          card.clientName.trim() !== "" &&
          card.quotedAmount !== "" &&
          card.estimatedHours !== "" &&
          parseFloat(card.estimatedHours) > 0;

        const hint = getSmartEstimate(card.name, completedProjects);

        return (
          <div
            key={email.id}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            {/* Header — subject + dismiss */}
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate italic">
                  &ldquo;{email.subject}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {email.date}
                </p>
              </div>
              <button
                onClick={() => handleDismiss(email.id)}
                className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Fields — 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Project Name
                </label>
                <Input
                  value={card.name}
                  onChange={(e) =>
                    updateCard(email.id, { name: e.target.value })
                  }
                  placeholder="Concert Film"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Client Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={card.clientName}
                    onChange={(e) =>
                      updateCard(email.id, { clientName: e.target.value })
                    }
                    placeholder="Premiere Dance"
                    className="h-9 text-sm pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Quoted Amount
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={card.quotedAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) {
                        updateCard(email.id, { quotedAmount: v });
                      }
                    }}
                    placeholder="1500"
                    inputMode="decimal"
                    className="h-9 text-sm pl-7"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Estimated Hours
                </label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={card.estimatedHours}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) {
                        updateCard(email.id, { estimatedHours: v });
                      }
                    }}
                    placeholder="8"
                    inputMode="decimal"
                    className="h-9 text-sm pl-7"
                  />
                </div>
              </div>
            </div>

            {/* Smart estimate hint */}
            {hint && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 shrink-0" style={{ color: "oklch(0.73 0.11 192)" }} />
                <span>
                  Similar projects took <span className="font-medium text-foreground">{hint.avgHours}h</span> avg
                  {hint.avgIph > 0 && (
                    <> at <span className="font-medium text-foreground">${hint.avgIph}/hr</span></>
                  )}
                  {" "}({hint.count} past project{hint.count !== 1 ? "s" : ""})
                </span>
              </div>
            )}

            {/* Import button */}
            <div className="flex justify-end mt-3">
              <Button
                size="sm"
                onClick={() => handleImport(email)}
                disabled={!canImport || card.importing}
              >
                {card.importing ? (
                  "Adding..."
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Add to Everest
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
