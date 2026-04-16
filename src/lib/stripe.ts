import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

// Ensure a valid Stripe customer exists for a Firebase user.
// If the stored customer ID is stale (deleted or from a different Stripe env),
// create a new customer and update Firestore.
export async function ensureStripeCustomer(
  userId: string,
  userEmail: string | undefined,
  adminDb: FirebaseFirestore.Firestore
): Promise<string> {
  const stripe = getStripe();
  const userRef = adminDb.doc(`users/${userId}`);
  const userDoc = await userRef.get();
  let stripeCustomerId = userDoc.data()?.stripeCustomerId;

  if (stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(stripeCustomerId);
      if (existing.deleted) {
        stripeCustomerId = null;
      }
    } catch {
      // Customer doesn't exist in this Stripe account — clear it
      stripeCustomerId = null;
    }
  }

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { firebaseUserId: userId },
    });
    stripeCustomerId = customer.id;
    await userRef.set({ stripeCustomerId }, { merge: true });
  }

  return stripeCustomerId;
}

// Deposit options: label shown to user, amount in cents
export const DEPOSIT_OPTIONS = [
  { id: "deposit_5", label: "$5", amount: 500 },
  { id: "deposit_15", label: "$15", amount: 1500 },
  { id: "deposit_30", label: "$30", amount: 3000 },
  { id: "deposit_50", label: "$50", amount: 5000 },
] as const;

export type DepositId = (typeof DEPOSIT_OPTIONS)[number]["id"];

export function getDepositOption(id: string) {
  return DEPOSIT_OPTIONS.find((d) => d.id === id) ?? null;
}
