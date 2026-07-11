import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// instagram-scraper supports resultsType:"posts" with proper pagination
const APIFY_ACTOR = 'apify~instagram-scraper';
const POST_LIMIT = 50;

interface ApifyPost {
  type?: string;
  productType?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  hashtags?: string[];
  url?: string;
  displayUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  thumbnailUrl?: string;
  images?: { displayUrl?: string; url?: string }[];
  shortCode?: string;
  ownerUsername?: string;
  ownerFullName?: string;
}

export interface PostPreview {
  url: string;
  displayUrl: string;
  videoUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  engagementScore: number;
  type: string;
  date: string;
}

export interface PostTypeCount {
  type: string;
  count: number;
}

function extractUsername(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    return parts[0] || null;
  } catch {
    const match = url.match(/instagram\.com\/([A-Za-z0-9._]+)/);
    return match ? match[1] : null;
  }
}

async function scrapePosts(profileUrl: string, apifyKey: string): Promise<ApifyPost[]> {
  const username = extractUsername(profileUrl);
  if (!username) throw new Error('Could not extract a username from that URL.');

  const igUrl = `https://www.instagram.com/${username}/`;

  const resp = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}&timeout=180&memory=1024`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [igUrl],
        resultsType: 'posts',
        resultsLimit: POST_LIMIT,
        addParentData: false,
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apify error ${resp.status}: ${text.slice(0, 300)}`);
  }

  const posts: ApifyPost[] = await resp.json();
  if (!posts?.length) throw new Error('No posts returned. The profile may be private or not found.');
  return posts;
}

function normaliseType(post: ApifyPost): string {
  const raw = (post.productType || post.type || '').toLowerCase();
  if (raw.includes('clip') || raw.includes('reel')) return 'Reel';
  if (raw.includes('sidecar') || raw.includes('carousel') || raw.includes('album')) return 'Carousel';
  if (raw.includes('video')) return 'Video';
  return 'Image';
}

function engagementScore(post: ApifyPost): number {
  return (post.likesCount || 0) + (post.commentsCount || 0) * 3;
}

function buildPostPreviews(posts: ApifyPost[]): { top: PostPreview[]; worst: PostPreview[] } {
  const previews: PostPreview[] = posts.map((p) => ({
    url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
    displayUrl: p.displayUrl || p.videoThumbnailUrl || p.thumbnailUrl || p.images?.[0]?.displayUrl || p.images?.[0]?.url || '',
    videoUrl: p.videoUrl || '',
    caption: (p.caption || '').slice(0, 140),
    likesCount: p.likesCount || 0,
    commentsCount: p.commentsCount || 0,
    engagementScore: engagementScore(p),
    type: normaliseType(p),
    date: p.timestamp ? new Date(p.timestamp).toISOString().split('T')[0] : '',
  }));

  const sorted = [...previews].sort((a, b) => b.engagementScore - a.engagementScore);
  return { top: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() };
}

function buildPostTypeCounts(posts: ApifyPost[]): PostTypeCount[] {
  const counts: Record<string, number> = {};
  posts.forEach((p) => {
    const t = normaliseType(p);
    counts[t] = (counts[t] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));
}

function buildPostSummary(posts: ApifyPost[]): string {
  return posts.map((p, i) => {
    const type = normaliseType(p);
    const caption = (p.caption || '').slice(0, 400);
    const likes = p.likesCount ?? '?';
    const comments = p.commentsCount ?? '?';
    const views = p.videoViewCount ?? p.videoPlayCount ?? null;
    const hashtags = (p.hashtags || []).join(' ');
    const date = p.timestamp ? new Date(p.timestamp).toISOString().split('T')[0] : 'unknown';
    return [
      `Post ${i + 1} [${type.toUpperCase()}] — ${date}`,
      `Engagement: ${likes} likes, ${comments} comments${views ? `, ${views} views` : ''}`,
      `Caption: ${caption || '(no caption)'}`,
      hashtags ? `Hashtags: ${hashtags}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n\n---\n\n');
}

function buildPrompt(username: string, posts: ApifyPost[], postSummary: string): string {
  const ownerUsername = posts[0]?.ownerUsername || username;
  const ownerFullName = posts[0]?.ownerFullName || '';
  const postCount = posts.length;

  const meta = [
    `Username: @${ownerUsername}`,
    ownerFullName ? `Name: ${ownerFullName}` : '',
  ].filter(Boolean).join('\n');

  return `You are a senior creative strategist specialising in social media content and paid advertising. Analyse the Instagram profile and its last ${postCount} posts below. Return a structured, actionable report as JSON. Be specific and evidence-based — reference actual captions, post types, and patterns from the data.

## Profile
${meta}

## Last ${postCount} Posts
${postSummary}

Return ONLY valid JSON matching this exact structure — no markdown fences, no preamble:

{
  "profileSnapshot": {
    "handle": "@username",
    "niche": "one-line niche description",
    "followerCount": 0,
    "postsAnalysed": ${postCount},
    "overallTone": "2-3 word tone summary",
    "aestheticSummary": "2 sentences on visual style and aesthetic consistency"
  },
  "contentPillars": [
    {
      "name": "Pillar Name",
      "description": "What this pillar covers and why it exists",
      "frequency": "X out of ${postCount} posts",
      "count": 0,
      "topPost": "Brief description of the strongest example",
      "strategicPurpose": "What this pillar does for the audience and brand"
    }
  ],
  "hookAnalysis": {
    "dominantHookTypes": ["list","of","types"],
    "hookStrength": "strong | moderate | weak",
    "bestHookExample": "Quote or describe the best opening hook observed",
    "weaknesses": "What hook patterns are missing or underperforming",
    "recommendation": "Specific actionable advice on improving hooks"
  },
  "copyStrategy": {
    "avgCaptionLength": "short | medium | long",
    "writingStyle": "Voice, tone, and writing patterns",
    "ctaUsage": "How and how often CTAs appear",
    "emojiUsage": "heavy | moderate | minimal | none",
    "hashtagStrategy": "Volume and targeting approach",
    "copyStrengths": "What the copy does well",
    "copyGaps": "What is missing or underperforming"
  },
  "engagementPatterns": {
    "avgLikesPerPost": 0,
    "avgCommentsPerPost": 0,
    "bestPerformingFormat": "image | video | reel | carousel",
    "bestPerformingPillar": "Which content pillar drives most engagement",
    "engagementInsight": "2-3 sentences on what the data tells us about what the audience responds to"
  },
  "creativeOpportunities": [
    {
      "opportunity": "Title",
      "rationale": "Why this is an opportunity based on the data",
      "howTo": "Concrete steps to execute this"
    }
  ],
  "paidAdPotential": {
    "topOrganicToTest": "Which organic content type would translate best to paid ads",
    "suggestedAdFormats": ["list","of","formats"],
    "audienceSignals": "What the content signals about the audience's interests and pain points",
    "creativeAngle": "The single strongest creative angle to lead with in ads"
  },
  "strategistVerdict": "3-4 sentence overall verdict — be direct and honest about strengths and the single most important thing to fix."
}

IMPORTANT:
- contentPillars must contain exactly 5 items
- Each pillar's "count" field must be an integer — your best estimate of how many of the ${postCount} posts belong to that pillar (counts should roughly sum to ${postCount})`;
}

export async function POST(req: NextRequest) {
  try {
    const { url, username: explicitUsername } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url.' }, { status: 400 });
    }

    const apifyKey = process.env.APIFY_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!apifyKey) return NextResponse.json({ error: 'APIFY_API_KEY is not configured on the server.' }, { status: 500 });
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 500 });

    const username = (explicitUsername as string | undefined)?.trim() || extractUsername(url);
    if (!username) return NextResponse.json({ error: 'Could not extract a username from that URL.' }, { status: 400 });

    const posts = await scrapePosts(url, apifyKey);
    const { top, worst } = buildPostPreviews(posts);
    const postTypeCounts = buildPostTypeCounts(posts);
    const prompt = buildPrompt(username, posts, buildPostSummary(posts));

    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 5000,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    let report;
    try {
      const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      report = JSON.parse(clean);
    } catch {
      throw new Error('Analysis failed to parse. Raw: ' + rawText.slice(0, 200));
    }

    return NextResponse.json({
      report,
      topPosts: top,
      worstPosts: worst,
      postTypeCounts,
      meta: { username, postsScraped: posts.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
