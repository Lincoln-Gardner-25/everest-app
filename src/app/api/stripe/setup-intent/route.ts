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

    const stripe = getStripe();

    // Get or create Stripe customer
    const userRef = adminDb.doc(`users/${userId}`);
    const userDoc = await userRef.get();
    let stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { firebaseUserId: userId },
      });
      stripeCustomerId = customer.id;
      await userRef.set({ stripeCustomerId }, { merge: true });
    }

    // Create SetupIntent to collect card info without charging
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("SetupIntent error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
