'use client';

import { useState } from 'react';
import type { PostPreview, PostTypeCount } from './api/analyze/route';

type View = 'input' | 'loading' | 'error' | 'report';

interface ContentPillar {
  name: string;
  description: string;
  frequency: string;
  count: number;
  topPost: string;
  strategicPurpose: string;
}

interface Report {
  profileSnapshot: {
    handle: string;
    niche: string;
    followerCount: number;
    postsAnalysed: number;
    overallTone: string;
    aestheticSummary: string;
  };
  contentPillars: ContentPillar[];
  hookAnalysis: {
    dominantHookTypes: string[];
    hookStrength: string;
    bestHookExample: string;
    weaknesses: string;
    recommendation: string;
  };
  copyStrategy: {
    avgCaptionLength: string;
    writingStyle: string;
    ctaUsage: string;
    emojiUsage: string;
    hashtagStrategy: string;
    copyStrengths: string;
    copyGaps: string;
  };
  engagementPatterns: {
    avgLikesPerPost: number;
    avgCommentsPerPost: number;
    bestPerformingFormat: string;
    bestPerformingPillar: string;
    engagementInsight: string;
  };
  creativeOpportunities: { opportunity: string; rationale: string; howTo: string }[];
  paidAdPotential: {
    topOrganicToTest: string;
    suggestedAdFormats: string[];
    audienceSignals: string;
    creativeAngle: string;
  };
  strategistVerdict: string;
}

const PILLAR_COLORS = [
  { bg: '#eff6ff', border: '#bfdbfe', label: '#1d4ed8', chart: '#3b82f6' },
  { bg: '#f0fdf4', border: '#bbf7d0', label: '#15803d', chart: '#22c55e' },
  { bg: '#fdf4ff', border: '#e9d5ff', label: '#7e22ce', chart: '#a855f7' },
  { bg: '#fff7ed', border: '#fed7aa', label: '#c2410c', chart: '#f97316' },
  { bg: '#fefce8', border: '#fde68a', label: '#92400e', chart: '#eab308' },
];

const POST_TYPE_COLORS: Record<string, string> = {
  Reel:     '#8b5cf6',
  Image:    '#3b82f6',
  Carousel: '#f59e0b',
  Video:    '#06b6d4',
};

function hookStrengthColor(s: string) {
  if (s === 'strong') return { color: 'var(--green)', bg: 'var(--green-bg)' };
  if (s === 'weak') return { color: 'var(--red)', bg: 'var(--red-bg)' };
  return { color: 'var(--amber)', bg: 'var(--amber-bg)' };
}

// ── PIE CHART ──────────────────────────────────────────────────────────────
interface PieSlice { label: string; count: number; color: string }

function PieChart({ slices, title }: { slices: PieSlice[]; title: string }) {
  const total = slices.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const cx = 80, cy = 80, r = 68;
  let angle = -90; // start at top

  const paths = slices.map((s) => {
    const pct = s.count / total;
    const sweep = pct * 360;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const largeArc = sweep > 180 ? 1 : 0;

    // Full circle edge case
    if (pct >= 1) {
      return `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`;
    }

    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  });

  return (
    <div style={{ padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 16 }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
          {paths.map((d, i) => (
            <path key={i} d={d} fill={slices[i].color} stroke="var(--bg)" strokeWidth={1.5} />
          ))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                {s.count} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>({Math.round((s.count / total) * 100)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── POST PREVIEW CARD ──────────────────────────────────────────────────────
function PostCard({ post, rank, variant }: { post: PostPreview; rank: number; variant: 'top' | 'worst' }) {
  const [imgError, setImgError] = useState(false);
  const accent = variant === 'top' ? 'var(--green)' : 'var(--red)';
  const accentBg = variant === 'top' ? 'var(--green-bg)' : 'var(--red-bg)';

  return (
    <a
      href={post.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', transition: 'box-shadow 0.15s' }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--surface)', overflow: 'hidden' }}>
        {post.displayUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.displayUrl}
            alt={post.caption || 'Post thumbnail'}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {/* Rank badge */}
        <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 7px', borderRadius: 3, background: accentBg, color: accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>
          #{rank}
        </div>
        {/* Type badge */}
        <div style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', borderRadius: 3, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
          {post.type}
        </div>
      </div>
      {/* Stats */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{(post.likesCount || 0).toLocaleString()}</strong> likes
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{(post.commentsCount || 0).toLocaleString()}</strong> comments
          </span>
        </div>
        {post.caption && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {post.caption}
          </p>
        )}
        {post.date && (
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{post.date}</p>
        )}
      </div>
    </a>
  );
}

// ── SHARED COMPONENTS ──────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function InfoBlock({ label, text, accent }: { label: string; text: string; accent?: string }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent || 'var(--text-tertiary)', marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{text}</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
        {value}
      </div>
    </div>
  );
}

// ── PAGE ───────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('');
  const [view, setView] = useState<View>('input');
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [topPosts, setTopPosts] = useState<PostPreview[]>([]);
  const [worstPosts, setWorstPosts] = useState<PostPreview[]>([]);
  const [postTypeCounts, setPostTypeCounts] = useState<PostTypeCount[]>([]);
  const [meta, setMeta] = useState<{ username?: string; postsScraped?: number } | null>(null);

  async function analyse() {
    if (!url.trim()) return;
    setView('loading');
    setError('');
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setError(data.error || 'Something went wrong.');
        setView('error');
        return;
      }
      setReport(data.report);
      setTopPosts(data.topPosts || []);
      setWorstPosts(data.worstPosts || []);
      setPostTypeCounts(data.postTypeCounts || []);
      setMeta(data.meta);
      setView('report');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
      setView('error');
    }
  }

  function reset() {
    setView('input');
    setReport(null);
    setTopPosts([]);
    setWorstPosts([]);
    setPostTypeCounts([]);
    setMeta(null);
    setError('');
    setUrl('');
  }

  // Build pillar pie slices from report
  const pillarSlices: PieSlice[] = report
    ? report.contentPillars.slice(0, 5).map((p, i) => ({
        label: p.name,
        count: p.count || 0,
        color: PILLAR_COLORS[i].chart,
      })).filter(s => s.count > 0)
    : [];

  const postTypeSlices: PieSlice[] = postTypeCounts.map((pt) => ({
    label: pt.type,
    count: pt.count,
    color: POST_TYPE_COLORS[pt.type] || '#94a3b8',
  }));

  return (
    <>
      <header className="header">
        <div className="header-left">
          <span className="wordmark">Majorform</span>
          <div className="divider-v" />
          <span className="tool-name">Instagram Analysis</span>
        </div>
        <div className="header-right">
          {view === 'report' && (
            <button className="btn-secondary" onClick={reset}>
              New Analysis
            </button>
          )}
        </div>
      </header>

      {view === 'input' && (
        <div className="setup-panel">
          <p className="setup-eyebrow">Creative Intelligence</p>
          <h1 className="setup-title">Instagram Profile Analysis</h1>
          <p className="setup-sub">
            Drop in any public Instagram profile URL. Claude analyses the last 50 posts and returns a structured creative strategy report — content pillars, hook patterns, copy strategy, engagement signals, and ad potential.
          </p>
          <div className="field-group">
            <div>
              <p className="field-label">Instagram Profile URL</p>
              <input
                className="field-input"
                type="url"
                placeholder="https://www.instagram.com/username"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyse()}
              />
              <p className="field-hint">Public profiles only · e.g. https://www.instagram.com/nike</p>
            </div>
          </div>
          <button className="btn-primary" onClick={analyse} disabled={!url.trim()}>
            Analyse Profile
          </button>
        </div>
      )}

      {view === 'loading' && (
        <div className="loading-state">
          <div className="spinner" />
          <p className="loading-text">Scraping &amp; analysing…</p>
          <p className="loading-sub">Pulling the last 50 posts via Apify then running Claude creative analysis. Takes 60–120 seconds.</p>
        </div>
      )}

      {view === 'error' && (
        <div className="error-state">
          <p className="error-title">Analysis failed</p>
          <p className="error-msg">{error}</p>
          <button className="btn-secondary" style={{ marginTop: 12 }} onClick={reset}>Try Again</button>
        </div>
      )}

      {view === 'report' && report && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>

          {/* Profile header */}
          <div style={{ marginBottom: 40 }}>
            <p className="setup-eyebrow">Creative Strategy Report</p>
            <h1 className="setup-title" style={{ marginBottom: 4 }}>{report.profileSnapshot.handle}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {report.profileSnapshot.niche}&nbsp;·&nbsp;{report.profileSnapshot.overallTone}
              {meta?.postsScraped ? ` · ${meta.postsScraped} posts analysed` : ''}
            </p>
            <div style={{ padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {report.profileSnapshot.aestheticSummary}
            </div>
          </div>

          {/* Post type & pillar distribution */}
          <Divider label="Content Mix" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
            <PieChart slices={postTypeSlices} title="Post Type Breakdown" />
            <PieChart
              slices={pillarSlices.length > 0 ? pillarSlices : []}
              title="Content Pillar Distribution"
            />
          </div>

          {/* Top posts */}
          <Divider label="Top 3 Posts by Engagement" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 40 }}>
            {topPosts.map((post, i) => (
              <PostCard key={i} post={post} rank={i + 1} variant="top" />
            ))}
          </div>

          {/* Worst posts */}
          <Divider label="Lowest 3 Posts by Engagement" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 40 }}>
            {worstPosts.map((post, i) => (
              <PostCard key={i} post={post} rank={i + 1} variant="worst" />
            ))}
          </div>

          {/* Content Pillars */}
          <Divider label="Content Pillars" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
            {report.contentPillars.slice(0, 5).map((pillar, i) => {
              const c = PILLAR_COLORS[i];
              return (
                <div key={i} style={{ padding: '18px 20px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{i + 1}. {pillar.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: c.label, background: 'rgba(255,255,255,0.7)', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {pillar.frequency}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>{pillar.description}</p>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: c.label, marginBottom: 4 }}>Strategic Purpose</div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{pillar.strategicPurpose}</p>
                  {pillar.topPost && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: c.label, marginTop: 10, marginBottom: 4 }}>Top Example</div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>{pillar.topPost}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hook Analysis */}
          <Divider label="Hook Analysis" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {(() => {
              const hc = hookStrengthColor(report.hookAnalysis.hookStrength);
              return (
                <div style={{ padding: '16px 18px', background: hc.bg, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: hc.color, marginBottom: 6 }}>Hook Strength</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: hc.color, letterSpacing: '-0.02em', marginBottom: 12 }}>
                    {report.hookAnalysis.hookStrength.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Hook types used</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {report.hookAnalysis.dominantHookTypes.map((t, i) => (
                      <span key={i} style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{t}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <InfoBlock label="Best Hook Example" text={report.hookAnalysis.bestHookExample} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
            <InfoBlock label="Weaknesses" text={report.hookAnalysis.weaknesses} accent="var(--red)" />
            <InfoBlock label="Recommendation" text={report.hookAnalysis.recommendation} accent="var(--blue)" />
          </div>

          {/* Copy Strategy */}
          <Divider label="Copy Strategy" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <StatTile label="Caption Length" value={report.copyStrategy.avgCaptionLength} />
            <StatTile label="Emoji Usage" value={report.copyStrategy.emojiUsage} />
            <StatTile label="CTA Usage" value={report.copyStrategy.ctaUsage} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
            <InfoBlock label="Writing Style & Voice" text={report.copyStrategy.writingStyle} />
            <InfoBlock label="Hashtag Strategy" text={report.copyStrategy.hashtagStrategy} />
            <InfoBlock label="Copy Strengths" text={report.copyStrategy.copyStrengths} accent="var(--green)" />
            <InfoBlock label="Copy Gaps" text={report.copyStrategy.copyGaps} accent="var(--red)" />
          </div>

          {/* Engagement */}
          <Divider label="Engagement Patterns" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <StatTile label="Avg Likes" value={report.engagementPatterns.avgLikesPerPost?.toLocaleString() ?? '—'} />
            <StatTile label="Avg Comments" value={report.engagementPatterns.avgCommentsPerPost?.toLocaleString() ?? '—'} />
            <StatTile label="Best Format" value={report.engagementPatterns.bestPerformingFormat} />
            <StatTile label="Best Pillar" value={report.engagementPatterns.bestPerformingPillar} />
          </div>
          <div style={{ padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 40 }}>
            {report.engagementPatterns.engagementInsight}
          </div>

          {/* Creative Opportunities */}
          <Divider label="Creative Opportunities" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
            {report.creativeOpportunities.map((opp, i) => (
              <div key={i} style={{ padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{i + 1}. {opp.opportunity}</div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>{opp.rationale}</p>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 4 }}>How to execute</div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{opp.howTo}</p>
              </div>
            ))}
          </div>

          {/* Paid Ad Potential */}
          <Divider label="Paid Ad Potential" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <InfoBlock label="Best Organic to Test as Ad" text={report.paidAdPotential.topOrganicToTest} />
            <InfoBlock label="Audience Signals" text={report.paidAdPotential.audienceSignals} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
            <div style={{ padding: '14px 18px', background: 'var(--blue-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--blue)', marginBottom: 6 }}>Leading Creative Angle</div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{report.paidAdPotential.creativeAngle}</p>
            </div>
            <div style={{ padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Suggested Ad Formats</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.paidAdPotential.suggestedAdFormats.map((f, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{f}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Verdict */}
          <Divider label="Strategist Verdict" />
          <div style={{ padding: '20px 24px', background: 'var(--accent)', borderRadius: 8 }}>
            <p style={{ fontSize: 14, color: 'var(--accent-fg)', lineHeight: 1.75, fontWeight: 500 }}>{report.strategistVerdict}</p>
          </div>

        </div>
      )}
    </>
  );
}
