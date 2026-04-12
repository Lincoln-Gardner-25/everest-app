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

    if (!amountCents || typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 100 || amountCents > 1_000_000) {
      return NextResponse.json(
        { error: "Withdrawal must be between $1.00 and $10,000.00" },
        { status: 400 }
      );
    }

    // Use a transaction to atomically verify balance + build refund plan + decrement
    const userRef = adminDb.doc(`users/${userId}`);

    const refundPlan = await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data();

      if (!userData?.balance || userData.balance < amountCents) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      if (!userData.stripeCustomerId) {
        throw new Error("NO_PAYMENT_METHOD");
      }

      // Find refundable deposits within the transaction
      const deposits = await tx.get(
        adminDb
          .collection("balanceTransactions")
          .where("userId", "==", userId)
          .where("type", "==", "deposit")
          .orderBy("createdAt", "desc")
      );

      let remaining = amountCents;
      const plan: Array<{ paymentIntentId: string; amount: number; docId: string }> = [];

      for (const doc of deposits.docs) {
        if (remaining <= 0) break;
        const data = doc.data();
        const refundable = data.amountCents - (data.refundedCents ?? 0);
        if (refundable <= 0) continue;

        const refundAmount = Math.min(remaining, refundable);
        plan.push({ paymentIntentId: data.paymentIntentId, amount: refundAmount, docId: doc.id });
        remaining -= refundAmount;
      }

      if (remaining > 0) {
        throw new Error("NOT_ENOUGH_REFUNDABLE");
      }

      // Atomically decrement balance and update deposit records
      tx.update(userRef, { balance: FieldValue.increment(-amountCents) });

      for (const p of plan) {
        tx.update(adminDb.doc(`balanceTransactions/${p.docId}`), {
          refundedCents: FieldValue.increment(p.amount),
        });
      }

      return plan;
    });

    // Execute Stripe refunds outside the transaction (external API call)
    const stripe = getStripe();
    const refundIds: string[] = [];

    for (const plan of refundPlan) {
      const refund = await stripe.refunds.create({
        payment_intent: plan.paymentIntentId,
        amount: plan.amount,
        metadata: { firebaseUserId: userId, source: "everest_withdrawal" },
      });
      refundIds.push(refund.id);
    }

    // Log the withdrawal
    await adminDb.collection("balanceTransactions").add({
      userId,
      type: "withdrawal",
      amountCents,
      refundIds,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Get updated balance
    const updatedSnap = await userRef.get();
    const newBalance = updatedSnap.data()?.balance ?? 0;

    return NextResponse.json({
      success: true,
      refunded: amountCents,
      newBalance,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }
      if (err.message === "NO_PAYMENT_METHOD") {
        return NextResponse.json({ error: "No payment method on file" }, { status: 402 });
      }
      if (err.message === "NOT_ENOUGH_REFUNDABLE") {
        return NextResponse.json(
          { error: "Not enough refundable deposits to cover this withdrawal. Some deposits may have expired." },
          { status: 400 }
        );
      }
    }
    console.error("Withdrawal error:", err);
    return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });
  }
}
