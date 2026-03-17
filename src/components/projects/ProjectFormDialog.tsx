"use client";

import { useEffect } from "react";
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
import { type Project, type ProjectInput } from "@/lib/projects";

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
  status: z.enum(["active", "review", "completed"]),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ProjectInput) => Promise<void>;
  project?: Project | null;
}

export function ProjectFormDialog({ open, onClose, onSubmit, project }: Props) {
  const isEdit = !!project;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      clientName: "",
      projectType: "",
      quotedAmount: 0,
      estimatedHours: 0,
      status: "active",
      notes: "",
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name,
        clientName: project.clientName,
        projectType: project.projectType,
        quotedAmount: project.quotedAmount,
        estimatedHours: project.estimatedHours,
        status: project.status,
        notes: project.notes,
      });
    } else {
      form.reset({
        name: "",
        clientName: "",
        projectType: "",
        quotedAmount: 0,
        estimatedHours: 0,
        status: "active",
        notes: "",
      });
    }
  }, [project, form]);

  async function handleSubmit(values: FormValues) {
    await onSubmit(values as ProjectInput);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-libre-baskerville)" }}>
            {isEdit ? "Edit project" : "New project"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Project name</FormLabel>
                    <FormControl>
                      <Input placeholder="Brand video for Acme Co." {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="1500"
                          className="pl-6"
                          value={field.value === 0 ? "" : field.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d*\.?\d*$/.test(v)) {
                              field.onChange(v === "" ? 0 : parseFloat(v) || 0);
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
                            field.onChange(v === "" ? 0 : parseFloat(v) || 0);
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
                      placeholder="Deliverables, special requirements, deadlines..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Projected IPH preview */}
            {form.watch("quotedAmount") > 0 && form.watch("estimatedHours") > 0 && (
              <div className="rounded-lg bg-muted px-4 py-3 flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Projected rate</span>
                <span className="font-semibold text-foreground">
                  ${(form.watch("quotedAmount") / form.watch("estimatedHours")).toFixed(2)}/hr
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Saving…"
                  : isEdit
                  ? "Save changes"
                  : "Create project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
