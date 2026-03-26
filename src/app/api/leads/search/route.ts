import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

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

    // A. Geocode
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_KEY}`
    );
    const geoData = await geoRes.json();
    if (!geoData.results?.length) {
      return NextResponse.json(
        { error: "Could not geocode location" },
        { status: 400 }
      );
    }
    const { lat, lng } = geoData.results[0].geometry.location;

    // B. Scrape Google Places
    const seen = new Set<string>();
    const leads: RawLead[] = [];

    for (const category of categories) {
      const queryStr = CATEGORY_QUERIES[category] || category;
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        `${queryStr} in ${location}`
      )}&location=${lat},${lng}&radius=${radiusMeters}&key=${GOOGLE_KEY}`;

      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      const results = searchData.results || [];

      for (const place of results) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        // Fetch place details for phone + website
        await sleep(200);
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry&key=${GOOGLE_KEY}`;

        let phone: string | null = null;
        let website: string | null = null;
        let detailRating: number | null = place.rating ?? null;
        let totalRatings: number | null = place.user_ratings_total ?? null;

        try {
          const detailRes = await fetch(detailUrl);
          const detailData = await detailRes.json();
          if (detailData.result) {
            phone = detailData.result.formatted_phone_number || null;
            website = detailData.result.website || null;
            detailRating = detailData.result.rating ?? detailRating;
            totalRatings =
              detailData.result.user_ratings_total ?? totalRatings;
          }
        } catch {
          // Non-critical — continue without details
        }

        leads.push({
          place_id: place.place_id,
          name: place.name,
          address: place.formatted_address || "",
          phone,
          website,
          rating: detailRating,
          totalRatings,
          lat: place.geometry?.location?.lat ?? lat,
          lng: place.geometry?.location?.lng ?? lng,
          category,
        });
      }
    }

    if (leads.length === 0) {
      return NextResponse.json({ centerLat: lat, centerLng: lng, leads: [] });
    }

    // C. Claude AI Scoring
    let scoredLeads = leads.map((l) => ({
      ...l,
      score: 5,
      reason: "Could not score automatically.",
      isStarLead: false,
    }));

    try {
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system:
          "You are a business development assistant helping a freelance videographer identify the most promising leads for outreach. You will receive a list of businesses and you must score each one from 1 to 10 based on how likely they are to need and pay for professional videography services. Consider: business type, Google rating, number of reviews (more reviews = more established = more likely to invest in marketing), and whether they likely use video content in their industry. Return ONLY a valid JSON array — no markdown, no backticks, no explanation. Each element must have exactly these fields: place_id (string), score (integer 1-10), reason (string, max 15 words explaining the score).",
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              leads.map((l) => ({
                place_id: l.place_id,
                name: l.name,
                category: l.category,
                rating: l.rating,
                totalRatings: l.totalRatings,
              }))
            ),
          },
        ],
      });

      const text =
        msg.content[0].type === "text" ? msg.content[0].text : "";
      const scores: { place_id: string; score: number; reason: string }[] =
        JSON.parse(text);

      const scoreMap = new Map(scores.map((s) => [s.place_id, s]));
      scoredLeads = leads.map((l) => {
        const s = scoreMap.get(l.place_id);
        const score = s?.score ?? 5;
        return {
          ...l,
          score,
          reason: s?.reason ?? "Could not score automatically.",
          isStarLead: score >= 7,
        };
      });
    } catch (err) {
      console.error("Claude scoring failed:", err);
      // Keep default scores
    }

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
