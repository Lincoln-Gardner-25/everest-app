"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, KeyRound } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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
          )}
        </div>
      </div>
    </div>
  );
}
