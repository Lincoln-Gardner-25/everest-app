import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { validateInviteCode, getCouponDetails } from "@/lib/invite-codes";

const MAX_REDEEM_PER_HOUR = 5;
const redeemRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRedeemRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = redeemRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    redeemRateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= MAX_REDEEM_PER_HOUR) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (!checkRedeemRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 5 redemption attempts per hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { code } = body as { code: string };

    if (!code || typeof code !== "string" || code.length > 50) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    if (!validateInviteCode(code)) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    const coupon = getCouponDetails(code);
    if (!coupon) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    const userRef = adminDb.doc(`users/${userId}`);
    await userRef.set(
      {
        couponCode: code.trim().toUpperCase(),
        couponMaxSearches: coupon.maxSearches, // -1 = unlimited
        couponSearchesUsed: 0,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      maxSearches: coupon.maxSearches,
    });
  } catch (err) {
    console.error("Coupon redeem error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
