"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { DollarSign } from "lucide-react";
import {
  API_COSTS,
  LEAD_COUNT_OPTIONS,
  calculateSearchCost,
  formatBalance,
  type EnrichmentOptions,
} from "@/lib/pricing";

interface CostCalculatorProps {
  balance: number; // cents
  hasInviteCode: boolean;
  onConfigChange: (numLeads: number, enrichment: EnrichmentOptions) => void;
}

const ENRICHMENT_ITEMS = [
  {
    key: "youtube" as const,
    label: "Video Gap Detection (YouTube)",
    costPerLead: API_COSTS.youtube,
    isFree: true,
  },
  {
    key: "braveSearch" as const,
    label: "Tech Stack Scan (Brave)",
    costPerLead: API_COSTS.braveSearch,
    isFree: false,
  },
  {
    key: "apollo" as const,
    label: "Contact Finder (Apollo)",
    costPerLead: API_COSTS.apollo,
    isFree: false,
  },
  {
    key: "hunter" as const,
    label: "Email Verify (Hunter)",
    costPerLead: API_COSTS.hunter,
    isFree: false,
  },
];

export default function CostCalculator({
  balance,
  hasInviteCode,
  onConfigChange,
}: CostCalculatorProps) {
  const [numLeads, setNumLeads] = useState(25);
  const [enrichment, setEnrichment] = useState<EnrichmentOptions>({
    youtube: true,
    braveSearch: true,
    apollo: true,
    hunter: true,
  });

  const { baseCost, enrichmentCosts, total } = calculateSearchCost(
    numLeads,
    enrichment
  );

  function toggleEnrichment(key: keyof EnrichmentOptions) {
    const next = { ...enrichment, [key]: !enrichment[key] };
    setEnrichment(next);
    onConfigChange(numLeads, next);
  }

  function selectLeadCount(count: number) {
    setNumLeads(count);
    onConfigChange(count, enrichment);
  }

  const totalCents = Math.round(total * 100);
  const canAfford = hasInviteCode || balance >= totalCents;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <DollarSign className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          Estimated Search Cost
        </h3>
      </div>

      {/* Lead count selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">Leads to find</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {LEAD_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => selectLeadCount(count)}
              className={`text-xs py-1.5 rounded-lg border transition-colors ${
                count === numLeads
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* Enrichment toggles */}
      <div className="space-y-1.5">
        <Label className="text-xs">Enrichment</Label>
        <div className="space-y-1">
          {ENRICHMENT_ITEMS.map((item) => {
            const cost = enrichmentCosts[item.key] ?? item.costPerLead * numLeads;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enrichment[item.key]}
                    onChange={() => toggleEnrichment(item.key)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-foreground">{item.label}</span>
                </div>
                <span
                  className={
                    item.isFree
                      ? "text-green-600 font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {item.isFree
                    ? "FREE"
                    : enrichment[item.key]
                    ? `$${cost.toFixed(2)}`
                    : "—"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="border-t pt-2 space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Base search cost</span>
          <span>${baseCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-foreground">
          <span>Total estimated cost</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Balance */}
      <div
        className={`flex justify-between items-center text-xs rounded-lg px-2 py-1.5 ${
          canAfford
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700"
        }`}
      >
        <span>Balance</span>
        <span className="font-medium">
          {hasInviteCode ? "Dev Mode (unlimited)" : formatBalance(balance)}
        </span>
      </div>
    </div>
  );
}
