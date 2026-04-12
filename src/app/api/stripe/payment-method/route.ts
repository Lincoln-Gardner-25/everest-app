import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe";

async function verifyAuth(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
    return { userId: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const stripe = getStripe();

    // Get Stripe customer ID from Firestore
    const userDoc = await adminDb.doc(`users/${userId}`).get();
    const stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json({ paymentMethod: null });
    }

    // Get the customer's default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId);

    if (customer.deleted) {
      return NextResponse.json({ paymentMethod: null });
    }

    // List payment methods attached to the customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({ paymentMethod: null });
    }

    const pm = paymentMethods.data[0];
    return NextResponse.json({
      paymentMethod: {
        id: pm.id,
        last4: pm.card?.last4,
        brand: pm.card?.brand,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      },
    });
  } catch (err) {
    console.error("Get payment method error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Called after SetupIntent succeeds — server verifies card exists before setting hasCard
export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const stripe = getStripe();
    const userDoc = await adminDb.doc(`users/${userId}`).get();
    const stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
    }

    // Verify a card actually exists on the Stripe customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });

    const hasCard = paymentMethods.data.length > 0;
    await adminDb.doc(`users/${userId}`).set({ hasCard }, { merge: true });

    return NextResponse.json({ success: true, hasCard });
  } catch (err) {
    console.error("Confirm payment method error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const stripe = getStripe();

    // Get Stripe customer ID from Firestore
    const userDoc = await adminDb.doc(`users/${userId}`).get();
    const stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No payment method on file" }, { status: 404 });
    }

    // List and detach all card payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
    });

    for (const pm of paymentMethods.data) {
      await stripe.paymentMethods.detach(pm.id);
    }

    // Mark card as removed in Firestore so client UI updates in real-time
    await adminDb.doc(`users/${userId}`).set({ hasCard: false }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete payment method error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
