import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const APIFY_ACTOR = 'apify~instagram-profile-scraper';
const POST_LIMIT = 30;

interface ApifyPost {
  type?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  hashtags?: string[];
  productType?: string;
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
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apifyKey}&timeout=120&memory=512`,
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

function buildPostSummary(posts: ApifyPost[]): string {
  return posts
    .slice(0, POST_LIMIT)
    .map((p, i) => {
      const type = p.productType || p.type || 'post';
      const caption = (p.caption || '').slice(0, 500);
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

function buildPrompt(profile: ApifyProfile, postSummary: string): string {
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

  return `You are a senior creative strategist specialising in social media content and paid advertising. Analyse the Instagram profile and its last ${POST_LIMIT} posts below. Return a structured, actionable report as JSON. Be specific and evidence-based — reference actual captions, post types, and patterns from the data.

## Profile
${meta}

## Last ${POST_LIMIT} Posts
${postSummary}

## Output Format

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
      "frequency": "X out of 30 posts",
      "topPost": "Brief description of the strongest example",
      "strategicPurpose": "What this pillar does for the audience and brand"
    }
  ],
  "hookAnalysis": {
    "dominantHookTypes": ["list", "of", "types"],
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
    "suggestedAdFormats": ["list", "of", "formats"],
    "audienceSignals": "What the content signals about the audience's interests and pain points",
    "creativeAngle": "The single strongest creative angle to lead with in ads"
  },
  "strategistVerdict": "3-4 sentence overall verdict — be direct and honest about strengths and the single most important thing to fix."
}

IMPORTANT: contentPillars must contain exactly 5 items.`;
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

    const prompt = buildPrompt(profile, buildPostSummary(posts));

    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    let report;
    try {
      report = JSON.parse(rawText);
    } catch {
      throw new Error('Analysis failed to parse. Raw: ' + rawText.slice(0, 200));
    }

    return NextResponse.json({
      report,
      meta: { username: profile.username, postsScraped: posts.length, followersCount: profile.followersCount },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
