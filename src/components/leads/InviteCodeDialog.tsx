"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Ticket, X } from "lucide-react";

interface InviteCodeDialogProps {
  open: boolean;
  onClose: () => void;
  getIdToken: () => Promise<string>;
  onSuccess: (code: string) => void;
}

export default function InviteCodeDialog({
  open,
  onClose,
  getIdToken,
  onSuccess,
}: InviteCodeDialogProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleRedeem() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");

    const normalized = code.trim().toUpperCase();

    try {
      // Validate coupon server-side only — no codes in the client bundle
      const token = await getIdToken();
      const res = await fetch("/api/invite/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: normalized }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Invalid coupon code");
        setLoading(false);
        return;
      }

      onSuccess(normalized);
      setCode("");
      onClose();
    } catch {
      setError("Failed to validate code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-card border shadow-xl p-6 space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Coupon Code</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Enter a coupon code for a free search.
        </p>

        <Input
          placeholder="Enter your code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
          className="font-mono tracking-wider"
        />

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          Apply Code
        </Button>
      </div>
    </div>
  );
}
