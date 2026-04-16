// ── API Cost Constants ───────────────────────────────────────────────
// Google Places API (New) charges PER API CALL, not per result.
// One Text Search call returns up to 20 places and costs one request.
// Updated 2026-04-15.

export const API_COSTS = {
  // Google Places API (New) — per call
  placesTextSearch: 0.032,  // Text Search request (returns up to 20 results)
  geocode: 0.032,           // Geocode is a Text Search with maxResultCount=1

  // Enrichment APIs — per lead (called once per lead)
  youtube: 0,        // YouTube Data API — free (quota-limited)
  braveSearch: 0.005, // Brave Search API per query
  apollo: 0.05,      // Apollo.io per contact lookup
  hunter: 0.03,      // Hunter.io per email verification
} as const;

// Margin to cover fallback queries, retries, and variance.
// e.g. 1.35 = 35% buffer above estimated cost.
const BASE_MARGIN = 1.35;

// Absolute floor — Stripe minimum charge is $0.50
const MIN_CHARGE_CENTS = 50;

// ── Volume tier pricing ─────────────────────────────────────────────
// Larger searches carry a premium because they deliver more value
// (more leads = more potential clients). The per-lead price increases
// with tier size so users aren't incentivized to always pick the max.
//
// Structure: { threshold, perLeadCents }
// The per-lead fee is added ON TOP of the base API cost + margin.
// This means you always cover API costs, and the premium is pure profit.
const VOLUME_TIERS = [
  { threshold: 10,  perLeadCents: 3 },   // 10 leads:  +$0.30
  { threshold: 25,  perLeadCents: 5 },   // 25 leads:  +$1.25
  { threshold: 50,  perLeadCents: 6 },   // 50 leads:  +$3.00
  { threshold: 100, perLeadCents: 7 },   // 100 leads: +$7.00
  { threshold: 250, perLeadCents: 8 },   // 250 leads: +$20.00
  { threshold: 500, perLeadCents: 9 },   // 500 leads: +$45.00
] as const;

function getVolumePremiumCents(numLeads: number): number {
  // Find the matching tier (highest threshold <= numLeads)
  let perLeadCents: number = VOLUME_TIERS[0].perLeadCents;
  for (const tier of VOLUME_TIERS) {
    if (numLeads >= tier.threshold) {
      perLeadCents = tier.perLeadCents;
    }
  }
  return numLeads * perLeadCents;
}

export interface EnrichmentOptions {
  youtube: boolean;
  braveSearch: boolean;
  apollo: boolean;
  hunter: boolean;
}

export const DEFAULT_ENRICHMENT: EnrichmentOptions = {
  youtube: true,
  braveSearch: true,
  apollo: true,
  hunter: true,
};

export const LEAD_COUNT_OPTIONS = [10, 25, 50, 100, 250, 500] as const;

// ── Estimate how many Places API calls a search will need ───────────
// Each category = 1 primary call (20 results max).
// If dedup or sparse results require fallbacks, each category may need
// a second call. We estimate worst-case calls based on the ratio of
// requested leads to expected yield per call.
// Max API calls the search route will make (safety cap for Vercel timeout)
const MAX_API_CALLS = 50;

function estimateApiCalls(numLeads: number, numCategories: number): number {
  const geocodeCalls = 1;

  // Each Text Search call yields ~12 usable NEW results on average
  // (overlap increases with each pass as we exhaust unique businesses).
  const yieldPerCall = 12;

  // Pass 1: 5 phrasing variations * numCategories at center
  const pass1MaxCalls = 5 * numCategories;
  const pass1Calls = Math.min(pass1MaxCalls, Math.ceil(numLeads / yieldPerCall));
  let totalCalls = pass1Calls;
  let totalYield = pass1Calls * yieldPerCall;

  // Pass 2: geographic grid — adaptive density (2x2 to 4x4 sectors)
  if (numLeads > totalYield) {
    const deficit = numLeads - totalYield;
    const gridSize = deficit > 200 ? 4 : deficit > 50 ? 3 : 2;
    const sectorCount = gridSize * gridSize;
    const pass2MaxCalls = sectorCount * numCategories;
    const pass2Calls = Math.min(pass2MaxCalls, Math.ceil(deficit / yieldPerCall));
    totalCalls += pass2Calls;
    totalYield += pass2Calls * yieldPerCall;
  }

  // Pass 3: alternate phrasing in corner sectors
  if (numLeads > totalYield) {
    const deficit = numLeads - totalYield;
    const pass3MaxCalls = 2 * 4 * numCategories; // 2 templates * 4 corners
    const pass3Calls = Math.min(pass3MaxCalls, Math.ceil(deficit / yieldPerCall));
    totalCalls += pass3Calls;
  }

  // Cap at the route's MAX_API_CALLS safety limit
  return geocodeCalls + Math.min(totalCalls, MAX_API_CALLS - 1);
}

// ── Main pricing function ───────────────────────────────────────────
// Returns the estimated cost BEFORE margin (raw API cost) and the
// final charge amount (with margin applied). The charge is what the
// user pays; the raw cost is for transparency / audit.
export function calculateSearchCost(
  numLeads: number,
  enrichment: EnrichmentOptions,
  numCategories: number = 1
): {
  apiCalls: number;
  rawApiCost: number;
  enrichmentCosts: Record<string, number>;
  rawTotal: number;
  chargeTotal: number;
  volumePremium: number;
  margin: number;
} {
  // 1. Places API cost (per-call, not per-lead)
  const apiCalls = estimateApiCalls(numLeads, numCategories);
  const rawApiCost = apiCalls * API_COSTS.placesTextSearch;

  // 2. Enrichment cost (per-lead)
  const enrichmentCosts: Record<string, number> = {};
  if (enrichment.youtube)    enrichmentCosts.youtube     = numLeads * API_COSTS.youtube;
  if (enrichment.braveSearch) enrichmentCosts.braveSearch = numLeads * API_COSTS.braveSearch;
  if (enrichment.apollo)     enrichmentCosts.apollo      = numLeads * API_COSTS.apollo;
  if (enrichment.hunter)     enrichmentCosts.hunter      = numLeads * API_COSTS.hunter;

  const enrichmentTotal = Object.values(enrichmentCosts).reduce(
    (sum, c) => sum + c,
    0
  );

  // 3. Raw total = actual estimated API spend
  const rawTotal = rawApiCost + enrichmentTotal;

  // 4. Base charge = raw cost * margin (covers API costs + buffer)
  const baseCost = rawTotal * BASE_MARGIN;

  // 5. Volume premium = per-lead fee based on tier (pure profit)
  const volumePremiumCents = getVolumePremiumCents(numLeads);
  const volumePremium = volumePremiumCents / 100;

  // 6. Final charge = base + premium, floored at Stripe minimum
  const chargeTotal = Math.max(
    baseCost + volumePremium,
    MIN_CHARGE_CENTS / 100
  );

  return {
    apiCalls,
    rawApiCost,
    enrichmentCosts,
    rawTotal,
    chargeTotal,
    volumePremium,
    margin: BASE_MARGIN,
  };
}

// ── Post-search reconciliation ──────────────────────────────────────
// Called AFTER a search completes with the actual number of API calls
// made. Returns the true cost so we can log the delta for monitoring.
export function calculateActualCost(
  actualApiCalls: number,
  numLeads: number,
  enrichment: EnrichmentOptions
): { actualCost: number } {
  const apiCost = actualApiCalls * API_COSTS.placesTextSearch;

  let enrichmentCost = 0;
  if (enrichment.youtube)     enrichmentCost += numLeads * API_COSTS.youtube;
  if (enrichment.braveSearch) enrichmentCost += numLeads * API_COSTS.braveSearch;
  if (enrichment.apollo)      enrichmentCost += numLeads * API_COSTS.apollo;
  if (enrichment.hunter)      enrichmentCost += numLeads * API_COSTS.hunter;

  return { actualCost: apiCost + enrichmentCost };
}

// ── Helpers ─────────────────────────────────────────────────────────

// Deposit options (in dollars)
export const DEPOSIT_OPTIONS = [
  { label: "$5", amount: 500 }, // cents
  { label: "$15", amount: 1500 },
  { label: "$30", amount: 3000 },
  { label: "$50", amount: 5000 },
] as const;

// Convert cents to display dollars
export function formatBalance(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Convert dollar cost to cents for deduction
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
