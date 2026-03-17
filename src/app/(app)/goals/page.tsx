"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

const SPECIALTIES = [
  "Wedding",
  "Corporate / Brand",
  "Short-form / Social",
  "Documentary",
  "Events",
  "Music Videos",
  "Real Estate",
  "Other",
];

export default function GoalsPage() {
  const { user } = useAuth();
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMonthlyGoal(data.monthlyGoal ? String(data.monthlyGoal) : "");
        setTargetRate(data.targetHourlyRate ? String(data.targetHourlyRate) : "");
        setSpecialties(data.specialty ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleMonthlyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setMonthlyGoal(v);
  }

  function handleRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) setTargetRate(v);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const monthly = parseFloat(monthlyGoal) || 0;
      const rate = parseFloat(targetRate) || 0;
      await setDoc(
        doc(db, "users", user.uid),
        {
          monthlyGoal: monthly,
          yearlyGoal: monthly * 12,
          targetHourlyRate: rate,
          specialty: specialties,
        },
        { merge: true }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const monthly = parseFloat(monthlyGoal) || 0;

  if (loading) {
    return (
      <div>
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Goals
        </h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Goals
          </h1>
          <p className="text-muted-foreground">
            Set your income targets and videography specialty.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-1">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Income Goals card */}
        <div className="rounded-2xl border bg-card p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-foreground mb-0.5">Income Goals</h2>
            <p className="text-sm text-muted-foreground">
              Set your monthly target and desired hourly rate.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthly">Monthly income goal</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                $
              </span>
              <Input
                id="monthly"
                type="text"
                inputMode="decimal"
                placeholder="5000"
                value={monthlyGoal}
                onChange={handleMonthlyChange}
                className="pl-7"
              />
            </div>
            {monthly > 0 && (
              <p className="text-xs text-muted-foreground">
                Yearly:{" "}
                <span className="text-foreground font-medium">
                  ${(monthly * 12).toLocaleString()}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate">Target hourly rate</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                $
              </span>
              <Input
                id="rate"
                type="text"
                inputMode="decimal"
                placeholder="75"
                value={targetRate}
                onChange={handleRateChange}
                className="pl-7 pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                /hr
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to compare against your actual IPH on completed projects.
            </p>
          </div>
        </div>

        {/* Specialty card */}
        <div className="rounded-2xl border bg-card p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-foreground mb-0.5">Specialty</h2>
            <p className="text-sm text-muted-foreground">
              What type of videography do you focus on? Select all that apply.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SPECIALTIES.map((s) => (
              <button
                key={s}
                onClick={() => toggleSpecialty(s)}
                className={`rounded-lg border px-4 py-3 text-sm font-medium text-left transition-colors ${
                  specialties.includes(s)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {specialties.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {specialties.length} selected
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
