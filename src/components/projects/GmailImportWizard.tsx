"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  ChevronRight,
  Check,
  SkipForward,
  Layers,
  DollarSign,
} from "lucide-react";
import type { GmailContractEmail } from "@/lib/gmail";
import { markEmailsAsImported } from "@/lib/gmail";
import { createProject, type ProjectInput } from "@/lib/projects";

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

const schema = z.object({
  name: z.string().min(1, "Project name is required"),
  clientName: z.string().min(1, "Client name is required"),
  projectType: z.string().min(1, "Select a project type"),
  quotedAmount: z.number().min(0, "Enter a valid amount"),
  estimatedHours: z.number().min(0.1, "Enter estimated hours"),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  emails: GmailContractEmail[];
  userId: string;
}

export function GmailImportWizard({ open, onClose, emails, userId }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  const currentEmail = emails[currentIndex];
  const totalCards = emails.length;
  const processedCount = importedIds.length + skippedIds.length;
  const isLastCard = currentIndex === totalCards - 1;
  const allDone = processedCount === totalCards;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      clientName: "",
      projectType: "",
      quotedAmount: 0,
      estimatedHours: 0,
      notes: "",
    },
  });

  // Reset form when navigating to a new card — pre-fill extracted amount
  useEffect(() => {
    if (currentEmail) {
      form.reset({
        name: currentEmail.suggestedProjectName,
        clientName: currentEmail.suggestedClientName,
        projectType: "",
        quotedAmount: currentEmail.suggestedQuotedAmount ?? 0,
        estimatedHours: 0,
        notes: `Imported from email: "${currentEmail.subject}"`,
      });
    }
  }, [currentIndex, currentEmail, form]);

  async function handleImport(values: FormValues) {
    const projectData: ProjectInput = {
      ...values,
      status: "active",
    };
    await createProject(userId, projectData);
    setImportedIds((prev) => [...prev, currentEmail.id]);

    if (!isLastCard) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleSkip() {
    setSkippedIds((prev) => [...prev, currentEmail.id]);
    if (!isLastCard) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleFinish() {
    // Mark all processed emails (imported + skipped) so they don't appear again
    markEmailsAsImported([...importedIds, ...skippedIds]);
    onClose();
  }

  if (!currentEmail && !allDone) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleFinish()}>
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle
              className="flex items-center gap-2"
              style={{ fontFamily: "var(--font-libre-baskerville)" }}
            >
              <Mail className="h-5 w-5 text-primary" />
              Import from Gmail
            </DialogTitle>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {processedCount + 1} of {totalCards}
            </Badge>
          </div>
        </DialogHeader>

        {/* Completion screen */}
        {allDone ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">All caught up</p>
              <p className="text-sm text-muted-foreground mt-1">
                {importedIds.length} project{importedIds.length !== 1 ? "s" : ""} imported
                {skippedIds.length > 0 && (
                  <>, {skippedIds.length} skipped</>
                )}
              </p>
            </div>
            <Button onClick={handleFinish} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* Stacked card visual — background cards peeking behind */}
            <div className="relative">
              {/* Background cards (visual only) */}
              {totalCards - processedCount > 2 && (
                <div className="absolute -top-2 left-3 right-3 h-4 rounded-t-lg bg-muted/60 border border-b-0 border-border/40" />
              )}
              {totalCards - processedCount > 1 && (
                <div className="absolute -top-1 left-1.5 right-1.5 h-4 rounded-t-lg bg-muted/80 border border-b-0 border-border/60" />
              )}

              {/* Email context banner */}
              <div className="rounded-lg border bg-muted/50 p-3 mb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Contract email detected
                </p>
                <p className="font-medium text-sm truncate">
                  {currentEmail.subject}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  From: {currentEmail.from}
                </p>
                {currentEmail.snippet && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                    &ldquo;{currentEmail.snippet}&rdquo;
                  </p>
                )}

                {/* Extracted amount indicator */}
                {currentEmail.suggestedQuotedAmount !== null && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700">
                        Extracted quote: ${currentEmail.suggestedQuotedAmount.toLocaleString()}
                      </span>
                    </div>
                    {currentEmail.allAmountsFound.length > 1 && (
                      <p className="text-xs text-muted-foreground mt-1 ml-5">
                        Other amounts found:{" "}
                        {currentEmail.allAmountsFound
                          .filter((a) => a !== currentEmail.suggestedQuotedAmount)
                          .slice(0, 4)
                          .map((a) => `$${a.toLocaleString()}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Project form */}
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleImport)}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Project name</FormLabel>
                          <FormControl>
                            <Input placeholder="Wedding Film — Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Co." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="projectType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PROJECT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="quotedAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quoted amount ($)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                $
                              </span>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="1500"
                                className="pl-6"
                                value={field.value === 0 ? "" : field.value}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                    field.onChange(
                                      v === "" ? 0 : parseFloat(v) || 0
                                    );
                                  }
                                }}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="estimatedHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated hours</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="8"
                              value={field.value === 0 ? "" : field.value}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                  field.onChange(
                                    v === "" ? 0 : parseFloat(v) || 0
                                  );
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Deliverables, deadlines..."
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Projected IPH preview */}
                  {form.watch("quotedAmount") > 0 &&
                    form.watch("estimatedHours") > 0 && (
                      <div className="rounded-lg bg-muted px-4 py-2 flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                          Projected rate
                        </span>
                        <span className="font-semibold text-foreground">
                          $
                          {(
                            form.watch("quotedAmount") /
                            form.watch("estimatedHours")
                          ).toFixed(2)}
                          /hr
                        </span>
                      </div>
                    )}

                  {/* Action buttons */}
                  <div className="flex justify-between items-center pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      className="text-muted-foreground"
                    >
                      <SkipForward className="h-4 w-4 mr-1" />
                      Skip
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleFinish}
                      >
                        Finish later
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting ? (
                          "Importing..."
                        ) : isLastCard ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Import & finish
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-4 w-4 mr-1" />
                            Import & next
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
