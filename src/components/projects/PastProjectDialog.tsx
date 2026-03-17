"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROJECT_TYPES = [
  "Wedding",
  "Corporate / Brand",
  "Short-form / Social",
  "Documentary",
  "Events",
  "Music Videos",
  "Real Estate",
  "Other",
];

interface PastProjectData {
  name: string;
  clientName: string;
  projectType: string;
  quotedAmount: number;
  actualHours: number;
  completedAt: Date;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PastProjectData) => Promise<void>;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

export function PastProjectDialog({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectType, setProjectType] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const parsedAmount = parseFloat(amount) || 0;
  const parsedHours = parseFloat(hours) || 0;
  const iph = parsedAmount > 0 && parsedHours > 0 ? parsedAmount / parsedHours : null;

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
  }

  function handleHoursChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setHours(v);
  }

  function reset() {
    setName("");
    setClientName("");
    setProjectType("");
    setAmount("");
    setHours("");
    setDate(today());
    setNotes("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  const isValid = name.trim() && projectType && parsedAmount > 0 && parsedHours > 0 && date;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setError("");
    try {
      // Parse date at noon local time to avoid timezone-off-by-one
      const [year, month, day] = date.split("-").map(Number);
      const completedAt = new Date(year, month - 1, day, 12, 0, 0);
      await onSubmit({
        name: name.trim(),
        clientName: clientName.trim(),
        projectType,
        quotedAmount: parsedAmount,
        actualHours: parsedHours,
        completedAt,
        notes: notes.trim(),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-libre-baskerville)" }}>
            Log past project
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="hp-name">Project name</Label>
            <Input
              id="hp-name"
              placeholder="Brand video for Acme Co."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Client */}
            <div className="space-y-1.5">
              <Label htmlFor="hp-client">Client <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="hp-client"
                placeholder="Acme Co."
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount paid */}
            <div className="space-y-1.5">
              <Label htmlFor="hp-amount">Amount paid</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                <Input
                  id="hp-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="1500"
                  value={amount}
                  onChange={handleAmountChange}
                  className="pl-7"
                />
              </div>
            </div>

            {/* Hours worked */}
            <div className="space-y-1.5">
              <Label htmlFor="hp-hours">Hours worked</Label>
              <Input
                id="hp-hours"
                type="text"
                inputMode="decimal"
                placeholder="8"
                value={hours}
                onChange={handleHoursChange}
              />
            </div>
          </div>

          {/* Date completed */}
          <div className="space-y-1.5">
            <Label htmlFor="hp-date">Date completed</Label>
            <Input
              id="hp-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="hp-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="hp-notes"
              placeholder="Deliverables, client feedback, anything worth remembering..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Live IPH preview */}
          {iph !== null && (
            <div className="rounded-lg bg-muted px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Income per hour</span>
              <span className="font-semibold text-foreground">${iph.toFixed(0)}/hr</span>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || submitting}>
              {submitting ? "Saving…" : "Log project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
