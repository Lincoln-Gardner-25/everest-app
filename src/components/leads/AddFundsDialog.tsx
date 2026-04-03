"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, X } from "lucide-react";
import { DEPOSIT_OPTIONS, formatBalance } from "@/lib/pricing";

interface AddFundsDialogProps {
  open: boolean;
  onClose: () => void;
  balance: number; // cents
  getIdToken: () => Promise<string>;
}

export default function AddFundsDialog({
  open,
  onClose,
  balance,
  getIdToken,
}: AddFundsDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleDeposit(depositId: string) {
    setLoading(depositId);
    setError("");

    try {
      const token = await getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ depositId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create checkout session");
      }

      const { sessionUrl } = await res.json();
      if (sessionUrl) {
        window.location.href = sessionUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-card border shadow-xl p-6 space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Add Funds</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Current balance: <span className="font-medium text-foreground">{formatBalance(balance)}</span>
        </p>

        <div className="grid grid-cols-2 gap-2">
          {DEPOSIT_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              variant="outline"
              disabled={!!loading}
              onClick={() => handleDeposit(`deposit_${opt.amount / 100}`)}
              className="h-14 text-lg font-semibold"
            >
              {loading === `deposit_${opt.amount / 100}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                opt.label
              )}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Pass-through pricing — you pay exactly what the APIs cost, no markup.
        </p>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
