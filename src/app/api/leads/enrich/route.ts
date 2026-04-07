import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { enrichLeadBatch, type EnrichmentOptions } from "@/lib/enrichment";
import { FieldValue } from "firebase-admin/firestore";

const MAX_LEADS_PER_REQUEST = 10;

const MAX_ENRICH_PER_HOUR = 5;

async function checkEnrichRateLimit(userId: string): Promise<boolean> {
  const now = Date.now();
  const docRef = adminDb.doc(`rateLimits/enrich_${userId}`);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();

    if (!data || now > data.resetAt) {
      tx.set(docRef, { count: 1, resetAt: now + 60 * 60 * 1000 });
      return true;
    }

    if (data.count >= MAX_ENRICH_PER_HOUR) return false;

    tx.update(docRef, { count: FieldValue.increment(1) });
    return true;
  });
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

    if (!(await checkEnrichRateLimit(userId))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 5 enrichment requests per hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { leads, enrichmentOptions, searchId } = body as {
      leads: Array<{ place_id: string; name: string; website: string | null }>;
      enrichmentOptions?: EnrichmentOptions;
      searchId?: string;
    };

    // Verify the user owns this search (proves they paid for it)
    if (!searchId || typeof searchId !== "string") {
      return NextResponse.json({ error: "searchId is required" }, { status: 400 });
    }

    const searchDoc = await adminDb.doc(`leadSearches/${searchId}`).get();
    if (!searchDoc.exists || searchDoc.data()?.userId !== userId) {
      return NextResponse.json({ error: "Search not found or unauthorized" }, { status: 403 });
    }

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads to enrich" }, { status: 400 });
    }

    // Validate and filter lead objects
    const validLeads = leads.filter(
      (lead): lead is { place_id: string; name: string; website: string | null } =>
        typeof lead?.place_id === "string" &&
        lead.place_id.length > 0 &&
        typeof lead?.name === "string" &&
        lead.name.length > 0 &&
        (lead.website === null || typeof lead.website === "string")
    );

    if (validLeads.length === 0) {
      return NextResponse.json({ error: "No valid leads to enrich" }, { status: 400 });
    }

    // Cap to prevent timeout
    const toEnrich = validLeads.slice(0, MAX_LEADS_PER_REQUEST);

    const options: EnrichmentOptions = enrichmentOptions ?? {
      youtube: true,
      braveSearch: true,
      apollo: true,
      hunter: true,
    };

    const enriched = await enrichLeadBatch(toEnrich, options);

    return NextResponse.json({ enriched });
  } catch (err) {
    console.error("Enrichment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
