/**
 * PRESCIENCE — Context-Aware Scoring Layer
 *
 * Classifies markets into semantic categories and applies category-specific
 * scoring adjustments. Runs as a post-processing layer after raw conviction
 * is computed.
 *
 * Categories:
 *   geopolitical  — war, sanctions, military, international conflict
 *   political     — elections, legislation, candidates, government
 *   crypto        — Bitcoin, Ethereum, DeFi, blockchain
 *   sports        — all competitive sports (already filtered in dampening.js)
 *   general       — everything else
 *
 * Adjustments:
 *   1. Geopolitical news-cycle dampening: MAJORITY_ALIGNED + low fw_excess → dampen
 *   2. Sports longshot: endDate >90 days + Yes<5% → fw_excess multiplier 0.5
 *   3. Extreme longshot cap: Yes<2% or No<2% → conviction cap 3 (unless fw_excess >0.20)
 */

// ────────────────────────────────────────────────────────────────────────────
// Keyword lists
// ────────────────────────────────────────────────────────────────────────────

const GEOPOLITICAL_KEYWORDS = [
  'war', 'invasion', 'attack', 'strike', 'military', 'troops', 'army',
  'sanction', 'nuclear', 'missile', 'drone', 'airstrike', 'ceasefire',
  'peace deal', 'treaty', 'nato', 'blockade', 'siege', 'annexe', 'annex',
  'occupied', 'regime', 'coup', 'revolution', 'insurgent', 'rebel',
  'russia', 'ukraine', 'china', 'taiwan', 'iran', 'israel', 'palestine',
  'gaza', 'hezbollah', 'hamas', 'houthi', 'north korea', 'kim jong',
  'diplomat', 'embassy', 'consul', 'foreign minister', 'secretary of state',
  'un resolution', 'security council', 'g7', 'g20',
];

const POLITICAL_KEYWORDS = [
  'election', 'president', 'senator', 'congress', 'congressional', 'vote',
  'ballot', 'democrat', 'republican', 'trump', 'biden', 'harris', 'desantis',
  'primary', 'candidate', 'campaign', 'polling', 'supreme court', 'legislation',
  'governor', 'mayor', 'speaker of the house', 'cabinet', 'resign', 'impeach',
  'indicted', 'conviction', 'acquitted', 'pardoned', 'filibuster',
  'midterm', 'general election', 'runoff', 'recount', 'swing state',
  'electoral college', 'popular vote', 'approval rating',
];

const CRYPTO_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi',
  'nft', 'token', 'altcoin', 'binance', 'coinbase', 'solana', 'sol',
  'usdc', 'usdt', 'stablecoin', 'mining', 'staking', 'dex', 'dao',
  'metaverse', 'web3', 'layer 2', 'l2', 'polygon', 'avalanche', 'base',
  'ripple', 'xrp', 'cardano', 'ada', 'dogecoin', 'doge', 'shib',
  'memecoin', 'on-chain', 'halving', 'etf approval',
];

const SPORTS_PATTERNS = [
  /\bnba\b/i, /\bnfl\b/i, /\bnhl\b/i, /\bmlb\b/i, /\bnba\b/i,
  /\bufc\b/i, /\bpremier league\b/i, /\bworld cup\b/i,
  /\bsuper bowl\b/i, /\bplayoff\b/i, /\bfinals?\b/i,
  /\bchampionship\b/i, /\btournament\b/i, /\bstandings\b/i,
  /vs\.?\s+\w+/i, // "team vs team" pattern
  /\bscore\b.*\bgame\b/i,
  /\bover\/under\b/i, /\bmoneyline\b/i, /\bspread\b/i,
];

// ────────────────────────────────────────────────────────────────────────────
// Category classifier
// ────────────────────────────────────────────────────────────────────────────

// Primary crypto identifiers — if these appear in the QUESTION, always classify as crypto.
// Prevents description-pollution from sports patterns misclassifying BTC/ETH markets.
const PRIMARY_CRYPTO_IDENTIFIERS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi',
  'nft', 'halving', 'on-chain', 'dogecoin', 'doge', 'solana', 'shib',
];

// Sports keywords that reliably identify sports when found in the question itself.
// Checked before description pollution can affect scoring.
const SPORTS_QUESTION_KEYWORDS = [
  'nba', 'nfl', 'nhl', 'mlb', 'ufc', 'pga', 'mma', 'f1', 'formula 1',
  'ligue 1', 'la liga', 'serie a', 'bundesliga', 'premier league',
  'champions league', 'europa league', 'world cup', 'super bowl',
  'stanley cup', 'championship', 'playoff', 'tournament',
];

/**
 * Classify a market by topic category.
 * @param {Object} market - Market with .question, .description
 * @returns {string} 'geopolitical' | 'political' | 'crypto' | 'sports' | 'general'
 */
export function classifyMarket(market) {
  const q = (market.question || '').toLowerCase();
  const desc = (market.description || '').toLowerCase();
  const text = q + ' ' + desc;

  // ── Priority 0: Strong sports identifiers in the QUESTION itself ────────
  // Prevents crypto keywords in descriptions from misclassifying sports markets.
  // (e.g. "Will Lens win Ligue 1?" has description mentioning "Avalanche" blockchain)
  if (SPORTS_QUESTION_KEYWORDS.some(kw => q.includes(kw))) return 'sports';

  // ── Priority 1: Primary crypto identifiers in the QUESTION itself ────────
  // Prevents sports patterns in descriptions from misclassifying BTC/ETH markets.
  // (e.g. "Will Bitcoin dip to $55K?" may have description with "finals"/"game")
  if (PRIMARY_CRYPTO_IDENTIFIERS.some(kw => q.includes(kw))) return 'crypto';

  // Sports — check full text (question + description) for specific patterns
  if (SPORTS_PATTERNS.some(p => p.test(text))) return 'sports';

  // Score keyword matches
  const geoScore = GEOPOLITICAL_KEYWORDS.filter(kw => text.includes(kw)).length;
  const polScore = POLITICAL_KEYWORDS.filter(kw => text.includes(kw)).length;
  const cryptoScore = CRYPTO_KEYWORDS.filter(kw => text.includes(kw)).length;

  // Threshold: 2+ matches for strong category, 1 for tentative
  if (geoScore >= 2) return 'geopolitical';
  if (polScore >= 2) return 'political';
  if (cryptoScore >= 2) return 'crypto';
  // Single match — pick highest
  const max = Math.max(geoScore, polScore, cryptoScore);
  if (max === 1) {
    if (geoScore === 1) return 'geopolitical';
    if (polScore === 1) return 'political';
    if (cryptoScore === 1) return 'crypto';
  }

  return 'general';
}

// ────────────────────────────────────────────────────────────────────────────
// Context scoring
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute context-aware adjustments for a market after initial conviction scoring.
 *
 * Called BEFORE the final threat_score is committed.
 * Returns modifiers that the caller applies.
 *
 * @param {Object} market            - Raw market object (question, description, endDate, outcomePrices)
 * @param {Object} opts
 * @param {number} opts.freshWalletExcess   - excessFreshRatio (raw, pre-flow-dampening)
 * @param {string} opts.flowDirectionV2     - 'MAJORITY_ALIGNED' | 'MINORITY_HEAVY' | 'MIXED'
 * @param {Object} opts.currentPrices       - { 'Yes': 0.27, 'No': 0.73 } etc.
 * @param {number} opts.threatScore         - Raw threat score (before cap)
 * @param {boolean} opts.consensusDampened  - Whether consensus dampening already applied
 *
 * @returns {{
 *   market_category: string,
 *   fw_excess_multiplier: number,     // Applied to effectiveFwExcess in scoring
 *   threat_score_cap: number|null,    // Hard cap on final threat score (null = no cap)
 *   context_dampening: number,        // 0–1 factor to multiply final score (1 = no effect)
 *   context_note: string|null,        // Human-readable reason
 * }}
 */
export function computeContextScoring(market, {
  freshWalletExcess,
  flowDirectionV2,
  currentPrices,
  threatScore,
  consensusDampened = false,
}) {
  const category = classifyMarket(market);

  let fwExcessMultiplier = 1.0;
  let threatScoreCap = null;
  let contextDampening = 1.0;   // multiply final score (1 = unchanged)
  const notes = [];

  // ── Resolve minimum and maximum outcome price ────────────────────────────
  let minPrice = 1.0, maxPrice = 0.0;
  try {
    const prices = Object.values(currentPrices || {}).map(Number).filter(p => !isNaN(p));
    if (prices.length > 0) {
      minPrice = Math.min(...prices);
      maxPrice = Math.max(...prices);
    }
  } catch {}

  // ── Adjustment 1: Geopolitical news-cycle dampening ─────────────────────
  //
  // Geopolitical news events drive retail crowds to bet on the obvious outcome
  // (MAJORITY_ALIGNED). This looks like a volume spike but is NOT insider flow.
  // Dampen when: geopolitical + majority_aligned + low fresh excess.
  // Do NOT dampen if flow is MINORITY_HEAVY (potential insider).
  if (category === 'geopolitical') {
    if (flowDirectionV2 === 'MAJORITY_ALIGNED' && freshWalletExcess < 0.10) {
      // News-cycle retail consensus in geopolitical market
      contextDampening = Math.min(contextDampening, 0.6);
      notes.push('geo_news_cycle(majority_aligned,fw_excess<0.10)');
    }
    // MINORITY_HEAVY geopolitical markets are high-value — no dampening, add note
    if (flowDirectionV2 === 'MINORITY_HEAVY' && freshWalletExcess >= 0.10) {
      notes.push('geo_minority_signal(elevated_confidence)');
    }
  }

  // ── Adjustment 2: Political consensus dampening ──────────────────────────
  //
  // Political markets (elections, legislation) often see consensus retail flow
  // as public sentiment — not insider information. Apply soft dampening when
  // flow is majority-aligned and there's no fresh-wallet signal.
  if (category === 'political') {
    if (flowDirectionV2 === 'MAJORITY_ALIGNED' && freshWalletExcess < 0.08) {
      contextDampening = Math.min(contextDampening, 0.7);
      notes.push('political_consensus(majority_aligned)');
    }
  }

  // ── Adjustment 3: Sports longshot dampening ──────────────────────────────
  //
  // Far-dated sports longshots (Yes<5%, endDate>90 days) are retail fan bets,
  // not informed prediction. Dampen fresh wallet excess contribution by 50%.
  if (category === 'sports') {
    const endDateMs = market.endDate ? new Date(market.endDate).getTime() : null;
    const daysToEnd = endDateMs ? (endDateMs - Date.now()) / 86400000 : 0;
    if (minPrice < 0.05 && daysToEnd > 90) {
      fwExcessMultiplier = Math.min(fwExcessMultiplier, 0.5);
      notes.push(`sports_longshot(<5¢,${Math.round(daysToEnd)}d_to_end)`);
    }
  }

  // ── Adjustment 4: Extreme longshot conviction cap ────────────────────────
  //
  // Markets where one outcome trades below 2¢ are near-certainties.
  // Fresh wallet excess in these markets usually reflects retail late-joiners,
  // not insiders. Cap conviction at 3 unless fw_excess is strongly anomalous.
  //
  // Exception: if fresh_wallet_excess > 0.20, something unusual IS happening
  // (e.g. late whale positioning on a supposed certainty) — allow normal scoring.
  if ((minPrice < 0.02) && freshWalletExcess <= 0.20 && !consensusDampened) {
    threatScoreCap = threatScoreCap === null ? 3 : Math.min(threatScoreCap, 3);
    notes.push(`extreme_longshot(<2¢,fw_excess≤0.20)`);
  }

  return {
    market_category: category,
    fw_excess_multiplier: fwExcessMultiplier,
    threat_score_cap: threatScoreCap,
    context_dampening: contextDampening,
    context_note: notes.length > 0 ? notes.join('; ') : null,
  };
}
