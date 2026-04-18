import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe";

import { calculateSearchCost, calculateActualCost, dollarsToCents, LEAD_COUNT_OPTIONS, type EnrichmentOptions } from "@/lib/pricing";
import { FieldValue } from "firebase-admin/firestore";

// Allow up to 60s for large searches (500 leads)
export const maxDuration = 60;

function getGoogleKey() { return process.env.GOOGLE_PLACES_API_KEY || ""; }

// ── Admin shortfall email (Resend API — free tier, no SDK needed) ──
async function sendShortfallEmail(
  to: string,
  data: {
    userId: string;
    location: string;
    categories: string[];
    requestedLeads: number;
    deliveredLeads: number;
    shortfall: number;
    lowQualityCount: number;
    chargeCents: number;
    shortfallRefundCents: number;
    qualityRefundCents: number;
    totalRefundCents: number;
    refundedVia: string | null;
    paidVia: string;
    actualApiCalls: number;
    duplicatesRemoved: number;
  }
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[SHORTFALL] RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const subject = `[Everest] Lead issue: ${data.deliveredLeads}/${data.requestedLeads} delivered, ${data.lowQualityCount} low-quality in ${data.location}`;
  const body = `
    <h2>Lead Search Alert</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;">
      <tr><td style="padding:4px 12px;font-weight:bold;">Location</td><td style="padding:4px 12px;">${data.location}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Categories</td><td style="padding:4px 12px;">${data.categories.join(", ")}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Requested</td><td style="padding:4px 12px;">${data.requestedLeads} leads</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Delivered</td><td style="padding:4px 12px;">${data.deliveredLeads} leads</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;color:#dc2626;">Shortfall</td><td style="padding:4px 12px;color:#dc2626;">${data.shortfall} leads</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;color:#d97706;">Low quality (no web/phone)</td><td style="padding:4px 12px;color:#d97706;">${data.lowQualityCount} leads</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Charged</td><td style="padding:4px 12px;">$${(data.chargeCents / 100).toFixed(2)}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;color:#16a34a;">Shortfall refund</td><td style="padding:4px 12px;color:#16a34a;">$${(data.shortfallRefundCents / 100).toFixed(2)}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;color:#16a34a;">Quality refund (margin only)</td><td style="padding:4px 12px;color:#16a34a;">$${(data.qualityRefundCents / 100).toFixed(2)}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;color:#16a34a;">Total refunded</td><td style="padding:4px 12px;color:#16a34a;">$${(data.totalRefundCents / 100).toFixed(2)} via ${data.refundedVia || "n/a"}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Paid via</td><td style="padding:4px 12px;">${data.paidVia}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">API calls</td><td style="padding:4px 12px;">${data.actualApiCalls}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">Dupes removed</td><td style="padding:4px 12px;">${data.duplicatesRemoved}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:bold;">User ID</td><td style="padding:4px 12px;font-size:12px;">${data.userId}</td></tr>
    </table>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "Everest Alerts <alerts@everest-app.com>",
      to,
      subject,
      html: body,
    }),
  });
}

// ── Rate limiting (Firestore-backed, per-user) ─────────────────────
const MAX_REQUESTS_PER_HOUR = 10;

async function checkRateLimit(userId: string): Promise<boolean> {
  const now = Date.now();
  const docRef = adminDb.doc(`rateLimits/search_${userId}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();

    if (!data || now > data.resetAt) {
      tx.set(docRef, { count: 1, resetAt: now + 60 * 60 * 1000 });
      return true;
    }

    if (data.count >= MAX_REQUESTS_PER_HOUR) return false;

    tx.update(docRef, { count: FieldValue.increment(1) });
    return true;
  });
}

// ── Input validation constants ──────────────────────────────────────
const MAX_CATEGORIES = 19;
const MAX_RADIUS_METERS = 160_934; // ~100 miles
const MAX_LOCATION_LENGTH = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CATEGORY_QUERIES: Record<string, string> = {
  "wedding planners": "wedding planner",
  "bridal shops": "bridal shop",
  "event venues": "event venue",
  "event planners": "event planner",
  "banquet halls": "banquet hall",
  "real estate agencies": "real estate agency",
  restaurants: "restaurant",
  "hotels & resorts": "hotel resort",
  "car dealerships": "car dealership",
  "home builders / contractors": "home builder contractor",
  "dental offices": "dental office",
  "gyms & fitness studios": "gym fitness studio",
  "law firms": "law firm",
  "spas & salons": "spa salon",
  "photography studios": "photography studio",
  "music studios": "music studio",
  "art galleries": "art gallery",
  nonprofits: "nonprofit organization",
  churches: "church",
};

// Fields we request from Places API (New)
const PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.websiteUri",
].join(",");

interface RawLead {
  place_id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  totalRatings: number | null;
  lat: number;
  lng: number;
  category: string;
}

// ── Geocode using Places API (New) Text Search ─────────────────────
async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleKey(),
      "X-Goog-FieldMask": "places.location,places.displayName",
    },
    body: JSON.stringify({ textQuery: location, maxResultCount: 1 }),
  });
  const data = await res.json();
  const place = data.places?.[0];
  if (!place?.location) return null;
  return { lat: place.location.latitude, lng: place.location.longitude };
}

// ── Search places by category using Places API (New) ───────────────
// Supports pagination via pageToken to fetch beyond the 20-result limit.
// Returns results + apiCallCount so the caller can track cost.

type PlaceResult = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  totalRatings: number | null;
  lat: number;
  lng: number;
};

function buildLocationConstraint(center: { lat: number; lng: number }, radiusMeters: number) {
  if (radiusMeters <= 50000) {
    return {
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    };
  }
  return {
    locationRestriction: {
      rectangle: {
        low: {
          latitude: center.lat - radiusMeters / 111320,
          longitude: center.lng - radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180)),
        },
        high: {
          latitude: center.lat + radiusMeters / 111320,
          longitude: center.lng + radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180)),
        },
      },
    },
  };
}

function parsePlaces(
  places: Array<Record<string, unknown>>,
  fallbackCenter: { lat: number; lng: number }
): PlaceResult[] {
  return places.map((p) => ({
    id: p.id as string,
    name: ((p.displayName as { text?: string })?.text) || "Unknown",
    address: (p.formattedAddress as string) || "",
    phone: (p.nationalPhoneNumber as string) || null,
    website: (p.websiteUri as string) || null,
    rating: (p.rating as number) ?? null,
    totalRatings: (p.userRatingCount as number) ?? null,
    lat: ((p.location as { latitude?: number })?.latitude) ?? fallbackCenter.lat,
    lng: ((p.location as { longitude?: number })?.longitude) ?? fallbackCenter.lng,
  }));
}

async function searchPlaces(
  query: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  maxResults: number = 20
): Promise<{ results: PlaceResult[]; apiCalls: number }> {
  const allResults: PlaceResult[] = [];
  let apiCalls = 0;
  const locationConstraint = buildLocationConstraint(center, radiusMeters);

  // First request
  const firstRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleKey(),
      "X-Goog-FieldMask": PLACE_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      ...locationConstraint,
      maxResultCount: 20,
    }),
  });
  apiCalls++;

  const firstData = await firstRes.json();
  if (firstData.error) {
    console.error("Places API error:", firstData.error.message);
    return { results: [], apiCalls };
  }

  allResults.push(...parsePlaces(firstData.places || [], center));

  // Paginate if we need more and a nextPageToken is available
  // Places API (New) doesn't support pageToken on Text Search,
  // so we stop after one call per query. The caller handles
  // multiple query variations to accumulate more results.

  return { results: allResults.slice(0, maxResults), apiCalls };
}

export async function POST(req: NextRequest) {
  try {
    // Verify Firebase auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let userId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Rate limit: max 10 searches per hour per user (Firestore-backed)
    if (!(await checkRateLimit(userId))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 searches per hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { location, radiusMeters, categories, maxLeads, enrichmentOptions } = body as {
      location: string;
      radiusMeters: number;
      categories: string[];
      maxLeads?: number;
      enrichmentOptions?: EnrichmentOptions;
    };

    // ── Input validation FIRST (before payment, so invalid requests aren't charged) ──
    if (!location || !radiusMeters || !categories?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (typeof location !== "string" || location.length > MAX_LOCATION_LENGTH) {
      return NextResponse.json(
        { error: "Location must be a string under 200 characters" },
        { status: 400 }
      );
    }
    if (typeof radiusMeters !== "number" || radiusMeters <= 0 || radiusMeters > MAX_RADIUS_METERS) {
      return NextResponse.json(
        { error: "Radius must be between 1 and 160,934 meters (~100 miles)" },
        { status: 400 }
      );
    }
    if (!Array.isArray(categories) || categories.length > MAX_CATEGORIES) {
      return NextResponse.json(
        { error: `Categories must be an array of 1-${MAX_CATEGORIES} items` },
        { status: 400 }
      );
    }
    const validCategories = Object.keys(CATEGORY_QUERIES);
    for (const cat of categories) {
      if (typeof cat !== "string" || !validCategories.includes(cat)) {
        return NextResponse.json(
          { error: `Invalid category: ${cat}` },
          { status: 400 }
        );
      }
    }
    if (maxLeads !== undefined && !LEAD_COUNT_OPTIONS.includes(maxLeads as typeof LEAD_COUNT_OPTIONS[number])) {
      return NextResponse.json(
        { error: `maxLeads must be one of: ${LEAD_COUNT_OPTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Geocode FIRST (before payment, so we don't charge for invalid locations) ──
    const center = await geocodeLocation(location);
    if (!center) {
      return NextResponse.json(
        { error: "Could not geocode location. Check the location name and try again." },
        { status: 400 }
      );
    }
    const { lat, lng } = center;

    // ── Payment gate: balance-first, then card fallback ──
    const enrichment = enrichmentOptions ?? { youtube: true, braveSearch: true, apollo: true, hunter: true };
    const leadCount = maxLeads ?? 25;

    const userRef = adminDb.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};

    // Calculate cost server-side — never trust the client
    // Uses per-call pricing with margin to guarantee profitability
    const costEstimate = calculateSearchCost(leadCount, enrichment, categories.length);
    const costCents = dollarsToCents(costEstimate.chargeTotal);
    const chargeAmount = Math.max(50, costCents); // Stripe minimum is 50 cents

    let paymentIntentId: string | null = null;
    let paidVia: "balance" | "card" = "card";

    const currentBalance = userData.balance ?? 0;

    if (currentBalance >= chargeAmount) {
      // Deduct from balance atomically
      const deducted = await adminDb.runTransaction(async (tx) => {
        const freshSnap = await tx.get(userRef);
        const freshBalance = freshSnap.data()?.balance ?? 0;
        if (freshBalance < chargeAmount) return false;
        tx.update(userRef, { balance: FieldValue.increment(-chargeAmount) });
        tx.create(adminDb.collection("balanceTransactions").doc(), {
          userId,
          type: "search_deduction",
          amountCents: chargeAmount,
          location,
          leadCount,
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (deducted) {
        paidVia = "balance";
      }
    }

    // If balance didn't cover it, charge the card
    if (paidVia !== "balance") {
      if (!userData.stripeCustomerId) {
        return NextResponse.json(
          { error: "Insufficient balance and no payment method on file. Please add funds or a card in Settings." },
          { status: 402 }
        );
      }

      try {
        const stripe = getStripe();
        const paymentMethods = await stripe.paymentMethods.list({
          customer: userData.stripeCustomerId,
          type: "card",
          limit: 1,
        });

        if (paymentMethods.data.length === 0) {
          return NextResponse.json(
            { error: "Insufficient balance and no card on file. Please add funds or a card in Settings." },
            { status: 402 }
          );
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: chargeAmount,
          currency: "usd",
          customer: userData.stripeCustomerId,
          payment_method: paymentMethods.data[0].id,
          off_session: true,
          confirm: true,
          description: `Everest Leads: ${leadCount} leads in ${location}`,
          metadata: {
            firebaseUserId: userId,
            searchLocation: location,
            leadCount: String(leadCount),
          },
        });

        if (paymentIntent.status !== "succeeded") {
          return NextResponse.json(
            { error: "Payment was not completed. Please check your card in Settings." },
            { status: 402 }
          );
        }

        paymentIntentId = paymentIntent.id;
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "type" in err &&
          (err as { type: string }).type === "StripeCardError"
        ) {
          const stripeErr = err as unknown as { message: string };
          return NextResponse.json(
            { error: stripeErr.message },
            { status: 402 }
          );
        }
        console.error("Server-side charge error:", err);
        return NextResponse.json(
          { error: "Payment failed. Please try again or check your card in Settings." },
          { status: 402 }
        );
      }
    }

    // B. Collect place_ids from past searches to deduplicate
    const pastPlaceIds = new Set<string>();
    try {
      const pastSnap = await adminDb
        .collection("leadSearches")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
      for (const doc of pastSnap.docs) {
        const docLeads = doc.data().leads as Array<{ place_id: string }> | undefined;
        if (docLeads) {
          for (const l of docLeads) {
            if (l.place_id) pastPlaceIds.add(l.place_id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch past searches for dedup:", err);
      // Continue without dedup — don't block the search
    }

    // C. Search Google Places (New API) per category
    //    Strategy:
    //    1. Primary queries: "{category} in {location}" for each category
    //    2. Fallback queries: "{category} near {location}" (different results)
    //    3. Geographic subdivision: split the search radius into quadrants
    //       and re-query each category in each quadrant to surface businesses
    //       that didn't appear in the center-biased search.
    //    Stops as soon as we hit leadCount or exhaust all strategies.
    //    Max API calls capped to stay within Vercel's 10s timeout.
    const MAX_API_CALLS = 50; // With maxDuration=60s, ~50 calls fit safely
    const seen = new Set<string>();
    const leads: RawLead[] = [];
    let duplicatesRemoved = 0;
    let actualApiCalls = 1; // 1 for the geocode call above

    // Helper: run a query and collect new leads
    async function runQuery(query: string, category: string, radius: number, searchCenter: { lat: number; lng: number }) {
      if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) return;
      if (actualApiCalls > 1) await sleep(150); // rate limit between calls

      const { results, apiCalls } = await searchPlaces(query, searchCenter, radius);
      actualApiCalls += apiCalls;

      for (const place of results) {
        if (leads.length >= leadCount) break;
        if (seen.has(place.id)) continue;
        seen.add(place.id);

        if (pastPlaceIds.has(place.id)) {
          duplicatesRemoved++;
          continue;
        }

        leads.push({
          place_id: place.id,
          name: place.name,
          address: place.address,
          phone: place.phone,
          website: place.website,
          rating: place.rating,
          totalRatings: place.totalRatings,
          lat: place.lat,
          lng: place.lng,
          category,
        });
      }
    }

    // ── Query phrasing variations ──────────────────────────────────
    // Google Places Text Search returns different results depending on
    // phrasing. We use multiple variations to maximize unique leads.
    const QUERY_TEMPLATES = [
      (q: string, loc: string) => `${q} in ${loc}`,
      (q: string, loc: string) => `${q} near ${loc}`,
      (q: string, loc: string) => `best ${q} in ${loc}`,
      (q: string, loc: string) => `top ${q} near ${loc}`,
      (q: string, loc: string) => `${q} ${loc}`,
    ];

    // Pass 1: Phrasing variations at center — cycle through templates
    for (const template of QUERY_TEMPLATES) {
      if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
      for (const category of categories) {
        if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
        const queryStr = CATEGORY_QUERIES[category] || category;
        await runQuery(template(queryStr, location), category, radiusMeters, center);
      }
    }

    // Pass 2: Geographic grid — subdivide the area into sectors.
    // For small requests (<=50), use 4 quadrants. For large (>50), use
    // an adaptive grid that scales up to 4x4 (16 sectors) for 500 leads.
    if (leads.length < leadCount) {
      // Determine grid density based on how many leads we still need
      const deficit = leadCount - leads.length;
      const gridSize = deficit > 200 ? 4 : deficit > 50 ? 3 : 2; // 2x2, 3x3, or 4x4
      const sectorRadius = Math.round(radiusMeters / gridSize * 1.2); // overlap between sectors

      const sectors: { lat: number; lng: number }[] = [];
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          // Distribute sector centers evenly across the search area
          const latFraction = (row + 0.5) / gridSize - 0.5; // -0.5 to +0.5
          const lngFraction = (col + 0.5) / gridSize - 0.5;
          const sectorLat = center.lat + latFraction * 2 * (radiusMeters / 111320);
          const sectorLng = center.lng + lngFraction * 2 * (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180)));
          sectors.push({ lat: sectorLat, lng: sectorLng });
        }
      }

      // Query each sector with the primary phrasing
      for (const sCenter of sectors) {
        if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
        for (const category of categories) {
          if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
          const queryStr = CATEGORY_QUERIES[category] || category;
          await runQuery(queryStr, category, sectorRadius, sCenter);
        }
      }
    }

    // Pass 3: If still short, re-query sectors with alternate phrasing
    if (leads.length < leadCount) {
      const extraTemplates = QUERY_TEMPLATES.slice(1, 3); // "near" and "best"
      const sectorRadius = Math.round(radiusMeters / 2 * 1.2);
      const offsetLat = (radiusMeters / 111320) * 0.5;
      const offsetLng = (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180))) * 0.5;
      const corners = [
        { lat: center.lat + offsetLat, lng: center.lng + offsetLng },
        { lat: center.lat + offsetLat, lng: center.lng - offsetLng },
        { lat: center.lat - offsetLat, lng: center.lng + offsetLng },
        { lat: center.lat - offsetLat, lng: center.lng - offsetLng },
      ];

      for (const template of extraTemplates) {
        if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
        for (const corner of corners) {
          if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
          for (const category of categories) {
            if (leads.length >= leadCount || actualApiCalls >= MAX_API_CALLS) break;
            const queryStr = CATEGORY_QUERIES[category] || category;
            await runQuery(template(queryStr, location), category, sectorRadius, corner);
          }
        }
      }
    }

    if (leads.length === 0) {
      return NextResponse.json({ centerLat: lat, centerLng: lng, leads: [], duplicatesRemoved });
    }

    // C. Rule-based scoring
    const HIGH_VIDEO_CATEGORIES = new Set([
      "real estate agencies",
      "restaurants",
      "hotels & resorts",
      "car dealerships",
      "wedding planners",
      "dental offices",
    ]);

    const scoredLeads = leads.map((l) => {
      let score = 5;
      const reasons: string[] = [];

      // Rating bonus
      if (l.rating != null) {
        if (l.rating >= 4.5) { score += 2; reasons.push("High rating"); }
        else if (l.rating >= 4.0) { score += 1; reasons.push("Good rating"); }
        else if (l.rating < 3.5) { score -= 1; reasons.push("Low rating"); }
      }

      // Review count bonus
      if (l.totalRatings != null) {
        if (l.totalRatings >= 200) { score += 2; reasons.push("Many reviews"); }
        else if (l.totalRatings >= 50) { score += 1; reasons.push("Solid reviews"); }
        else if (l.totalRatings < 10) { score -= 1; reasons.push("Low review count"); }
      }

      // Contact info bonus
      if (l.website) { score += 1; reasons.push("Has website"); }
      if (l.phone) { score += 1; reasons.push("Has phone"); }

      // Business type bonus
      if (HIGH_VIDEO_CATEGORIES.has(l.category)) {
        score += 1;
        reasons.push("High video demand industry");
      }

      // Clamp 1-10
      score = Math.max(1, Math.min(10, score));

      return {
        ...l,
        score,
        reason: reasons.length > 0 ? reasons.join(", ") : "Average lead profile",
        isStarLead: score >= 7,
      };
    });

    // D. Shortfall refund — if we delivered fewer leads than requested,
    //    refund the difference pro-rata so users only pay for what they got.
    const delivered = scoredLeads.length;
    let refundCents = 0;
    let refundedVia: "balance" | "card" | null = null;

    if (delivered < leadCount && delivered > 0) {
      // Pro-rata: refund the fraction of leads not delivered
      const undeliveredFraction = (leadCount - delivered) / leadCount;
      refundCents = Math.round(chargeAmount * undeliveredFraction);

      // Don't refund tiny amounts (under 10 cents) — not worth the processing
      if (refundCents >= 10) {
        if (paidVia === "balance") {
          // Credit back to balance
          try {
            await adminDb.runTransaction(async (tx) => {
              tx.update(userRef, { balance: FieldValue.increment(refundCents) });
              tx.create(adminDb.collection("balanceTransactions").doc(), {
                userId,
                type: "shortfall_refund",
                amountCents: refundCents,
                requestedLeads: leadCount,
                deliveredLeads: delivered,
                location,
                createdAt: FieldValue.serverTimestamp(),
              });
            });
            refundedVia = "balance";
          } catch (refundErr) {
            console.error("[REFUND] Balance refund failed:", refundErr);
            // Track the failed refund so it can be manually recovered
            await adminDb.collection("pendingRefunds").add({
              userId, type: "shortfall_balance", amountCents: refundCents,
              reason: `${leadCount - delivered}/${leadCount} leads shortfall`,
              paymentIntentId: null, location, createdAt: FieldValue.serverTimestamp(),
            }).catch(() => {});
            refundCents = 0;
          }
        } else if (paymentIntentId) {
          // Partial Stripe refund
          try {
            const stripe = getStripe();
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
              amount: refundCents,
              metadata: {
                reason: "shortfall_refund",
                requestedLeads: String(leadCount),
                deliveredLeads: String(delivered),
                firebaseUserId: userId,
              },
            });
            refundedVia = "card";
          } catch (refundErr) {
            console.error("[REFUND] Stripe refund failed:", refundErr);
            // Track the failed refund so it can be manually recovered
            await adminDb.collection("pendingRefunds").add({
              userId, type: "shortfall_stripe", amountCents: refundCents,
              reason: `${leadCount - delivered}/${leadCount} leads shortfall`,
              paymentIntentId, location, createdAt: FieldValue.serverTimestamp(),
            }).catch(() => {});
            refundCents = 0;
          }
        }
      } else {
        refundCents = 0; // Too small to refund
      }
    } else if (delivered === 0 && leadCount > 0) {
      // Full refund — no leads delivered at all
      refundCents = chargeAmount;

      if (paidVia === "balance") {
        try {
          await adminDb.runTransaction(async (tx) => {
            tx.update(userRef, { balance: FieldValue.increment(refundCents) });
            tx.create(adminDb.collection("balanceTransactions").doc(), {
              userId,
              type: "shortfall_refund_full",
              amountCents: refundCents,
              requestedLeads: leadCount,
              deliveredLeads: 0,
              location,
              createdAt: FieldValue.serverTimestamp(),
            });
          });
          refundedVia = "balance";
        } catch (refundErr) {
          console.error("[REFUND] Full balance refund failed:", refundErr);
          await adminDb.collection("pendingRefunds").add({
            userId, type: "full_refund_balance", amountCents: refundCents,
            reason: "0 leads delivered",
            paymentIntentId: null, location, createdAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
          refundCents = 0;
        }
      } else if (paymentIntentId) {
        try {
          const stripe = getStripe();
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: refundCents,
            metadata: {
              reason: "shortfall_refund_full",
              requestedLeads: String(leadCount),
              deliveredLeads: "0",
              firebaseUserId: userId,
            },
          });
          refundedVia = "card";
        } catch (refundErr) {
          console.error("[REFUND] Full Stripe refund failed:", refundErr);
          await adminDb.collection("pendingRefunds").add({
            userId, type: "full_refund_stripe", amountCents: refundCents,
            reason: "0 leads delivered",
            paymentIntentId, location, createdAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
          refundCents = 0;
        }
      }
    }

    // E. Quality refund — refund the MARGIN (not API cost) for leads
    //    missing web presence (no website AND no phone).
    //    User still covers the base API cost for finding those leads.
    let qualityRefundCents = 0;
    let lowQualityCount = 0;

    if (delivered > 0) {
      lowQualityCount = scoredLeads.filter(
        (l) => !l.website && !l.phone
      ).length;

      if (lowQualityCount > 0) {
        // Margin per lead = (charge - actual API cost) / delivered leads
        const { actualCost: postCost } = calculateActualCost(actualApiCalls, delivered, enrichment);
        const postCostCents = dollarsToCents(postCost);
        const totalMarginCents = (chargeAmount - refundCents) - postCostCents;
        const marginPerLead = totalMarginCents > 0
          ? Math.floor(totalMarginCents / delivered)
          : 0;

        qualityRefundCents = marginPerLead * lowQualityCount;

        // Only process if meaningful
        if (qualityRefundCents >= 10) {
          if (paidVia === "balance" || refundedVia === "balance") {
            try {
              await adminDb.runTransaction(async (tx) => {
                tx.update(userRef, { balance: FieldValue.increment(qualityRefundCents) });
                tx.create(adminDb.collection("balanceTransactions").doc(), {
                  userId,
                  type: "quality_refund",
                  amountCents: qualityRefundCents,
                  lowQualityCount,
                  totalDelivered: delivered,
                  location,
                  createdAt: FieldValue.serverTimestamp(),
                });
              });
              if (!refundedVia) refundedVia = "balance";
            } catch (err) {
              console.error("[REFUND] Quality balance refund failed:", err);
              qualityRefundCents = 0;
            }
          } else if (paymentIntentId) {
            try {
              const stripe = getStripe();
              await stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: qualityRefundCents,
                metadata: {
                  reason: "quality_refund",
                  lowQualityCount: String(lowQualityCount),
                  totalDelivered: String(delivered),
                  firebaseUserId: userId,
                },
              });
              if (!refundedVia) refundedVia = "card";
            } catch (err) {
              console.error("[REFUND] Quality Stripe refund failed:", err);
              qualityRefundCents = 0;
            }
          }
        } else {
          qualityRefundCents = 0;
        }
      }
    }

    const totalRefundCents = refundCents + qualityRefundCents;

    // F. Log search cost + reconciliation to Firestore
    const { actualCost } = calculateActualCost(actualApiCalls, delivered, enrichment);
    const actualCostCents = dollarsToCents(actualCost);
    const netChargeCents = chargeAmount - totalRefundCents;
    const profitCents = netChargeCents - actualCostCents;

    try {
      await adminDb.collection("searchCharges").add({
        userId,
        location,
        leadCount: delivered,
        requestedLeadCount: leadCount,
        numCategories: categories.length,
        // Pricing
        chargeCents: chargeAmount,
        shortfallRefundCents: refundCents,
        qualityRefundCents,
        totalRefundCents,
        lowQualityCount,
        netChargeCents,
        estimatedApiCalls: costEstimate.apiCalls,
        actualApiCalls,
        actualCostCents,
        profitCents,
        marginMultiplier: costEstimate.margin,
        // Payment
        paidVia,
        refundedVia,
        paymentIntentId,
        enrichmentOptions: enrichment,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      console.error("Failed to log search charge:", logErr);
    }

    // G. Admin notification for shortfalls or quality issues
    if (delivered < leadCount || lowQualityCount > 0) {
      const shortfallData = {
        userId,
        location,
        categories,
        requestedLeads: leadCount,
        deliveredLeads: delivered,
        shortfall: leadCount - delivered,
        lowQualityCount,
        chargeCents: chargeAmount,
        shortfallRefundCents: refundCents,
        qualityRefundCents,
        totalRefundCents,
        refundedVia,
        paidVia,
        actualApiCalls,
        duplicatesRemoved,
        createdAt: FieldValue.serverTimestamp(),
      };

      try {
        await adminDb.collection("leadShortfalls").add(shortfallData);
      } catch (err) {
        console.error("Failed to log shortfall:", err);
      }

      // Send admin email if configured
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (adminEmail) {
        // Fire-and-forget — don't block the response
        sendShortfallEmail(adminEmail, shortfallData).catch((err) =>
          console.error("Failed to send shortfall email:", err)
        );
      }

      console.warn(
        `[SHORTFALL] User ${userId}: requested ${leadCount}, delivered ${delivered} (${leadCount - delivered} short), ` +
        `${lowQualityCount} low-quality. Refunded ${totalRefundCents}c (shortfall=${refundCents}c, quality=${qualityRefundCents}c) ` +
        `via ${refundedVia || "n/a"}. Location: ${location}`
      );
    }

    if (profitCents < 0) {
      console.warn(
        `[PRICING] Loss on search: charged ${chargeAmount}c - refunds ${totalRefundCents}c = net ${netChargeCents}c, ` +
        `actual cost ${actualCostCents}c, loss ${-profitCents}c. ` +
        `API calls: estimated=${costEstimate.apiCalls}, actual=${actualApiCalls}. ` +
        `Leads: requested=${leadCount}, delivered=${delivered}, categories=${categories.length}`
      );
    }

    // H. Return — include refund info so the client can show a message
    return NextResponse.json({
      centerLat: lat,
      centerLng: lng,
      leads: scoredLeads,
      duplicatesRemoved,
      ...(totalRefundCents > 0 && {
        refund: {
          amountCents: totalRefundCents,
          shortfallAmountCents: refundCents,
          qualityAmountCents: qualityRefundCents,
          lowQualityCount,
          via: refundedVia,
          requestedLeads: leadCount,
          deliveredLeads: delivered,
        },
      }),
    });
  } catch (err) {
    console.error("Lead search error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
