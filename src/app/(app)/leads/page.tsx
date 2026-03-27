"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { saveLeadSearch, getPastSearches, type Lead, type LeadSearch } from "@/lib/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Search, MapPin, Star, Clock } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// ── Constants ───────────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { label: "5 miles", miles: 5, meters: 8047 },
  { label: "10 miles", miles: 10, meters: 16093 },
  { label: "25 miles", miles: 25, meters: 40234 },
  { label: "50 miles", miles: 50, meters: 80467 },
];

const ZOOM_BY_MILES: Record<number, number> = { 5: 13, 10: 12, 25: 11, 50: 10 };

const CATEGORIES = {
  "Weddings & Events": [
    "Wedding planners",
    "Bridal shops",
    "Event venues",
    "Event planners",
    "Banquet halls",
  ],
  "Business Ads": [
    "Real estate agencies",
    "Restaurants",
    "Hotels & resorts",
    "Car dealerships",
    "Home builders / contractors",
    "Dental offices",
    "Gyms & fitness studios",
    "Law firms",
    "Spas & salons",
  ],
  "Niche / Creative": [
    "Photography studios",
    "Music studios",
    "Art galleries",
    "Nonprofits",
    "Churches",
  ],
};

// ── Page Component ──────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth();

  // Form state
  const [location, setLocation] = useState("");
  const [radiusIdx, setRadiusIdx] = useState(1); // default 10 miles
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Results state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  // Past searches
  const [pastSearches, setPastSearches] = useState<LeadSearch[]>([]);
  const [pastLoading, setPastLoading] = useState(true);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapLoadedRef = useRef(false);

  // ── Load past searches ──────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    getPastSearches(user.uid)
      .then(setPastSearches)
      .catch((err) => console.error("Failed to load past searches:", err))
      .finally(() => setPastLoading(false));
  }, [user]);

  // ── Init map ────────────────────────────────────────────────────

  useEffect(() => {
    if (mapLoadedRef.current || !mapRef.current) return;
    mapLoadedRef.current = true;

    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      v: "weekly",
    });

    importLibrary("maps").then(({ Map }) => {
      if (!mapRef.current) return;
      mapInstanceRef.current = new Map(mapRef.current, {
        center: { lat: 39.5, lng: -98.35 },
        zoom: 4,
        mapId: "everest-leads-map",
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });
    });

    // Pre-load marker library
    importLibrary("marker");
  }, []);

  // ── Category toggle ─────────────────────────────────────────────

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // ── Update map with leads ───────────────────────────────────────

  const updateMap = useCallback(
    (
      newCenter: { lat: number; lng: number },
      newLeads: Lead[],
      radiusMiles: number,
      radiusMeters: number
    ) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      // Clear previous
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
      circleRef.current?.setMap(null);
      infoWindowRef.current?.close();

      // Center + zoom
      map.setCenter(newCenter);
      map.setZoom(ZOOM_BY_MILES[radiusMiles] ?? 12);

      // Radius circle
      circleRef.current = new google.maps.Circle({
        map,
        center: newCenter,
        radius: radiusMeters,
        fillColor: "#4A90E2",
        fillOpacity: 0.08,
        strokeColor: "#4A90E2",
        strokeOpacity: 0.4,
        strokeWeight: 1.5,
      });

      // Info window (shared)
      const iw = new google.maps.InfoWindow();
      infoWindowRef.current = iw;

      // Pins
      newLeads.forEach((lead) => {
        const el = document.createElement("div");
        el.style.cursor = "pointer";

        if (lead.isStarLead) {
          el.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="#F5A623" stroke="#D4891A" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        } else {
          el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#4A90E2" stroke="#fff" stroke-width="2"/></svg>`;
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

  // ── Search handler ──────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !location.trim() || selectedCategories.size === 0) return;

    setLoading(true);
    setError("");

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
          categories: Array.from(selectedCategories).map((c) => c.toLowerCase()),
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

      updateMap(newCenter, data.leads, radius.miles, radius.meters);

      // Save to Firestore
      await saveLeadSearch(user.uid, {
        location: location.trim(),
        radiusMiles: radius.miles,
        radiusMeters: radius.meters,
        categories: Array.from(selectedCategories),
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        leads: data.leads,
      });

      // Refresh past searches
      const updated = await getPastSearches(user.uid);
      setPastSearches(updated);
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
    setSelectedCategories(new Set(search.categories));
    setLeads(search.leads);
    setCenter({ lat: search.centerLat, lng: search.centerLng });
    setSearchDone(true);

    updateMap(
      { lat: search.centerLat, lng: search.centerLng },
      search.leads,
      search.radiusMiles,
      search.radiusMeters
    );
  }

  // ── Promote lead ───────────────────────────────────────────────

  function promoteLead(placeId: string) {
    setLeads((prev) =>
      prev.map((l) =>
        l.place_id === placeId ? { ...l, isStarLead: true, score: Math.max(l.score, 7) } : l
      )
    );
    // Update the marker visually
    const idx = leads.findIndex((l) => l.place_id === placeId);
    if (idx >= 0 && markersRef.current[idx]) {
      const el = markersRef.current[idx].content as HTMLElement;
      if (el) {
        el.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="#F5A623" stroke="#D4891A" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      }
    }
  }

  // ── Excel download ─────────────────────────────────────────────

  async function downloadExcel() {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Leads");

    sheet.columns = [
      { header: "Business Name", key: "name", width: 30 },
      { header: "Category", key: "category", width: 20 },
      { header: "Address", key: "address", width: 35 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Website", key: "website", width: 35 },
      { header: "Google Rating", key: "rating", width: 14 },
      { header: "Total Reviews", key: "totalRatings", width: 14 },
      { header: "Score", key: "score", width: 10 },
      { header: "Reason", key: "reason", width: 40 },
      { header: "Lead Quality", key: "quality", width: 14 },
    ];

    // Header style
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A6FA5" } };
      cell.alignment = { horizontal: "center" };
    });

    // Sort: stars first (desc score), then standard (desc score)
    const sorted = [...leads].sort((a, b) => {
      if (a.isStarLead !== b.isStarLead) return a.isStarLead ? -1 : 1;
      return b.score - a.score;
    });

    sorted.forEach((lead) => {
      const row = sheet.addRow({
        name: lead.name,
        category: lead.category,
        address: lead.address,
        phone: lead.phone || "",
        website: lead.website || "",
        rating: lead.rating ?? "",
        totalRatings: lead.totalRatings ?? "",
        score: lead.score,
        reason: lead.reason,
        quality: lead.isStarLead ? "⭐ High Value" : "Standard",
      });
      if (lead.isStarLead) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEA" } };
        });
      }
    });

    // Summary row
    const starCount = leads.filter((l) => l.isStarLead).length;
    sheet.addRow([]);
    sheet.addRow([`Total leads: ${leads.length} | High-value leads: ${starCount}`]);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Everest-Leads-${location.replace(/\s+/g, "-")}-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Info window HTML ───────────────────────────────────────────

  function buildInfoContent(lead: Lead): string {
    return `
      <div style="max-width:280px;font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.5">
        <p style="font-weight:700;font-size:14px;margin:0 0 4px">${lead.name}</p>
        <p style="color:#666;margin:0 0 4px">${lead.address}</p>
        ${lead.phone ? `<p style="margin:0 0 2px">📞 ${lead.phone}</p>` : ""}
        ${lead.website ? `<p style="margin:0 0 4px"><a href="${lead.website}" target="_blank" rel="noopener" style="color:#4A6FA5">🔗 Website</a></p>` : ""}
        <p style="margin:4px 0 2px"><strong>Score:</strong> ${lead.score}/10</p>
        <p style="color:#555;margin:0 0 6px">${lead.reason}</p>
        ${!lead.isStarLead ? `<button onclick="window.__promoteLead&&window.__promoteLead('${lead.place_id}')" style="background:#F5A623;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">⭐ Promote</button>` : '<span style="color:#F5A623;font-weight:600">⭐ High-Value Lead</span>'}
      </div>
    `;
  }

  // Expose promote function globally for InfoWindow buttons
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__promoteLead = promoteLead;
    return () => {
      delete (window as unknown as Record<string, unknown>).__promoteLead;
    };
  });

  // ── Render ─────────────────────────────────────────────────────

  const starCount = leads.filter((l) => l.isStarLead).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold text-foreground mb-1"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Leads
        </h1>
        <p className="text-muted-foreground">Find businesses that need videography services.</p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6" style={{ minHeight: "calc(100vh - 180px)" }}>
        {/* LEFT COLUMN */}
        <div className="w-full lg:w-[35%] space-y-4 overflow-y-auto">
          {/* Input Panel */}
          <form onSubmit={handleSearch} className="rounded-2xl border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Search className="h-4 w-4 text-primary" />
              </div>
              <h2 className="font-semibold text-foreground">Find Leads</h2>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. Provo, Utah"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            {/* Radius */}
            <div className="space-y-2">
              <Label>Search Radius</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {RADIUS_OPTIONS.map((r, i) => (
                  <button
                    key={r.miles}
                    type="button"
                    onClick={() => setRadiusIdx(i)}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-colors ${
                      i === radiusIdx
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3">
              <Label>Business Types</Label>
              {Object.entries(CATEGORIES).map(([group, cats]) => (
                <div key={group}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    {group}
                  </p>
                  <div className="space-y-1">
                    {cats.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCategories.has(cat)}
                          onChange={() => toggleCategory(cat)}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={loading || !location.trim() || selectedCategories.size === 0} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Leads
                </>
              )}
            </Button>
          </form>

          {/* Results Summary */}
          {searchDone && leads.length > 0 && (
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Found {leads.length} leads · {starCount} high-value{" "}
                <Star className="inline h-3.5 w-3.5 text-amber-500 -mt-0.5" />
              </p>
            </div>
          )}

          {/* Empty state */}
          {searchDone && leads.length === 0 && !loading && (
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                No leads found in this area. Try expanding the radius or adding more business types.
              </p>
            </div>
          )}

          {/* Past Searches */}
          <div className="rounded-2xl border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <h2 className="font-semibold text-foreground">Past Searches</h2>
            </div>

            {pastLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : pastSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past searches yet.</p>
            ) : (
              <div className="space-y-2">
                {pastSearches.map((s) => (
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
                        <span className="text-amber-600">{s.starLeads} ⭐</span>
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
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Map */}
        <div className="w-full lg:w-[65%] relative">
          <div
            ref={mapRef}
            className="rounded-2xl border overflow-hidden w-full"
            style={{ height: "calc(100vh - 180px)", minHeight: 400 }}
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 rounded-2xl bg-background/70 flex flex-col items-center justify-center gap-3 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">
                Searching for leads and scoring results...
              </p>
            </div>
          )}

          {/* Download button */}
          {searchDone && leads.length > 0 && !loading && (
            <button
              onClick={downloadExcel}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 text-sm font-medium shadow-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Leads
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
