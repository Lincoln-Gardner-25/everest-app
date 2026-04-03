import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe";

import { calculateSearchCost, dollarsToCents, type EnrichmentOptions } from "@/lib/pricing";

function getGoogleKey() { return process.env.GOOGLE_PLACES_API_KEY || ""; }

// ── Rate limiting (in-memory, per-user) ─────────────────────────────
const MAX_REQUESTS_PER_HOUR = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_HOUR) return false;

  entry.count++;
  return true;
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
async function searchPlaces(
  query: string,
  center: { lat: number; lng: number },
  radiusMeters: number
): Promise<Array<{
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  totalRatings: number | null;
  lat: number;
  lng: number;
}>> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleKey(),
      "X-Goog-FieldMask": PLACE_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      ...(radiusMeters <= 50000
        ? {
            locationBias: {
              circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: radiusMeters,
              },
            },
          }
        : {
            locationRestriction: {
              rectangle: {
                low: {
                  latitude: center.lat - (radiusMeters / 111320),
                  longitude: center.lng - (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180))),
                },
                high: {
                  latitude: center.lat + (radiusMeters / 111320),
                  longitude: center.lng + (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180))),
                },
              },
            },
          }),
      maxResultCount: 20,
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.error("Places API error:", data.error.message);
    return [];
  }

  return (data.places || []).map(
    (p: {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      userRatingCount?: number;
      location?: { latitude: number; longitude: number };
    }) => ({
      id: p.id,
      name: p.displayName?.text || "Unknown",
      address: p.formattedAddress || "",
      phone: p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      rating: p.rating ?? null,
      totalRatings: p.userRatingCount ?? null,
      lat: p.location?.latitude ?? center.lat,
      lng: p.location?.longitude ?? center.lng,
    })
  );
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

    // Rate limit: max 10 searches per hour per user
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 searches per hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { location, radiusMeters, categories, maxLeads, enrichmentOptions, couponCode: requestCoupon } = body as {
      location: string;
      radiusMeters: number;
      categories: string[];
      maxLeads?: number;
      enrichmentOptions?: EnrichmentOptions;
      couponCode?: string;
    };

    // ── Payment gate: per-search coupon OR server-side Stripe charge ──
    const enrichment = enrichmentOptions ?? { youtube: true, braveSearch: true, apollo: true, hunter: true };
    const leadCount = maxLeads ?? 25;

    const userRef = adminDb.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};

    // Validate coupon code if provided
    const VALID_CODES = new Set(["TRY_FOR_FREE", "EVEREST-FREE", "EVEREST-BETA", "VIDEOGRAPHER-2026"]);
    const hasValidCoupon = !!requestCoupon && VALID_CODES.has(requestCoupon.trim().toUpperCase());
    const hasInviteCode = !!userData.inviteCode;
    const isFree = hasValidCoupon || hasInviteCode;

    if (!isFree) {
      // Calculate cost server-side — never trust the client
      const { total: costDollars } = calculateSearchCost(leadCount, enrichment);
      const costCents = dollarsToCents(costDollars);
      const chargeAmount = Math.max(50, costCents); // Stripe minimum is 50 cents

      if (!userData.stripeCustomerId) {
        return NextResponse.json(
          { error: "No payment method on file. Please add a card in Settings." },
          { status: 402 }
        );
      }

      // Charge the card server-side before proceeding with the search
      try {
        const stripe = getStripe();
        const paymentMethods = await stripe.paymentMethods.list({
          customer: userData.stripeCustomerId,
          type: "card",
          limit: 1,
        });

        if (paymentMethods.data.length === 0) {
          return NextResponse.json(
            { error: "No payment method on file. Please add a card in Settings." },
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
      } catch (err) {
        // Handle Stripe card errors specifically
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

    // Input validation
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

    // A. Geocode using Places API text search
    const center = await geocodeLocation(location);
    if (!center) {
      return NextResponse.json(
        { error: "Could not geocode location. Check the location name and try again." },
        { status: 400 }
      );
    }
    const { lat, lng } = center;

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
    const seen = new Set<string>();
    const leads: RawLead[] = [];
    let duplicatesRemoved = 0;

    for (const category of categories) {
      const queryStr = CATEGORY_QUERIES[category] || category;
      const fullQuery = `${queryStr} in ${location}`;

      // Rate limit between category searches
      if (leads.length > 0) await sleep(200);

      const results = await searchPlaces(fullQuery, center, radiusMeters);

      for (const place of results) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);

        // Skip leads the user already has from past searches
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

    // D. Return
    return NextResponse.json({
      centerLat: lat,
      centerLng: lng,
      leads: scoredLeads,
      duplicatesRemoved,
    });
  } catch (err) {
    console.error("Lead search error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
