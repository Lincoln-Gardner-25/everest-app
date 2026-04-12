"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mountain, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

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

// Lazy-load Stripe outside component to avoid re-creating on render
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

// ---------- Step 4 inner form (needs Stripe context) ----------
function PaymentForm({
  onSuccess,
  onSkip,
}: {
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const { user } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch SetupIntent client secret on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchSecret() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/stripe/setup-intent", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to create setup intent");
        const data = await res.json();
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not initialize payment form. You can skip for now.");
          setLoading(false);
        }
      }
    }
    fetchSecret();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;

    setSubmitting(true);
    setError("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found.");
      setSubmitting(false);
      return;
    }

    const { error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (stripeError) {
      setError(stripeError.message ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    onSuccess();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Add a payment method
        </h1>
        <p className="text-muted-foreground">
          Add a card on file to unlock premium lead searches and enrichment
          credits. You won&apos;t be charged today.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">
              Secure card setup
            </p>
            <p className="text-xs text-muted-foreground">
              Powered by Stripe. Your card details are encrypted end-to-end.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Setting up secure form...
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 bg-background">
                <CardElement
                  options={{
                    style: {
                      base: {
                        fontSize: "16px",
                        color: "#1F2937",
                        fontFamily: "Inter, system-ui, sans-serif",
                        "::placeholder": { color: "#9CA3AF" },
                      },
                      invalid: { color: "#EF4444" },
                    },
                  }}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !stripe || !clientSecret}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving card...
                  </>
                ) : (
                  "Save Payment Method"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        Skip for now
      </button>
    </div>
  );
}

// ---------- Main onboarding page ----------
export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Guard: redirect already-onboarded users to dashboard
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists() && snap.data().onboardingComplete) {
        router.replace("/dashboard");
      }
    });
  }, [user, router]);
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

  // Save profile to Firestore, then advance to Step 4
  async function saveAndContinue() {
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
        onboardingComplete: false,
        createdAt: serverTimestamp(),
      });
      setStep(4);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Mark onboarding complete and go to dashboard
  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { onboardingComplete: true },
        { merge: true }
      );
    } catch {
      // Non-blocking — user can still proceed
    }
    router.push("/dashboard");
  }, [user, router]);

  const TOTAL_STEPS = 4;

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
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
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
              {s < TOTAL_STEPS && (
                <div
                  className={`h-px w-8 ${
                    step > s ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
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

        {/* Step 3 — Confirm */}
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
              <Button className="flex-1" onClick={saveAndContinue} disabled={saving}>
                {saving ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — Payment method */}
        {step === 4 && (
          <Elements stripe={getStripePromise()}>
            <PaymentForm
              onSuccess={completeOnboarding}
              onSkip={completeOnboarding}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
