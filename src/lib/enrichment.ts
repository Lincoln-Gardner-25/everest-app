// ── Lead Enrichment Functions ──────────────────────────────────────
// Server-side only. Each function is a standalone async operation.

import { google } from "googleapis";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── YouTube Data API ──────────────────────────────────────────────

export interface YouTubeResult {
  youtubeStatus: "none" | "dead" | "low" | "active";
  youtubeSubscribers: number | null;
  youtubeLastUpload: string | null;
  videoGapScore: number;
}

export async function checkYouTube(businessName: string): Promise<YouTubeResult> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    return { youtubeStatus: "none", youtubeSubscribers: null, youtubeLastUpload: null, videoGapScore: 0 };
  }

  const youtube = google.youtube({ version: "v3", auth: apiKey });

  try {
    // Search for the business channel
    const searchRes = await youtube.search.list({
      q: businessName,
      type: ["channel"],
      maxResults: 1,
      part: ["snippet"],
    });

    const channel = searchRes.data.items?.[0];
    if (!channel?.snippet?.channelId) {
      // No YouTube channel found — strong video gap signal
      return { youtubeStatus: "none", youtubeSubscribers: null, youtubeLastUpload: null, videoGapScore: 3 };
    }

    const channelId = channel.snippet.channelId;

    // Get channel stats
    const channelRes = await youtube.channels.list({
      id: [channelId],
      part: ["statistics"],
    });

    const stats = channelRes.data.items?.[0]?.statistics;
    const subscribers = parseInt(stats?.subscriberCount || "0", 10);

    // Get last upload date
    const uploadsRes = await youtube.search.list({
      channelId,
      order: "date",
      maxResults: 1,
      part: ["snippet"],
      type: ["video"],
    });

    const lastUpload = uploadsRes.data.items?.[0]?.snippet?.publishedAt || null;

    // Determine status
    let youtubeStatus: YouTubeResult["youtubeStatus"] = "active";
    let videoGapScore = 0;

    if (lastUpload) {
      const lastUploadDate = new Date(lastUpload);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (lastUploadDate < sixMonthsAgo) {
        youtubeStatus = "dead";
        videoGapScore = 2;
      }
    }

    if (subscribers < 500) {
      if (youtubeStatus === "active") youtubeStatus = "low";
      videoGapScore = Math.max(videoGapScore, 1);
    }

    return { youtubeStatus, youtubeSubscribers: subscribers, youtubeLastUpload: lastUpload, videoGapScore };
  } catch (err) {
    console.error("YouTube API error for", businessName, err);
    return { youtubeStatus: "none", youtubeSubscribers: null, youtubeLastUpload: null, videoGapScore: 0 };
  }
}

// ── Brave Search API (tech stack detection) ──────────────────────

const MARKETING_TOOLS = [
  "HubSpot", "Salesforce", "Mailchimp", "ActiveCampaign",
  "Marketo", "Shopify Plus", "Klaviyo", "Pardot",
  "Constant Contact", "Zoho CRM",
];

export interface BraveResult {
  techStack: string[];
  videoGapScore: number;
}

export async function searchBraveForTechStack(domain: string): Promise<BraveResult> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey || !domain) {
    return { techStack: [], videoGapScore: 0 };
  }

  // Clean domain from URL
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  try {
    const toolQuery = MARKETING_TOOLS.slice(0, 5).join(" OR ");
    const searchQuery = `site:${cleanDomain} ${toolQuery}`;

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=5`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    if (!res.ok) {
      console.error("Brave Search error:", res.status);
      return { techStack: [], videoGapScore: 0 };
    }

    const data = await res.json();
    const results = data.web?.results || [];

    // Check result text for marketing tool mentions
    const detectedTools: Set<string> = new Set();
    const allText = results.map((r: { title?: string; description?: string }) =>
      `${r.title || ""} ${r.description || ""}`
    ).join(" ").toLowerCase();

    for (const tool of MARKETING_TOOLS) {
      if (allText.includes(tool.toLowerCase())) {
        detectedTools.add(tool);
      }
    }

    const techStack = Array.from(detectedTools);
    // Has marketing tools = likely has budget but maybe no video
    const videoGapScore = techStack.length > 0 ? 2 : 0;

    return { techStack, videoGapScore };
  } catch (err) {
    console.error("Brave Search error for", domain, err);
    return { techStack: [], videoGapScore: 0 };
  }
}

// ── Apollo.io API (contact discovery) ────────────────────────────

export interface ApolloResult {
  contactName: string | null;
  contactEmail: string | null;
}

export async function findContactApollo(domain: string): Promise<ApolloResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || !domain) {
    return { contactName: null, contactEmail: null };
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: cleanDomain,
        person_titles: ["marketing director", "marketing manager", "vp marketing", "owner", "ceo", "general manager"],
        page: 1,
        per_page: 1,
      }),
    });

    if (!res.ok) {
      console.error("Apollo API error:", res.status);
      return { contactName: null, contactEmail: null };
    }

    const data = await res.json();
    const person = data.people?.[0];

    if (!person) {
      return { contactName: null, contactEmail: null };
    }

    return {
      contactName: person.name || `${person.first_name || ""} ${person.last_name || ""}`.trim() || null,
      contactEmail: person.email || null,
    };
  } catch (err) {
    console.error("Apollo error for", domain, err);
    return { contactName: null, contactEmail: null };
  }
}

// ── Hunter.io API (email verification) ───────────────────────────

export interface HunterResult {
  emailVerified: boolean | null;
}

export async function verifyEmailHunter(email: string): Promise<HunterResult> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey || !email) {
    return { emailVerified: null };
  }

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`
    );

    if (!res.ok) {
      console.error("Hunter API error:", res.status);
      return { emailVerified: null };
    }

    const data = await res.json();
    const status = data.data?.status;

    // "valid" or "accept_all" = deliverable
    return { emailVerified: status === "valid" || status === "accept_all" };
  } catch (err) {
    console.error("Hunter error for", email, err);
    return { emailVerified: null };
  }
}

// ── Batch enrichment (orchestrator) ─────────────────────────────

export interface EnrichmentOptions {
  youtube: boolean;
  braveSearch: boolean;
  apollo: boolean;
  hunter: boolean;
}

export interface EnrichedLead {
  place_id: string;
  youtubeStatus?: "none" | "dead" | "low" | "active" | null;
  youtubeSubscribers?: number | null;
  youtubeLastUpload?: string | null;
  techStack?: string[];
  contactName?: string | null;
  contactEmail?: string | null;
  emailVerified?: boolean | null;
  videoGapScore: number;
}

export async function enrichLeadBatch(
  leads: Array<{ place_id: string; name: string; website: string | null }>,
  options: EnrichmentOptions
): Promise<EnrichedLead[]> {
  const results: EnrichedLead[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (lead) => {
        const result: EnrichedLead = { place_id: lead.place_id, videoGapScore: 0 };

        // Run selected enrichment in parallel
        const tasks: Promise<void>[] = [];

        if (options.youtube) {
          tasks.push(
            checkYouTube(lead.name).then((yt) => {
              result.youtubeStatus = yt.youtubeStatus;
              result.youtubeSubscribers = yt.youtubeSubscribers;
              result.youtubeLastUpload = yt.youtubeLastUpload;
              result.videoGapScore += yt.videoGapScore;
            })
          );
        }

        if (options.braveSearch && lead.website) {
          tasks.push(
            searchBraveForTechStack(lead.website).then((br) => {
              result.techStack = br.techStack;
              result.videoGapScore += br.videoGapScore;
            })
          );
        }

        if (options.apollo && lead.website) {
          tasks.push(
            findContactApollo(lead.website).then((ap) => {
              result.contactName = ap.contactName;
              result.contactEmail = ap.contactEmail;
            })
          );
        }

        await Promise.all(tasks);

        // Hunter requires an email from Apollo
        if (options.hunter && result.contactEmail) {
          const hunterResult = await verifyEmailHunter(result.contactEmail);
          result.emailVerified = hunterResult.emailVerified;
          if (hunterResult.emailVerified) {
            result.videoGapScore += 1;
          }
        }

        // Cap videoGapScore at 5
        result.videoGapScore = Math.min(5, result.videoGapScore);

        return result;
      })
    );

    results.push(...batchResults);

    // Delay between batches (not after last batch)
    if (i + BATCH_SIZE < leads.length) {
      await sleep(500);
    }
  }

  return results;
}
