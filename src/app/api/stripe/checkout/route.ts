import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe, getDepositOption } from "@/lib/stripe";

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
    const { depositId } = body as { depositId: string };

    const option = getDepositOption(depositId);
    if (!option) {
      return NextResponse.json({ error: "Invalid deposit option" }, { status: 400 });
    }

    const stripe = getStripe();

    // Get or create Stripe customer
    const userDoc = await adminDb.doc(`users/${userId}`).get();
    let stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { firebaseUserId: userId },
      });
      stripeCustomerId = customer.id;
      await adminDb.doc(`users/${userId}`).set(
        { stripeCustomerId },
        { merge: true }
      );
    }

    // Determine origin for redirect URLs — validate against whitelist to prevent CSRF
    const ALLOWED_ORIGINS = [
      process.env.NEXT_PUBLIC_APP_URL,
      "https://everest-app-delta.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ].filter(Boolean);

    const origin = req.headers.get("origin") || "";
    const baseUrl = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "http://localhost:3000";

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Everest Lead Credits — ${option.label} deposit`,
              description: `Add ${option.label} to your Everest lead search balance`,
            },
            unit_amount: option.amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        depositId: option.id,
        amountCents: String(option.amount),
      },
      success_url: `${baseUrl}/settings?deposit=success`,
      cancel_url: `${baseUrl}/settings?deposit=cancelled`,
    });

    return NextResponse.json({ sessionUrl: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
