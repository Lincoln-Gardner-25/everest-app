import { NextResponse } from "next/server";

/**
 * GoHighLevel webhook receiver.
 *
 * When fully implemented, GHL will POST here whenever a contract is signed.
 * This endpoint will verify the signature, parse the payload, and create a
 * new project in Firestore on behalf of the connected user.
 *
 * Setup (once GHL integration is activated in Settings):
 *  1. In GHL → Settings → Integrations → Webhooks, add this endpoint URL.
 *  2. Copy the GHL signing secret into NEXT_PUBLIC_GHL_WEBHOOK_SECRET env var.
 *  3. Uncomment the implementation below.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[GHL Webhook] received:", JSON.stringify(body, null, 2));

    // TODO: Verify GHL webhook signature
    // const signature = req.headers.get("x-ghl-signature") ?? "";
    // if (!verifyGHLSignature(signature, rawBody)) {
    //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    // }

    // TODO: Parse contract-signed payload
    // const { contactId, contactName, pipelineStage, opportunityTitle, value } = body;

    // TODO: Look up Everest user by GHL account ID (stored in Firestore)
    // TODO: Create project in Firestore using createProject()

    return NextResponse.json({ received: true, status: "stub" });
  } catch (err) {
    console.error("[GHL Webhook] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
