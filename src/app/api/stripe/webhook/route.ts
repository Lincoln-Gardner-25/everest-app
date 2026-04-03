import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const amountCents = parseInt(session.metadata?.amountCents || "0", 10);

    if (!userId || !amountCents) {
      console.error("Webhook missing metadata:", session.metadata);
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    const eventDocRef = adminDb.doc(`stripeWebhookEvents/${session.id}`);

    // Use a transaction to atomically check idempotency + increment balance
    try {
      await adminDb.runTransaction(async (transaction) => {
        const eventDoc = await transaction.get(eventDocRef);

        if (eventDoc.exists) {
          // Already processed — skip to avoid double-incrementing
          return;
        }

        // Mark this event as processed
        transaction.set(eventDocRef, {
          processedAt: FieldValue.serverTimestamp(),
          userId,
        });

        // Increment the user's balance
        transaction.set(
          adminDb.doc(`users/${userId}`),
          { balance: FieldValue.increment(amountCents) },
          { merge: true }
        );
      });
    } catch (txErr) {
      console.error("Transaction failed for webhook event:", session.id, txErr);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }

    console.log(`Processed checkout session ${session.id} for user ${userId} (${amountCents} cents)`);
  }

  return NextResponse.json({ received: true });
}
