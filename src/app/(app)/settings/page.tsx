"use client";

import { useState, useEffect, useCallback } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { isGmailScanEnabled, setGmailScanEnabled } from "@/lib/gmail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, KeyRound, Mail, CreditCard, Trash2, RefreshCw, Loader2, Plus, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useBalance } from "@/hooks/useBalance";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

interface CardInfo {
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

function CardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !user) return;
    setSaving(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/setup-intent", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { clientSecret } = await res.json();
      if (!clientSecret) throw new Error("Failed to create setup intent");

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found");

      const { error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (stripeError) {
        setError(stripeError.message || "Failed to save card");
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border p-3 bg-white">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#1F2937",
                fontFamily: "Inter, sans-serif",
                "::placeholder": { color: "#9CA3AF" },
              },
            },
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !stripe} className="flex-1">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Card"
          )}
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  // Balance
  const { balance, loading: balanceLoading } = useBalance(user?.uid);
  const [depositLoading, setDepositLoading] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [balanceSuccess, setBalanceSuccess] = useState("");
  const [balanceError, setBalanceError] = useState("");

  // Check for deposit success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deposit") === "success") {
      setBalanceSuccess("Funds added successfully!");
      setTimeout(() => setBalanceSuccess(""), 5000);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function handleDeposit(depositId: string) {
    if (!user) return;
    setDepositLoading(depositId);
    setBalanceError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ depositId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create checkout");
      if (data.sessionUrl) window.location.href = data.sessionUrl;
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDepositLoading(null);
    }
  }

  async function handleWithdraw() {
    if (!user || withdrawing) return;
    const dollars = parseFloat(withdrawAmount);
    if (isNaN(dollars) || dollars < 1) {
      setBalanceError("Minimum withdrawal is $1.00");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents > balance) {
      setBalanceError("Amount exceeds your balance");
      return;
    }
    setWithdrawing(true);
    setBalanceError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      setBalanceSuccess("Withdrawal processed — refund will appear on your card in 5-10 business days.");
      setWithdrawAmount("");
      setTimeout(() => setBalanceSuccess(""), 5000);
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  // Payment method
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [showCardForm, setShowCardForm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cardSuccess, setCardSuccess] = useState("");

  const fetchCard = useCallback(async () => {
    if (!user) return;
    setCardLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/payment-method", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCardInfo(data.last4 ? data : null);
      } else {
        setCardInfo(null);
      }
    } catch {
      setCardInfo(null);
    } finally {
      setCardLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  async function handleRemoveCard() {
    if (!user || removing) return;
    setRemoving(true);
    try {
      const token = await user.getIdToken();
      await fetch("/api/stripe/payment-method", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setCardInfo(null);
      setCardSuccess("Card removed");
      setTimeout(() => setCardSuccess(""), 3000);
    } catch {
      // silent fail
    } finally {
      setRemoving(false);
    }
  }

  // Gmail scanning toggle
  const [gmailEnabled, setGmailEnabled] = useState(true);
  const [gmailToggleLoading, setGmailToggleLoading] = useState(true);

  const hasPasswordProvider = user?.providerData.some(
    (p) => p.providerId === "password"
  );

  // Load Gmail scan preference
  useEffect(() => {
    if (!user) return;
    isGmailScanEnabled(user.uid).then((enabled) => {
      setGmailEnabled(enabled);
      setGmailToggleLoading(false);
    });
  }, [user]);

  async function handleToggleGmail() {
    if (!user) return;
    const newValue = !gmailEnabled;
    setGmailEnabled(newValue);
    await setGmailScanEnabled(user.uid, newValue);
  }

  async function handleChangePassword() {
    setError("");
    setSaved(false);

    if (!newPassword || !confirmPassword || !currentPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (!user?.email) return;

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("wrong-password") || err.message.includes("invalid-credential")) {
          setError("Current password is incorrect.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to update password. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSendResetEmail() {
    if (!user?.email || resetSending) return;
    setResetError("");
    setResetSent(false);
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setResetSending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Settings
        </h1>
        <p className="text-muted-foreground">Manage your account settings.</p>
      </div>

      <div className="space-y-6">
        {/* Gmail scanning toggle */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Contract Scanner</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Automatically scan your Gmail for signed contracts when you open the dashboard.
            Looks for emails matching your document signing service.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">
              {gmailEnabled ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={handleToggleGmail}
              disabled={gmailToggleLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                gmailEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  gmailEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Payment Method card */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Payment Method</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Your card on file for purchasing leads. You are never charged without confirming first.
          </p>

          {cardLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : cardInfo && !showCardForm ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {cardInfo.brand} ending in {cardInfo.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {String(cardInfo.expMonth).padStart(2, "0")}/{cardInfo.expYear}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCardForm(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Update Card
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveCard}
                  disabled={removing}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {removing ? "Removing..." : "Remove"}
                </Button>
              </div>
              {cardSuccess && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {cardSuccess}
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!showCardForm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowCardForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment Method
                </Button>
              ) : (
                <Elements stripe={stripePromise}>
                  <CardForm
                    onSuccess={() => {
                      setShowCardForm(false);
                      setCardSuccess("Card saved successfully");
                      setTimeout(() => setCardSuccess(""), 3000);
                      fetchCard();
                    }}
                  />
                  <button
                    onClick={() => setShowCardForm(false)}
                    className="text-sm text-muted-foreground underline mt-2"
                  >
                    Cancel
                  </button>
                </Elements>
              )}
              {cardSuccess && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {cardSuccess}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Balance card */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Balance</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Add funds to pay for lead searches, or withdraw unused funds back to your card.
          </p>

          {/* Current balance */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-5 py-4">
            <p className="text-sm text-muted-foreground">Available balance</p>
            {balanceLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
            ) : (
              <p className="text-3xl font-bold text-foreground">${(balance / 100).toFixed(2)}</p>
            )}
          </div>

          {/* Add Funds */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Add Funds
            </p>
            <div className="grid grid-cols-4 gap-2">
              {([
                { id: "deposit_5", label: "$5" },
                { id: "deposit_15", label: "$15" },
                { id: "deposit_30", label: "$30" },
                { id: "deposit_50", label: "$50" },
              ] as const).map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  disabled={!!depositLoading}
                  onClick={() => handleDeposit(opt.id)}
                  className="h-10 font-semibold"
                >
                  {depositLoading === opt.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    opt.label
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Withdraw Funds */}
          {balance > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <ArrowUpFromLine className="h-3.5 w-3.5" />
                Withdraw Funds
              </p>
              <p className="text-xs text-muted-foreground">
                Refunded to your card on file. May take 5-10 business days.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    max={(balance / 100).toFixed(2)}
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount}
                >
                  {withdrawing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Withdraw"
                  )}
                </Button>
              </div>
            </div>
          )}

          {balanceSuccess && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {balanceSuccess}
            </span>
          )}
          {balanceError && <p className="text-sm text-destructive">{balanceError}</p>}
        </div>

        {/* Password card */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Change Password</h2>
          </div>

          {!hasPasswordProvider ? (
            <p className="text-sm text-muted-foreground">
              You signed in with Google. Password changes are managed through your Google account.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We&apos;ll send a password reset link to <span className="font-medium text-foreground">{user?.email}</span>.
              </p>

              <Button
                onClick={handleSendResetEmail}
                disabled={resetSending}
                variant="outline"
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                {resetSending ? "Sending..." : "Send password reset email"}
              </Button>

              {resetSent && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Reset email sent — check your inbox.
                </span>
              )}

              {resetError && <p className="text-sm text-destructive">{resetError}</p>}

              <div className="border-t pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">Or change it directly:</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="current">Current password</Label>
                    <Input
                      id="current"
                      type="password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new">New password</Label>
                    <Input
                      id="new"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm new password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Password updated
                    </span>
                  )}

                  <Button
                    onClick={handleChangePassword}
                    disabled={saving}
                    className="w-full"
                  >
                    {saving ? "Updating\u2026" : "Update password"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
