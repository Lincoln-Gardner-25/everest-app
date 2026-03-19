"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, KeyRound, Mail } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  // Check if the user signed in with email/password (not Google)
  const hasPasswordProvider = user?.providerData.some(
    (p) => p.providerId === "password"
  );

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
      // Firebase requires re-authentication before sensitive operations
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
    <div>
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

      <div className="max-w-lg space-y-6">
        {/* Account card */}
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
                    {saving ? "Updating…" : "Update password"}
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
