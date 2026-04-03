"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useBalance(userId: string | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [hasInviteCode, setHasInviteCode] = useState(false);
  // Coupon fields
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponMaxSearches, setCouponMaxSearches] = useState<number>(0);
  const [couponSearchesUsed, setCouponSearchesUsed] = useState<number>(0);
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
          setHasInviteCode(!!data.inviteCode || !!data.couponCode);
          // Coupon
          setCouponCode(data.couponCode ?? null);
          setCouponMaxSearches(data.couponMaxSearches ?? 0);
          setCouponSearchesUsed(data.couponSearchesUsed ?? 0);
          // Stripe
          setHasPaymentMethod(!!data.stripeCustomerId);
          setStripeCustomerId(data.stripeCustomerId ?? null);
        } else {
          setBalance(0);
          setHasInviteCode(false);
          setCouponCode(null);
          setCouponMaxSearches(0);
          setCouponSearchesUsed(0);
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

  // Coupon is valid if: unlimited (-1) or still has searches remaining
  const hasCoupon = !!couponCode && (couponMaxSearches === -1 || couponSearchesUsed < couponMaxSearches);
  const couponSearchesRemaining = couponMaxSearches === -1 ? Infinity : Math.max(0, couponMaxSearches - couponSearchesUsed);

  return {
    balance,
    loading,
    hasInviteCode,
    // Coupon
    couponCode,
    hasCoupon,
    couponMaxSearches,
    couponSearchesUsed,
    couponSearchesRemaining,
    // Stripe
    hasPaymentMethod,
    stripeCustomerId,
  };
}
