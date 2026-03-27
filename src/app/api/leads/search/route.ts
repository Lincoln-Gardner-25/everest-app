import { NextRequest, NextResponse } from "next/server";

function getGoogleKey() { return process.env.GOOGLE_PLACES_API_KEY || ""; }

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
    const body = await req.json();
    const { location, radiusMeters, categories } = body as {
      location: string;
      radiusMeters: number;
      categories: string[];
    };

    if (!location || !radiusMeters || !categories?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    // B. Search Google Places (New API) per category
    const seen = new Set<string>();
    const leads: RawLead[] = [];

    for (const category of categories) {
      const queryStr = CATEGORY_QUERIES[category] || category;
      const fullQuery = `${queryStr} in ${location}`;

      // Rate limit between category searches
      if (leads.length > 0) await sleep(200);

      const results = await searchPlaces(fullQuery, center, radiusMeters);

      for (const place of results) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);

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
      return NextResponse.json({ centerLat: lat, centerLng: lng, leads: [] });
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
    });
  } catch (err) {
    console.error("Lead search error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
