import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const APIFY_ACTOR = 'apify~instagram-profile-scraper';
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
  shortCode?: string;
}

interface ApifyProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  isVerified?: boolean;
  latestPosts?: ApifyPost[];
}

export interface PostPreview {
  url: string;
  displayUrl: string;
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

async function scrapeProfile(profileUrl: string, apifyKey: string): Promise<ApifyProfile> {
  const username = extractUsername(profileUrl);
  if (!username) throw new Error('Could not extract a username from that URL.');

  const resp = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}&timeout=180&memory=512`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], resultsLimit: POST_LIMIT }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apify error ${resp.status}: ${text.slice(0, 300)}`);
  }

  const items: ApifyProfile[] = await resp.json();
  if (!items?.length) throw new Error('No data returned. The profile may be private or the username is incorrect.');
  return items[0];
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
    displayUrl: p.displayUrl || '',
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
  return posts
    .slice(0, POST_LIMIT)
    .map((p, i) => {
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
    })
    .join('\n\n---\n\n');
}

function buildPrompt(profile: ApifyProfile, postSummary: string, postCount: number): string {
  const meta = [
    `Username: @${profile.username || 'unknown'}`,
    profile.fullName ? `Name: ${profile.fullName}` : '',
    profile.biography ? `Bio: ${profile.biography}` : '',
    profile.followersCount != null ? `Followers: ${profile.followersCount.toLocaleString()}` : '',
    profile.postsCount != null ? `Total posts: ${profile.postsCount}` : '',
    profile.isVerified ? 'Verified: yes' : '',
  ]
    .filter(Boolean)
    .join('\n');

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
    "postsAnalysed": 0,
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
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url.' }, { status: 400 });
    }

    const apifyKey = process.env.APIFY_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!apifyKey) return NextResponse.json({ error: 'APIFY_API_KEY is not configured on the server.' }, { status: 500 });
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 500 });

    const profile = await scrapeProfile(url, apifyKey);
    const posts = profile.latestPosts || [];
    if (!posts.length) throw new Error('No posts found. The account may be private.');

    const { top, worst } = buildPostPreviews(posts);
    const postTypeCounts = buildPostTypeCounts(posts);
    const prompt = buildPrompt(profile, buildPostSummary(posts), posts.length);

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
      meta: { username: profile.username, postsScraped: posts.length, followersCount: profile.followersCount },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
