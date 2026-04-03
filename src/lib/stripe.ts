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
