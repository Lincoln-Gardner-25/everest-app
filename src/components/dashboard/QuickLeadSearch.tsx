"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Search, Star, Phone, Globe, ExternalLink, Loader2, MapPin, AlertCircle } from "lucide-react";

interface Lead {
  place_id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  score: number;
  isStarLead: boolean;
  reason?: string;
}

const CLIENT_TYPES = [
  { id: "weddings-events", label: "Weddings & Events", categories: ["wedding planners", "bridal shops", "event venues"] },
  { id: "real-estate", label: "Real Estate", categories: ["real estate agencies", "home builders / contractors"] },
  { id: "restaurants-food", label: "Restaurants & Food", categories: ["restaurants", "hotels & resorts"] },
  { id: "corporate", label: "Corporate / B2B", categories: ["law firms", "nonprofits"] },
  { id: "fitness-wellness", label: "Fitness & Wellness", categories: ["gyms & fitness studios", "spas & salons"] },
  { id: "dental-medical", label: "Dental & Medical", categories: ["dental offices", "medical clinics"] },
  { id: "automotive", label: "Automotive", categories: ["car dealerships", "auto repair shops"] },
  { id: "creative", label: "Creative & Retail", categories: ["art galleries", "boutique retail"] },
];

export function QuickLeadSearch() {
  const { user } = useAuth();
  const [location, setLocation] = useState("");
  const [clientTypeId, setClientTypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Called after the user confirms the cost disclaimer
  async function runSearch() {
    const clientType = CLIENT_TYPES.find((c) => c.id === clientTypeId);
    if (!clientType) return;

    setShowConfirm(false);
    setLoading(true);
    setError(null);
    setLeads(null);

    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          location,
          radiusMeters: 16093, // 10 miles default
          categories: clientType.categories,
          maxLeads: 10,
          enrichmentOptions: {},
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Search failed");
      }

      const data = await res.json();
      setLeads((data.leads ?? []).slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try the full Leads tab.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!location || !clientTypeId) return;
    // Show cost disclaimer first — runSearch() is called on confirm
    setShowConfirm(true);
  }

  const starLeads = leads?.filter((l) => l.isStarLead) ?? [];

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary/15 flex items-center justify-center">
            <Search className="h-5 w-5" style={{ color: "oklch(0.73 0.11 192)" }} />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Find Leads</h2>
            <p className="text-xs text-muted-foreground">
              AI-scored leads in your area
            </p>
          </div>
        </div>
        <Link
          href="/leads"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Full search
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="City or zip code..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border bg-background pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={clientTypeId}
          onChange={(e) => setClientTypeId(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:w-44"
        >
          <option value="">Client type...</option>
          {CLIENT_TYPES.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.label}</option>
          ))}
        </select>
        <Button type="submit" disabled={loading || !location || !clientTypeId} size="sm" className="h-9">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {/* Confirm / cost disclaimer */}
      {showConfirm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 mb-0.5">
              This search costs ~$0.50–$1
            </p>
            <p className="text-xs text-amber-700">
              Charged to your Everest balance or card on file. For full controls
              and pricing, use the{" "}
              <Link href="/leads" className="underline font-medium">
                Leads tab
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowConfirm(false)}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Cancel
            </button>
            <Button size="sm" onClick={runSearch} className="h-7 text-xs">
              Confirm &amp; Search
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive mb-3">{error}</p>
      )}

      {/* Results */}
      {leads !== null && (
        <>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No leads found. Try a different location or client type.
            </p>
          ) : (
            <>
              {starLeads.length > 0 && (
                <p className="text-xs text-muted-foreground mb-2">
                  <Star className="h-3 w-3 inline mr-1 text-amber-500 fill-amber-500" />
                  {starLeads.length} high-scoring lead{starLeads.length !== 1 ? "s" : ""} found
                </p>
              )}
              <div className="divide-y rounded-xl border overflow-hidden">
                {leads.map((lead) => (
                  <div key={lead.place_id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {lead.isStarLead && (
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {lead.name}
                        </span>
                        <span className="text-xs font-semibold text-primary shrink-0">
                          {lead.score}/10
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{lead.address}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-muted-foreground hover:text-foreground"
                          title={lead.phone}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {lead.website && (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-right">
                <Link href="/leads" className="text-primary hover:underline">
                  View all results with full map →
                </Link>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
