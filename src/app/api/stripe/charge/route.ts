import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    // Verify Firebase auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    let userEmail: string | undefined;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
      userId = decoded.uid;
      userEmail = decoded.email;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { amountCents, description } = body as {
      amountCents: number;
      description: string;
    };

    // Validate input — enforce min and max to prevent abuse
    const MIN_CHARGE_CENTS = 50;   // Stripe minimum
    const MAX_CHARGE_CENTS = 5000; // $50 cap

    if (!amountCents || typeof amountCents !== "number" || amountCents < MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `amountCents must be at least ${MIN_CHARGE_CENTS} (Stripe minimum)` },
        { status: 400 }
      );
    }

    if (amountCents > MAX_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `amountCents must not exceed ${MAX_CHARGE_CENTS} ($${MAX_CHARGE_CENTS / 100} maximum)` },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Get Stripe customer ID from Firestore
    const userDoc = await adminDb.doc(`users/${userId}`).get();
    const stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found. Please add a payment method first." },
        { status: 400 }
      );
    }

    // Get the customer's default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      return NextResponse.json(
        { error: "No payment method on file. Please add a card first." },
        { status: 400 }
      );
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // Create and confirm a PaymentIntent using the saved payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
      metadata: {
        firebaseUserId: userId,
        userEmail: userEmail || "",
      },
    });

    return NextResponse.json({ status: paymentIntent.status });
  } catch (err) {
    // Handle Stripe card errors specifically
    if (
      err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type: string }).type === "StripeCardError"
    ) {
      const stripeErr = err as unknown as { message: string };
      return NextResponse.json(
        { error: stripeErr.message },
        { status: 402 }
      );
    }

    console.error("Charge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
