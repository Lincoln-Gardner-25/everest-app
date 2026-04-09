"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useBalance(userId: string | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  // Payment method
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", userId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBalance(data.balance ?? 0);
          setHasPaymentMethod(!!data.hasCard);
          setStripeCustomerId(data.stripeCustomerId ?? null);
        } else {
          setBalance(0);
          setHasPaymentMethod(false);
          setStripeCustomerId(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Balance subscription error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return {
    balance,
    loading,
    hasPaymentMethod,
    stripeCustomerId,
  };
}
