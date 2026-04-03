import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// Coupon codes live server-side ONLY — never expose to the client bundle
const VALID_CODES: Record<string, { maxSearches: number }> = {
  "TRY_FOR_FREE": { maxSearches: -1 },      // unlimited
  "EVEREST-FREE": { maxSearches: 5 },
  "EVEREST-BETA": { maxSearches: -1 },
  "VIDEOGRAPHER-2026": { maxSearches: -1 },
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body as { code?: string };

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    const normalized = code.trim().toUpperCase();

    if (!VALID_CODES[normalized]) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
