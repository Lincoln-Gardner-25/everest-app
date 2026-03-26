/**
 * Gmail API service — scans inbox for signed contract confirmations
 * from the document signing service and extracts project details.
 *
 * Trigger: Subject matches "[Gardner Photo and Film LLC] {Project Name} signed"
 * Extracts: project name (subject), client name (To header)
 * User fills in: quoted amount + estimated hours
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

/** The subject prefix used by the document signing service */
const SUBJECT_PREFIX = "[Gardner Photo and Film LLC]";
const SUBJECT_SUFFIX = "signed";

export interface GmailContractEmail {
  id: string;
  threadId: string;
  subject: string;
  to: string;
  date: string;
  suggestedClientName: string;
  suggestedProjectName: string;
  suggestedAmount: number | null;
}

// ── Gmail scanning ──────────────────────────────────────────────────

/** Search inbox for signed contract confirmation emails */
export async function searchSignedContracts(
  accessToken: string,
  maxResults = 20
): Promise<GmailContractEmail[]> {
  // Match: subject contains "[Gardner Photo and Film LLC]" AND "signed"
  const query = encodeURIComponent(
    `subject:"${SUBJECT_PREFIX}" subject:${SUBJECT_SUFFIX} newer_than:90d`
  );

  const listRes = await fetch(
    `${GMAIL_API}/messages?q=${query}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) {
    if (listRes.status === 401) throw new Error("GMAIL_AUTH_EXPIRED");
    throw new Error(`Gmail API error: ${listRes.status}`);
  }

  const listData = await listRes.json();
  const messages: { id: string; threadId: string }[] =
    listData.messages || [];

  if (messages.length === 0) return [];

  const details = await Promise.all(
    messages.map((msg) => fetchMessageDetails(accessToken, msg.id))
  );

  const valid = details.filter((d): d is GmailContractEmail => d !== null);

  // Fetch thread bodies in parallel to extract dollar amounts
  await Promise.all(
    valid.map(async (email) => {
      try {
        email.suggestedAmount = await extractAmountFromThread(
          accessToken,
          email.threadId
        );
      } catch {
        // Non-critical — leave as null, user can enter manually
      }
    })
  );

  return valid;
}

async function fetchMessageDetails(
  accessToken: string,
  messageId: string
): Promise<GmailContractEmail | null> {
  const res = await fetch(
    `${GMAIL_API}/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const headers: { name: string; value: string }[] =
    data.payload?.headers || [];

  const subject =
    headers.find((h) => h.name === "Subject")?.value || "";
  const to = headers.find((h) => h.name === "To")?.value || "";
  const date = headers.find((h) => h.name === "Date")?.value || "";

  // Verify subject matches our pattern
  if (!subject.includes(SUBJECT_PREFIX) || !subject.toLowerCase().includes(SUBJECT_SUFFIX.toLowerCase())) {
    return null;
  }

  const suggestedProjectName = parseProjectName(subject);
  const suggestedClientName = parseClientName(to);

  return {
    id: data.id,
    threadId: data.threadId,
    subject,
    to,
    date,
    suggestedClientName,
    suggestedProjectName,
    suggestedAmount: null,
  };
}

// ── Thread body scanning for dollar amounts ─────────────────────────

/**
 * Fetch all messages in a thread and extract the most likely contract amount.
 * Scans for patterns like $1,500 / $2000.00 / $750 in email bodies.
 */
async function extractAmountFromThread(
  accessToken: string,
  threadId: string
): Promise<number | null> {
  const res = await fetch(
    `${GMAIL_API}/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const thread = await res.json();
  const messages: Array<{ payload?: GmailPayload }> = thread.messages || [];

  // Collect all dollar amounts found across all messages in the thread
  const amounts: number[] = [];

  for (const msg of messages) {
    const body = extractTextBody(msg.payload);
    if (!body) continue;

    const found = parseDollarAmounts(body);
    amounts.push(...found);
  }

  if (amounts.length === 0) return null;

  // Return the largest amount — contract totals are usually the biggest number
  return Math.max(...amounts);
}

interface GmailPayload {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
}

/** Recursively extract plain text (or fallback to HTML stripped of tags) from a Gmail message payload */
function extractTextBody(payload?: GmailPayload): string | null {
  if (!payload) return null;

  // Single-part message
  if (payload.body?.data && payload.body.size && payload.body.size > 0) {
    const decoded = base64UrlDecode(payload.body.data);
    if (payload.mimeType === "text/plain") return decoded;
    if (payload.mimeType === "text/html") return stripHtml(decoded);
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return base64UrlDecode(plain.body.data);

    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return stripHtml(base64UrlDecode(html.body.data));

    // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      const nested = extractTextBody(part);
      if (nested) return nested;
    }
  }

  return null;
}

/** Decode base64url-encoded string (Gmail API encoding) */
function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

/** Strip HTML tags to get readable text */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract dollar amounts from text. Matches patterns like:
 * $1,500  $2,000.00  $750  $12,500.50
 * Ignores amounts under $50 (likely not contract totals).
 */
function parseDollarAmounts(text: string): number[] {
  const regex = /\$\s*([\d,]+(?:\.\d{1,2})?)/g;
  const amounts: number[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    const value = parseFloat(raw);
    if (!isNaN(value) && value >= 50) {
      amounts.push(value);
    }
  }

  return amounts;
}

// ── Name parsing ────────────────────────────────────────────────────

/**
 * Extract project name from subject like:
 * "[Gardner Photo and Film LLC] Premiere Dance Academy of Year Concert 2026 signed"
 * → "Premiere Dance Academy of Year Concert 2026"
 */
function parseProjectName(subject: string): string {
  let clean = subject;

  // Remove the prefix "[Gardner Photo and Film LLC] "
  const prefixIdx = clean.indexOf("]");
  if (prefixIdx !== -1) {
    clean = clean.slice(prefixIdx + 1).trim();
  }

  // Remove trailing "signed" (case-insensitive)
  clean = clean.replace(/\s+signed\s*$/i, "").trim();

  return clean || "Untitled Project";
}

/** Extract a clean name from an email header like "John Smith <john@acme.com>" */
function parseClientName(headerValue: string): string {
  const first = headerValue.split(",")[0].trim();

  // "John Smith <john@acme.com>" → "John Smith"
  const match = first.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();

  // john@acme.com → "Acme"
  const emailMatch = first.match(/@([^.>]+)/);
  if (emailMatch) {
    const domain = emailMatch[1];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return first.trim() || "Unknown Client";
}

// ── Imported email tracking (Firestore) ─────────────────────────────

const IMPORTED_COLLECTION = "users";

/** Get email IDs that have already been imported or dismissed */
export async function getImportedEmailIds(userId: string): Promise<Set<string>> {
  const snap = await getDoc(doc(db, IMPORTED_COLLECTION, userId));
  if (!snap.exists()) return new Set();
  const data = snap.data();
  return new Set((data.importedGmailIds as string[]) || []);
}

/** Mark email IDs as imported/dismissed in Firestore (persists across devices) */
export async function markEmailsAsImported(userId: string, ids: string[]) {
  const ref = doc(db, IMPORTED_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { importedGmailIds: arrayUnion(...ids) });
  } else {
    await setDoc(ref, { importedGmailIds: ids }, { merge: true });
  }
}

// ── Gmail scanning preference ───────────────────────────────────────

/** Check if Gmail scanning is enabled for this user (default: true) */
export async function isGmailScanEnabled(userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, IMPORTED_COLLECTION, userId));
  if (!snap.exists()) return true;
  const data = snap.data();
  // Default to true if field doesn't exist
  return data.gmailScanEnabled !== false;
}

/** Toggle Gmail scanning on/off */
export async function setGmailScanEnabled(userId: string, enabled: boolean) {
  await setDoc(
    doc(db, IMPORTED_COLLECTION, userId),
    { gmailScanEnabled: enabled },
    { merge: true }
  );
}
