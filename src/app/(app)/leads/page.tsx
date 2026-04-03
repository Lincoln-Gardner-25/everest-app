"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { saveLeadSearch, getPastSearches, type Lead, type LeadSearch } from "@/lib/leads";
import { useBalance } from "@/hooks/useBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Download,
  Search,
  MapPin,
  Star,
  Clock,
  Wallet,
  Ticket,
  Heart,
  Home,
  UtensilsCrossed,
  Building2,
  Dumbbell,
  Stethoscope,
  Car,
  Palette,
  ChevronLeft,
  ChevronRight,
  Map,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  Info,
  RotateCcw,
  Check,
} from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import AddFundsDialog from "@/components/leads/AddFundsDialog";
import InviteCodeDialog from "@/components/leads/InviteCodeDialog";
import {
  API_COSTS,
  calculateSearchCost,
  dollarsToCents,
  formatBalance,
  type EnrichmentOptions,
} from "@/lib/pricing";

// ── Constants ───────────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { label: "5 mi", miles: 5, meters: 8047 },
  { label: "10 mi", miles: 10, meters: 16093 },
  { label: "25 mi", miles: 25, meters: 40234 },
  { label: "50 mi", miles: 50, meters: 80467 },
];

const ZOOM_BY_MILES: Record<number, number> = { 5: 13, 10: 12, 25: 11, 50: 10 };

// Step 1 — Client type cards
const CLIENT_TYPES = [
  {
    id: "weddings-events",
    label: "Weddings & Events",
    description: "Planners, venues, bridal shops",
    icon: Heart,
    categories: ["wedding planners", "bridal shops", "event venues", "event planners", "banquet halls"],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    description: "Agencies, brokers, home builders",
    icon: Home,
    categories: ["real estate agencies", "home builders / contractors"],
  },
  {
    id: "restaurants-food",
    label: "Restaurants & Food",
    description: "Restaurants, hotels, resorts",
    icon: UtensilsCrossed,
    categories: ["restaurants", "hotels & resorts"],
  },
  {
    id: "corporate",
    label: "Corporate / B2B",
    description: "Law firms, offices, nonprofits",
    icon: Building2,
    categories: ["law firms", "nonprofits"],
  },
  {
    id: "fitness-wellness",
    label: "Fitness & Wellness",
    description: "Gyms, studios, spas, salons",
    icon: Dumbbell,
    categories: ["gyms & fitness studios", "spas & salons"],
  },
  {
    id: "dental-medical",
    label: "Dental & Medical",
    description: "Dental offices, clinics",
    icon: Stethoscope,
    categories: ["dental offices"],
  },
  {
    id: "automotive",
    label: "Automotive",
    description: "Car dealerships, auto shops",
    icon: Car,
    categories: ["car dealerships"],
  },
  {
    id: "creative-other",
    label: "Creative & Other",
    description: "Photography, music, art, churches",
    icon: Palette,
    categories: ["photography studios", "music studios", "art galleries", "churches"],
  },
];

const RATING_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "3+", value: 3 },
  { label: "4+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

const WEBSITE_OPTIONS = [
  { label: "Any", value: "any" },
  { label: "Yes", value: "yes" },
];

const SIZE_OPTIONS = [
  { label: "Any", value: "any" },
  { label: "Small", value: "small", desc: "< 50 reviews" },
  { label: "Medium", value: "medium", desc: "50-200" },
  { label: "Large", value: "large", desc: "200+" },
];

const LEAD_COUNTS = [10, 25, 50, 100] as const;

// ── Page Component ──────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth();

  // Wizard state
  const [step, setStep] = useState(1);
  const [selectedClientType, setSelectedClientType] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [radiusIdx, setRadiusIdx] = useState(1);
  const [minRating, setMinRating] = useState(0);
  const [hasWebsite, setHasWebsite] = useState<"any" | "yes">("any");
  const [businessSize, setBusinessSize] = useState<"any" | "small" | "medium" | "large">("any");
  const [numLeads, setNumLeads] = useState(25);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(25);
  const [customLeadInput, setCustomLeadInput] = useState("");
  const [enrichment, setEnrichment] = useState<EnrichmentOptions>({
    youtube: true,
    braveSearch: true,
    apollo: true,
    hunter: true,
  });

  // Search/results state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);

  // Past searches
  const [pastSearches, setPastSearches] = useState<LeadSearch[]>([]);
  const [pastLoading, setPastLoading] = useState(true);

  // Balance + paywall
  const { balance, loading: balanceLoading, hasInviteCode, hasPaymentMethod } = useBalance(user?.uid);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);
  // charging state removed — payment now handled server-side in /api/leads/search
  // Per-search coupon code (not persisted — must enter each time)
  const [activeCoupon, setActiveCoupon] = useState<string | null>(null);

  // Enrichment state
  const [enriching, setEnriching] = useState(false);

  // Map state
  const [showMap, setShowMap] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapInitializedRef = useRef(false);

  // Check for purchase success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      window.history.replaceState({}, "", "/leads");
    }
  }, []);

  // ── Load past searches ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getPastSearches(user.uid)
      .then(setPastSearches)
      .catch((err) => console.error("Failed to load past searches:", err))
      .finally(() => setPastLoading(false));
  }, [user]);

  // ── Init map when shown ───────────────────────────────────────
  useEffect(() => {
    if (!showMap || mapInitializedRef.current || !mapRef.current) return;
    mapInitializedRef.current = true;

    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      v: "weekly",
    });

    importLibrary("maps").then(({ Map }) => {
      if (!mapRef.current) return;
      mapInstanceRef.current = new Map(mapRef.current, {
        center: center || { lat: 39.5, lng: -98.35 },
        zoom: center ? (ZOOM_BY_MILES[RADIUS_OPTIONS[radiusIdx].miles] ?? 12) : 4,
        mapId: "everest-leads-map",
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });

      // If we already have leads, render them
      if (leads.length > 0 && center) {
        renderMapMarkers(center, leads, RADIUS_OPTIONS[radiusIdx].miles, RADIUS_OPTIONS[radiusIdx].meters);
      }
    });

    importLibrary("marker");
  }, [showMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render markers on map ─────────────────────────────────────
  const renderMapMarkers = useCallback(
    (
      mapCenter: { lat: number; lng: number },
      mapLeads: Lead[],
      radiusMiles: number,
      radiusMeters: number
    ) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
      circleRef.current?.setMap(null);
      infoWindowRef.current?.close();

      map.setCenter(mapCenter);
      map.setZoom(ZOOM_BY_MILES[radiusMiles] ?? 12);

      circleRef.current = new google.maps.Circle({
        map,
        center: mapCenter,
        radius: radiusMeters,
        fillColor: "#4A6FA5",
        fillOpacity: 0.08,
        strokeColor: "#4A6FA5",
        strokeOpacity: 0.4,
        strokeWeight: 1.5,
      });

      const iw = new google.maps.InfoWindow();
      infoWindowRef.current = iw;

      mapLeads.forEach((lead) => {
        const el = document.createElement("div");
        el.style.cursor = "pointer";

        if (lead.isStarLead) {
          el.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="#F5A623" stroke="#D4891A" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        } else {
          el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#4A6FA5" stroke="#fff" stroke-width="2"/></svg>`;
        }

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: lead.lat, lng: lead.lng },
          content: el,
          title: lead.name,
        });

        marker.addListener("click", () => {
          iw.setContent(buildInfoContent(lead));
          iw.open({ map, anchor: marker });
        });

        markersRef.current.push(marker);
      });
    },
    []
  );

  // ── Apply client-side filters to leads ────────────────────────
  function getFilteredLeads(): Lead[] {
    return leads.filter((l) => {
      if (minRating > 0 && (l.rating === null || l.rating < minRating)) return false;
      if (hasWebsite === "yes" && !l.website) return false;
      if (businessSize === "small" && l.totalRatings !== null && l.totalRatings >= 50) return false;
      if (businessSize === "medium" && (l.totalRatings === null || l.totalRatings < 50 || l.totalRatings > 200)) return false;
      if (businessSize === "large" && (l.totalRatings === null || l.totalRatings <= 200)) return false;
      return true;
    });
  }

  // ── Search handler ──────────────────────────────────────────────
  async function handleSearch() {
    if (!user || !location.trim() || !selectedClientType) return;

    const clientType = CLIENT_TYPES.find((c) => c.id === selectedClientType);
    if (!clientType) return;

    setLoading(true);
    setError("");

    // Payment is handled server-side in /api/leads/search — no client-side charge needed
    if (!activeCoupon && !hasInviteCode && !hasPaymentMethod) {
      setError("Please add a payment method in Settings before searching.");
      setLoading(false);
      return;
    }

    try {
      const radius = RADIUS_OPTIONS[radiusIdx];
      const token = await user.getIdToken();
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: location.trim(),
          radiusMeters: radius.meters,
          categories: clientType.categories,
          maxLeads: numLeads,
          enrichmentOptions: enrichment,
          couponCode: activeCoupon || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const newCenter = { lat: data.centerLat, lng: data.centerLng };

      setLeads(data.leads);
      setCenter(newCenter);
      setSearchDone(true);
      setShowResults(true);
      setDuplicatesRemoved(data.duplicatesRemoved ?? 0);
      setActiveCoupon(null); // Clear coupon after use

      // Save to Firestore
      await saveLeadSearch(user.uid, {
        location: location.trim(),
        radiusMiles: radius.miles,
        radiusMeters: radius.meters,
        categories: clientType.categories,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        leads: data.leads,
      });

      const updated = await getPastSearches(user.uid);
      setPastSearches(updated);

      // Trigger enrichment
      if (data.leads.length > 0 && (enrichment.youtube || enrichment.braveSearch || enrichment.apollo || enrichment.hunter)) {
        triggerEnrichment(data.leads, token);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Load past search ───────────────────────────────────────────
  function loadPastSearch(search: LeadSearch) {
    setLocation(search.location);
    setRadiusIdx(RADIUS_OPTIONS.findIndex((r) => r.miles === search.radiusMiles) ?? 1);
    setLeads(search.leads);
    setCenter({ lat: search.centerLat, lng: search.centerLng });
    setSearchDone(true);
    setShowResults(true);

    if (mapInstanceRef.current) {
      renderMapMarkers(
        { lat: search.centerLat, lng: search.centerLng },
        search.leads,
        search.radiusMiles,
        search.radiusMeters
      );
    }
  }

  // ── Trigger enrichment ─────────────────────────────────────────
  async function triggerEnrichment(searchLeads: Lead[], token: string) {
    const toEnrich = [...searchLeads]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((l) => ({ place_id: l.place_id, name: l.name, website: l.website }));

    if (toEnrich.length === 0) return;

    setEnriching(true);
    try {
      const res = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leads: toEnrich, enrichmentOptions: enrichment }),
      });

      if (!res.ok) return;

      const data = await res.json();
      const enrichedEntries: Array<[string, Lead]> = (data.enriched || []).map(
        (e: Lead) => [e.place_id, e] as [string, Lead]
      );
      const enrichedMap: Record<string, Lead> = Object.fromEntries(enrichedEntries);

      setLeads((prev) =>
        prev.map((l) => {
          const e = enrichedMap[l.place_id];
          if (!e) return l;
          const videoGapScore = e.videoGapScore || 0;
          const newScore = Math.max(1, Math.min(10, l.score + videoGapScore));
          return {
            ...l,
            ...e,
            score: newScore,
            isStarLead: newScore >= 7,
          };
        })
      );
    } catch (err) {
      console.error("Enrichment failed:", err);
    } finally {
      setEnriching(false);
    }
  }

  // ── CSV download ──────────────────────────────────────────────
  function downloadCSV() {
    const filtered = getFilteredLeads().sort((a, b) => b.score - a.score);
    const headers = [
      "Name", "Category", "Address", "Phone", "Email", "Website",
      "Google Rating", "Reviews", "Score", "Star Lead", "Source",
    ];
    const rows = filtered.map((l) => [
      `"${(l.name || "").replace(/"/g, '""')}"`,
      `"${(l.category || "").replace(/"/g, '""')}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      l.phone || "",
      l.contactEmail || "",
      l.website || "",
      l.rating ?? "",
      l.totalRatings ?? "",
      l.score,
      l.isStarLead ? "Yes" : "No",
      l.lat && l.lng ? "Google Maps" : "Web",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    a.download = `everest-leads-${location.replace(/\s+/g, "-").toLowerCase()}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Info window HTML ──────────────────────────────────────────
  function buildInfoContent(lead: Lead): string {
    return `
      <div style="max-width:280px;font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.5">
        <p style="font-weight:700;font-size:14px;margin:0 0 4px">${lead.name}</p>
        <p style="color:#666;margin:0 0 4px">${lead.address}</p>
        ${lead.phone ? `<p style="margin:0 0 2px">Phone: ${lead.phone}</p>` : ""}
        ${lead.website ? `<p style="margin:0 0 4px"><a href="${lead.website}" target="_blank" rel="noopener" style="color:#4A6FA5">Website</a></p>` : ""}
        <p style="margin:4px 0 2px"><strong>Score:</strong> ${lead.score}/10</p>
        <p style="color:#555;margin:0">${lead.reason}</p>
      </div>
    `;
  }

  // ── Reset wizard ──────────────────────────────────────────────
  function resetWizard() {
    setShowResults(false);
    setSearchDone(false);
    setLeads([]);
    setCenter(null);
    setStep(1);
    setSelectedClientType(null);
    setLocation("");
    setRadiusIdx(1);
    setMinRating(0);
    setHasWebsite("any");
    setBusinessSize("any");
    setNumLeads(25);
    setSelectedPreset(25);
    setCustomLeadInput("");
    setDuplicatesRemoved(0);
    setShowMap(false);
    setError("");
    setActiveCoupon(null);
    mapInitializedRef.current = false;
  }

  // ── Computed values ───────────────────────────────────────────
  const filteredLeads = searchDone ? getFilteredLeads() : [];
  const starCount = filteredLeads.filter((l) => l.isStarLead).length;
  const { total: totalCost } = calculateSearchCost(numLeads, enrichment);
  const totalCostCents = dollarsToCents(totalCost);
  const isFree = !!activeCoupon || hasInviteCode;
  const canProceed = isFree || hasPaymentMethod;

  // Score badge color
  function scoreBadgeClass(score: number): string {
    if (score >= 8) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (score >= 6) return "bg-amber-100 text-amber-800 border-amber-200";
    if (score >= 4) return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-red-100 text-red-800 border-red-200";
  }

  // ── Render ─────────────────────────────────────────────────────

  // RESULTS VIEW
  if (showResults) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Top bar */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={resetWizard}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              New Search
            </Button>
            <Button
              variant={showMap ? "default" : "outline"}
              size="sm"
              onClick={() => setShowMap(!showMap)}
            >
              <Map className="h-3.5 w-3.5 mr-1.5" />
              {showMap ? "Hide Map" : "View Map"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span>
                <span className="font-medium text-foreground">{filteredLeads.length} leads</span> found in {location}
                {starCount > 0 && (
                  <span className="ml-1.5">
                    — <span className="text-amber-600 font-medium">{starCount} star leads</span>
                  </span>
                )}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={downloadCSV} disabled={filteredLeads.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download CSV
            </Button>
          </div>
        </div>

        {/* Duplicates removed banner */}
        {duplicatesRemoved > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
            <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-800">
              {duplicatesRemoved} lead{duplicatesRemoved === 1 ? "" : "s"} you already have {duplicatesRemoved === 1 ? "was" : "were"} excluded from this search.
            </span>
          </div>
        )}

        {/* Enrichment indicator */}
        {enriching && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Enriching top leads with video gap analysis, contact info...</span>
          </div>
        )}

        {/* Google Map (hidden by default) */}
        {showMap && (
          <div className="mb-6">
            <div
              ref={mapRef}
              className="rounded-2xl border overflow-hidden w-full"
              style={{ height: 400 }}
            />
          </div>
        )}

        {/* Leads table */}
        {filteredLeads.length === 0 ? (
          <div className="rounded-2xl border bg-card p-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No leads found matching your criteria. Try adjusting your filters or searching a different area.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card overflow-hidden">
            {/* Table header */}
            <div className="hidden lg:grid lg:grid-cols-[60px_1fr_140px_140px_140px_100px_100px] gap-3 px-5 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Score</span>
              <span>Business</span>
              <span>Category</span>
              <span>Phone</span>
              <span>Email</span>
              <span>Rating</span>
              <span>Website</span>
            </div>

            {/* Table rows */}
            <div className="divide-y">
              {filteredLeads
                .sort((a, b) => b.score - a.score)
                .map((lead) => (
                  <div
                    key={lead.place_id}
                    className="group grid grid-cols-1 lg:grid-cols-[60px_1fr_140px_140px_140px_100px_100px] gap-2 lg:gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors items-center"
                  >
                    {/* Score */}
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${scoreBadgeClass(lead.score)}`}>
                        {lead.score}
                      </span>
                      {lead.isStarLead && (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500 lg:hidden" />
                      )}
                    </div>

                    {/* Business name + address */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm truncate">{lead.name}</span>
                        {lead.isStarLead && (
                          <Star className="hidden lg:block h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                        )}
                        {lead.lat && lead.lng ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-200 text-emerald-700 bg-emerald-50 flex-shrink-0 hidden sm:inline-flex">
                            Google Maps
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 hidden sm:inline-flex">
                            Web
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.address}</p>
                    </div>

                    {/* Category */}
                    <span className="text-xs text-muted-foreground capitalize truncate hidden lg:block">{lead.category}</span>

                    {/* Phone */}
                    <div className="hidden lg:block">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="text-xs text-foreground hover:text-primary flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{lead.phone}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>

                    {/* Email */}
                    <div className="hidden lg:block">
                      {lead.contactEmail ? (
                        <a href={`mailto:${lead.contactEmail}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{lead.contactEmail}</span>
                          {lead.emailVerified && (
                            <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          )}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>

                    {/* Rating */}
                    <div className="hidden lg:flex items-center gap-1">
                      {lead.rating != null ? (
                        <>
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-medium">{lead.rating.toFixed(1)}</span>
                          {lead.totalRatings != null && (
                            <span className="text-xs text-muted-foreground">({lead.totalRatings})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>

                    {/* Website */}
                    <div className="hidden lg:block">
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Globe className="h-3 w-3" />
                          <span className="truncate">Visit</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>

                    {/* Mobile details row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground lg:hidden col-span-full">
                      <span className="capitalize">{lead.category}</span>
                      {lead.rating != null && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          {lead.rating.toFixed(1)}
                        </span>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-foreground">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </a>
                      )}
                      {lead.website && (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Past searches at bottom */}
        <div className="mt-8 rounded-2xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground">Past Searches</h2>
          </div>
          {renderPastSearches()}
        </div>

        {/* Dialogs */}
        <AddFundsDialog
          open={showAddFunds}
          onClose={() => setShowAddFunds(false)}
          balance={balance}
          getIdToken={() => user!.getIdToken()}
        />
        <InviteCodeDialog
          open={showInviteCode}
          onClose={() => setShowInviteCode(false)}
          getIdToken={() => user!.getIdToken()}
          onSuccess={(code: string) => { setActiveCoupon(code); setError(""); }}
        />
      </div>
    );
  }

  // WIZARD VIEW
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-foreground mb-1"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Find Leads
          </h1>
          <p className="text-muted-foreground">Discover businesses that need videography services.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeCoupon && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Coupon applied (1 search)
            </div>
          )}
          <button
            onClick={() => setShowInviteCode(true)}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Ticket className="h-3 w-3" />
            {activeCoupon ? "Change code" : "Coupon code"}
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                s === step
                  ? "bg-primary text-primary-foreground"
                  : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 4 && (
              <div className={`w-8 sm:w-16 h-0.5 rounded ${s < step ? "bg-primary/40" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div>

        {/* ── Step 1: Client Type ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                What kind of clients are you looking for?
              </h2>
              <p className="text-sm text-muted-foreground">
                Select the industry that best matches your target clients.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CLIENT_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedClientType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => {
                      setSelectedClientType(type.id);
                      setTimeout(() => setStep(2), 200);
                    }}
                    className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{type.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Location ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Where do you want to find them?
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter a city, state, or zip code to center your search.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Location</label>
                <Input
                  placeholder="e.g. Provo, Utah or 84604"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  autoFocus
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Search Radius</label>
                <div className="flex gap-2">
                  {RADIUS_OPTIONS.map((r, i) => (
                    <button
                      key={r.miles}
                      type="button"
                      onClick={() => setRadiusIdx(i)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        i === radiusIdx
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!location.trim()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Filters ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Refine your results
              </h2>
              <p className="text-sm text-muted-foreground">
                Optional filters to narrow down the best leads.
              </p>
            </div>

            {/* Min Google Rating */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Minimum Google Rating</label>
              <div className="flex gap-2">
                {RATING_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setMinRating(opt.value)}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      minRating === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Has Website */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">Has Website</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px]">Businesses without websites often need video content most</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2">
                {WEBSITE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setHasWebsite(opt.value as "any" | "yes")}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      hasWebsite === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Business Size */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Business Size (by reviews)</label>
              <div className="flex gap-2">
                {SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBusinessSize(opt.value as "any" | "small" | "medium" | "large")}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      businessSize === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.desc && (
                      <span className="block text-[10px] mt-0.5 opacity-80">{opt.desc}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={() => setStep(4)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Lead Count + Enrichment + Purchase ──────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                How many leads do you need?
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose a package and optional enrichment add-ons.
              </p>
            </div>

            {/* Lead count presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LEAD_COUNTS.map((count) => {
                const cost = calculateSearchCost(count, enrichment);
                return (
                  <button
                    key={count}
                    onClick={() => {
                      setNumLeads(count);
                      setSelectedPreset(count);
                      setCustomLeadInput("");
                    }}
                    className={`rounded-xl border-2 p-4 text-center transition-all ${
                      selectedPreset === count
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <p className="text-2xl font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground mt-1">leads</p>
                    <p className="text-sm font-semibold text-primary mt-2">${cost.total.toFixed(2)}</p>
                  </button>
                );
              })}
            </div>

            {/* Custom lead count input */}
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <label className="text-sm font-medium text-foreground">
                Or enter a custom amount
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  placeholder="e.g. 75"
                  value={customLeadInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomLeadInput(val);
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num >= 1 && num <= 500) {
                      setNumLeads(num);
                      setSelectedPreset(null);
                    } else if (val === "") {
                      // If cleared, revert to default preset
                      setNumLeads(25);
                      setSelectedPreset(25);
                    }
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  leads (1&ndash;500)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                ${(calculateSearchCost(1, enrichment).total).toFixed(3)}/lead base
                {customLeadInput && !selectedPreset && (
                  <span className="ml-2 font-medium text-foreground">
                    = ${calculateSearchCost(numLeads, enrichment).total.toFixed(2)} total
                  </span>
                )}
              </p>
            </div>

            {/* Enrichment toggles */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Enrichment Add-ons</h3>
              <div className="space-y-2">
                {/* YouTube */}
                <label className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enrichment.youtube}
                      onChange={() => setEnrichment((e) => ({ ...e, youtube: !e.youtube }))}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">YouTube Analysis</span>
                  </div>
                  <span className="text-xs font-medium text-emerald-600">FREE</span>
                </label>

                {/* Apollo */}
                <label className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enrichment.apollo}
                      onChange={() => setEnrichment((e) => ({ ...e, apollo: !e.apollo, hunter: !e.apollo }))}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">Email Finder (Apollo + Hunter)</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ${(API_COSTS.apollo + API_COSTS.hunter).toFixed(2)}/lead
                  </span>
                </label>

                {/* Brave */}
                <label className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enrichment.braveSearch}
                      onChange={() => setEnrichment((e) => ({ ...e, braveSearch: !e.braveSearch }))}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">Web Presence (Brave)</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ${API_COSTS.braveSearch.toFixed(3)}/lead
                  </span>
                </label>
              </div>
            </div>

            {/* Total cost prominent display */}
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total cost</p>
                {isFree ? (
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-emerald-600">FREE</p>
                    <p className="text-sm text-muted-foreground line-through">${totalCost.toFixed(2)}</p>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-foreground">${totalCost.toFixed(2)}</p>
                )}
              </div>
              <div className="text-right">
                {isFree ? (
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-semibold">Coupon applied</span>
                  </div>
                ) : hasPaymentMethod ? (
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-semibold">Card on file</span>
                  </div>
                ) : (
                  <span className="text-sm text-red-600 font-medium">No card on file</span>
                )}
              </div>
            </div>

            {/* No payment method warning */}
            {!isFree && !hasPaymentMethod && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">No payment method</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Add a card in Settings to purchase leads, or enter a coupon code.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-800 border-amber-300 hover:bg-amber-100"
                      onClick={() => window.location.href = "/settings"}
                    >
                      <Wallet className="h-3.5 w-3.5 mr-1.5" />
                      Go to Settings
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-800 border-amber-300 hover:bg-amber-100"
                      onClick={() => setShowInviteCode(true)}
                    >
                      <Ticket className="h-3.5 w-3.5 mr-1.5" />
                      Enter Coupon
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                size="lg"
                onClick={handleSearch}
                disabled={loading || !canProceed}
                className="flex-1 h-12 text-base font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : isFree ? (
                  <>
                    <Search className="h-5 w-5 mr-2" />
                    Get {numLeads} Leads — Free
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5 mr-2" />
                    Get {numLeads} Leads for ${totalCost.toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Past Searches (below wizard) */}
      <div className="mt-12 max-w-3xl rounded-2xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Past Searches</h2>
        </div>
        {renderPastSearches()}
      </div>

      {/* Dialogs */}
      <AddFundsDialog
        open={showAddFunds}
        onClose={() => setShowAddFunds(false)}
        balance={balance}
        getIdToken={() => user!.getIdToken()}
      />
      <InviteCodeDialog
        open={showInviteCode}
        onClose={() => setShowInviteCode(false)}
        getIdToken={() => user!.getIdToken()}
        onSuccess={() => {}}
      />
    </div>
  );

  // ── Shared past searches renderer ──────────────────────────────
  function renderPastSearches() {
    if (pastLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (pastSearches.length === 0) {
      return <p className="text-sm text-muted-foreground">No past searches yet.</p>;
    }

    return (
      <div className="space-y-2">
        {pastSearches.slice(0, 5).map((s) => (
          <button
            key={s.id}
            onClick={() => loadPastSearch(s)}
            className="w-full text-left rounded-xl border bg-background p-3 hover:bg-muted/50 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">{s.location}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{s.radiusMiles} mi</span>
              <span>{s.totalLeads} leads</span>
              {s.starLeads > 0 && (
                <span className="text-amber-600 font-medium">{s.starLeads} star</span>
              )}
              <span>
                {s.createdAt?.toDate
                  ? s.createdAt.toDate().toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }
}
