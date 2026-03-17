"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mountain, CheckCircle2 } from "lucide-react";

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

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const monthly = parseFloat(monthlyGoal) || 0;
      const rate = parseFloat(targetRate) || 0;
      await setDoc(doc(db, "users", user.uid), {
        monthlyGoal: monthly,
        yearlyGoal: monthly * 12,
        targetHourlyRate: rate,
        specialty: specialties,
        onboardingComplete: true,
        createdAt: serverTimestamp(),
      });
      router.push("/dashboard");
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Mountain className="h-4 w-4 text-primary-foreground" />
          </div>
          <span
            className="text-xl font-bold"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Everest
          </span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  step > s
                    ? "bg-primary text-primary-foreground"
                    : step === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`h-px w-12 ${step > s ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Income goal */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ fontFamily: "var(--font-libre-baskerville)" }}
              >
                Set your income goal
              </h1>
              <p className="text-muted-foreground">
                What do you need to earn each month to feel financially secure?
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthly">Monthly income goal ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="monthly"
                    type="text"
                    inputMode="decimal"
                    placeholder="5000"
                    value={monthlyGoal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setMonthlyGoal(v);
                    }}
                    className="pl-7"
                  />
                </div>
                {monthlyGoal && (
                  <p className="text-sm text-muted-foreground">
                    Yearly goal: <span className="text-foreground font-medium">
                      ${(parseFloat(monthlyGoal) * 12).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Target hourly rate ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="rate"
                    type="text"
                    inputMode="decimal"
                    placeholder="75"
                    value={targetRate}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setTargetRate(v);
                    }}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  US average for videographers: $50–$150/hr depending on specialty and market.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!monthlyGoal || !targetRate}
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step 2 — Specialty */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ fontFamily: "var(--font-libre-baskerville)" }}
              >
                Your specialty
              </h1>
              <p className="text-muted-foreground">
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
                      : "border-border bg-card text-foreground hover:border-primary/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStep(3)}
                disabled={specialties.length === 0}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Ready */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ fontFamily: "var(--font-libre-baskerville)" }}
              >
                You&apos;re all set
              </h1>
              <p className="text-muted-foreground">
                Here&apos;s your starting point. You can update these anytime in Settings.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Monthly goal</span>
                <span className="font-semibold text-foreground">
                  ${parseFloat(monthlyGoal).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Yearly goal</span>
                <span className="font-semibold text-foreground">
                  ${(parseFloat(monthlyGoal) * 12).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Target rate</span>
                <span className="font-semibold text-foreground">
                  ${parseFloat(targetRate)}/hr
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Specialties</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={finish} disabled={saving}>
                {saving ? "Saving…" : "Go to Dashboard"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
