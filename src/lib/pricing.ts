// ── API Cost Constants (pass-through, at-cost pricing) ──────────────
// All costs in USD. Updated 2026-03-31.

export const API_COSTS = {
  placesSearch: 0.032, // Google Places Text Search per request
  placesDetails: 0.017, // Google Places Details per request
  youtube: 0, // YouTube Data API — free (quota-limited)
  braveSearch: 0.005, // Brave Search API per query
  apollo: 0.05, // Apollo.io per contact lookup
  hunter: 0.03, // Hunter.io per email verification
} as const;

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

export const LEAD_COUNT_OPTIONS = [10, 25, 50, 100] as const;

export function calculateSearchCost(
  numLeads: number,
  enrichment: EnrichmentOptions
): { baseCost: number; enrichmentCosts: Record<string, number>; total: number } {
  const baseCost =
    numLeads * API_COSTS.placesSearch + numLeads * API_COSTS.placesDetails;

  const enrichmentCosts: Record<string, number> = {};

  if (enrichment.youtube) {
    enrichmentCosts.youtube = numLeads * API_COSTS.youtube;
  }
  if (enrichment.braveSearch) {
    enrichmentCosts.braveSearch = numLeads * API_COSTS.braveSearch;
  }
  if (enrichment.apollo) {
    enrichmentCosts.apollo = numLeads * API_COSTS.apollo;
  }
  if (enrichment.hunter) {
    enrichmentCosts.hunter = numLeads * API_COSTS.hunter;
  }

  const enrichmentTotal = Object.values(enrichmentCosts).reduce(
    (sum, c) => sum + c,
    0
  );

  return {
    baseCost,
    enrichmentCosts,
    total: baseCost + enrichmentTotal,
  };
}

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
