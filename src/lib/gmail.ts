/**
 * Gmail API service — searches for contract/agreement emails
 * and extracts project details for import into Everest.
 *
 * Uses the Gmail REST API directly (no SDK needed).
 * Requires an OAuth access token with gmail.readonly scope.
 */

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

export interface GmailContractEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bodyPreview: string;
  // Parsed suggestions (best-effort extraction)
  suggestedClientName: string;
  suggestedProjectName: string;
  suggestedQuotedAmount: number | null;
  allAmountsFound: number[];
}

/** Search Gmail for recent contract/agreement emails */
export async function searchContractEmails(
  accessToken: string,
  maxResults = 10
): Promise<GmailContractEmail[]> {
  // Search for emails containing contract-related keywords from the last 30 days
  const query = encodeURIComponent(
    "(subject:contract OR subject:agreement OR subject:signed OR subject:proposal OR subject:\"scope of work\" OR subject:SOW OR subject:engagement) newer_than:30d"
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
  const messages: { id: string; threadId: string }[] = listData.messages || [];

  if (messages.length === 0) return [];

  // Fetch details for each message in parallel
  const details = await Promise.all(
    messages.map((msg) => fetchMessageDetails(accessToken, msg.id))
  );

  return details.filter((d): d is GmailContractEmail => d !== null);
}

async function fetchMessageDetails(
  accessToken: string,
  messageId: string
): Promise<GmailContractEmail | null> {
  // Fetch full message to get the body content for amount extraction
  const res = await fetch(
    `${GMAIL_API}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const headers: { name: string; value: string }[] =
    data.payload?.headers || [];

  const subject =
    headers.find((h) => h.name === "Subject")?.value || "(No subject)";
  const from = headers.find((h) => h.name === "From")?.value || "";
  const date = headers.find((h) => h.name === "Date")?.value || "";
  const snippet: string = data.snippet || "";

  // Decode the email body
  const bodyText = extractBodyText(data.payload);
  const bodyPreview = bodyText.slice(0, 500);

  // Extract dollar amounts from the full body + subject + snippet
  const fullText = `${subject} ${snippet} ${bodyText}`;
  const { bestAmount, allAmounts } = extractDollarAmounts(fullText);

  // Extract client name from the "From" header
  const suggestedClientName = parseClientName(from);

  // Generate a project name from the subject line
  const suggestedProjectName = parseProjectName(subject, suggestedClientName);

  return {
    id: data.id,
    threadId: data.threadId,
    subject,
    from,
    date,
    snippet,
    bodyPreview,
    suggestedClientName,
    suggestedProjectName,
    suggestedQuotedAmount: bestAmount,
    allAmountsFound: allAmounts,
  };
}

/** Recursively extract plain text from a Gmail message payload */
function extractBodyText(payload: Record<string, unknown>): string {
  if (!payload) return "";

  // If this part has a body with data, decode it
  const body = payload.body as { data?: string; size?: number } | undefined;
  const mimeType = payload.mimeType as string | undefined;

  if (body?.data && mimeType) {
    // Prefer text/plain, but also accept text/html
    if (mimeType === "text/plain" || mimeType === "text/html") {
      const decoded = decodeBase64Url(body.data);
      if (mimeType === "text/html") {
        return stripHtml(decoded);
      }
      return decoded;
    }
  }

  // Recurse into multipart parts
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts && Array.isArray(parts)) {
    // Prefer text/plain part first
    const plainPart = parts.find(
      (p) => (p.mimeType as string) === "text/plain"
    );
    if (plainPart) {
      const result = extractBodyText(plainPart);
      if (result) return result;
    }
    // Fall back to any part that yields text
    for (const part of parts) {
      const result = extractBodyText(part);
      if (result) return result;
    }
  }

  return "";
}

/** Decode base64url-encoded string (Gmail API format) */
function decodeBase64Url(data: string): string {
  // Replace URL-safe chars and add padding
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

/** Strip HTML tags to get plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extract dollar amounts from email text and pick the most likely quoted price.
 *
 * Strategy:
 * 1. Find all dollar amounts in the text ($X, $X,XXX, $X,XXX.XX)
 * 2. Look for amounts near contract keywords (total, price, quote, cost, fee, rate, compensation, payment)
 * 3. If a contextual match is found, use it; otherwise use the largest amount as the best guess
 */
function extractDollarAmounts(text: string): {
  bestAmount: number | null;
  allAmounts: number[];
} {
  // Match patterns like $1500, $1,500, $1,500.00, $15,000, $ 1500, etc.
  const dollarRegex = /\$\s?([\d,]+(?:\.\d{1,2})?)/g;
  const amounts: { value: number; index: number }[] = [];
  let match;

  while ((match = dollarRegex.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    const value = parseFloat(raw);
    // Filter out unreasonable amounts (less than $10 or more than $1M)
    if (value >= 10 && value <= 1_000_000) {
      amounts.push({ value, index: match.index });
    }
  }

  if (amounts.length === 0) {
    return { bestAmount: null, allAmounts: [] };
  }

  const allAmounts = [...new Set(amounts.map((a) => a.value))].sort(
    (a, b) => b - a
  );

  // Look for amounts near price-indicating keywords
  const priceKeywords =
    /\b(total|price|quote|quoted|cost|fee|rate|compensation|payment|amount|sum|charge|budget|estimate|bid|invoice)\b/gi;
  let bestAmount: number | null = null;

  for (const amt of amounts) {
    // Check 150 characters before and after the amount for context keywords
    const contextStart = Math.max(0, amt.index - 150);
    const contextEnd = Math.min(text.length, amt.index + 150);
    const context = text.slice(contextStart, contextEnd);

    if (priceKeywords.test(context)) {
      // Among contextual matches, prefer the largest (likely the total)
      if (bestAmount === null || amt.value > bestAmount) {
        bestAmount = amt.value;
      }
      // Reset lastIndex since we reuse the regex
      priceKeywords.lastIndex = 0;
    }
  }

  // If no contextual match, fall back to the largest amount
  if (bestAmount === null) {
    bestAmount = allAmounts[0];
  }

  return { bestAmount, allAmounts };
}

/** Extract a clean name from an email "From" header like "John Smith <john@acme.com>" */
function parseClientName(from: string): string {
  // Try to extract the display name before the email
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();

  // If no display name, extract the domain as company name
  const emailMatch = from.match(/@([^.>]+)/);
  if (emailMatch) {
    const domain = emailMatch[1];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return from.trim();
}

/** Generate a project name from the email subject */
function parseProjectName(subject: string, clientName: string): string {
  // Remove common prefixes like "Re:", "Fwd:", etc.
  let clean = subject.replace(/^(Re|Fwd|FW|RE):\s*/gi, "").trim();

  // Remove generic words to make it more project-like
  clean = clean
    .replace(/\b(contract|agreement|signed|proposal|scope of work|sow|engagement)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If what's left is too short, combine with client name
  if (clean.length < 3) {
    return `${clientName} Project`;
  }

  return clean;
}

/** Get the list of email IDs that have already been imported (stored in localStorage) */
export function getImportedEmailIds(): Set<string> {
  try {
    const stored = localStorage.getItem("everest_imported_emails");
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

/** Mark email IDs as imported so they don't show up again */
export function markEmailsAsImported(ids: string[]) {
  const existing = getImportedEmailIds();
  ids.forEach((id) => existing.add(id));
  localStorage.setItem(
    "everest_imported_emails",
    JSON.stringify([...existing])
  );
}
