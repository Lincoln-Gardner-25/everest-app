// Coupon code definitions
// TRY_FOR_FREE = unlimited free searches (admin/VIP)
// EVEREST-FREE = 5 free searches (beta testers)

interface CouponCode {
  maxSearches: number; // -1 = unlimited
}

const COUPON_CODES: Record<string, CouponCode> = {
  "TRY_FOR_FREE": { maxSearches: -1 },
  "EVEREST-FREE": { maxSearches: 5 },
  // Legacy codes — unlimited
  "EVEREST-BETA": { maxSearches: -1 },
  "VIDEOGRAPHER-2026": { maxSearches: -1 },
};

// Also accept codes from env var (comma-separated) — treated as unlimited
function getAllCodes(): Record<string, CouponCode> {
  const codes = { ...COUPON_CODES };
  const raw = process.env.DEV_INVITE_CODES || "";
  for (const c of raw.split(",")) {
    const trimmed = c.trim().toUpperCase();
    if (trimmed && !codes[trimmed]) {
      codes[trimmed] = { maxSearches: -1 };
    }
  }
  return codes;
}

export function validateInviteCode(code: string): boolean {
  const codes = getAllCodes();
  return code.trim().toUpperCase() in codes;
}

export function getCouponDetails(code: string): CouponCode | null {
  const codes = getAllCodes();
  return codes[code.trim().toUpperCase()] || null;
}
