import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    // Verify Firebase auth token
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

    const body = await req.json();
    const { amountCents } = body as { amountCents: number };

    if (!amountCents || typeof amountCents !== "number" || amountCents < 100) {
      return NextResponse.json(
        { error: "Minimum withdrawal is $1.00" },
        { status: 400 }
      );
    }

    // Get user data and verify sufficient balance
    const userRef = adminDb.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    if (!userData?.balance || userData.balance < amountCents) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    if (!userData.stripeCustomerId) {
      return NextResponse.json(
        { error: "No payment method on file" },
        { status: 402 }
      );
    }

    // Find refundable deposits (most recent first) to cover the withdrawal amount
    const stripe = getStripe();
    const deposits = await adminDb
      .collection("balanceTransactions")
      .where("userId", "==", userId)
      .where("type", "==", "deposit")
      .orderBy("createdAt", "desc")
      .get();

    let remaining = amountCents;
    const refundPlan: Array<{ paymentIntentId: string; amount: number }> = [];

    for (const doc of deposits.docs) {
      if (remaining <= 0) break;
      const tx = doc.data();
      const refundable = tx.amountCents - (tx.refundedCents ?? 0);
      if (refundable <= 0) continue;

      const refundAmount = Math.min(remaining, refundable);
      refundPlan.push({ paymentIntentId: tx.paymentIntentId, amount: refundAmount });
      remaining -= refundAmount;
    }

    if (remaining > 0) {
      return NextResponse.json(
        { error: "Not enough refundable deposits to cover this withdrawal. Some deposits may have expired." },
        { status: 400 }
      );
    }

    // Execute refunds
    const refundIds: string[] = [];
    for (const plan of refundPlan) {
      const refund = await stripe.refunds.create({
        payment_intent: plan.paymentIntentId,
        amount: plan.amount,
        metadata: { firebaseUserId: userId },
      });
      refundIds.push(refund.id);

      // Update the deposit record's refundedCents
      const depositDoc = deposits.docs.find(
        (d) => d.data().paymentIntentId === plan.paymentIntentId
      );
      if (depositDoc) {
        await adminDb.doc(`balanceTransactions/${depositDoc.id}`).update({
          refundedCents: FieldValue.increment(plan.amount),
        });
      }
    }

    // Decrement balance and log the withdrawal
    const batch = adminDb.batch();
    batch.update(userRef, { balance: FieldValue.increment(-amountCents) });
    batch.create(adminDb.collection("balanceTransactions").doc(), {
      userId,
      type: "withdrawal",
      amountCents,
      refundIds,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      refunded: amountCents,
      newBalance: userData.balance - amountCents,
    });
  } catch (err) {
    console.error("Withdrawal error:", err);
    return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });
  }
}
