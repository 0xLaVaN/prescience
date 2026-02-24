/**
 * PRESCIENCE — Cross-Market Correlation
 * Detect correlated markets by shared wallet activity.
 *
 * Signal: Same wallets betting on 2+ markets within a 24h window
 * suggests coordinated positioning — one thesis expressed across markets.
 * (e.g. wallets buying YES on Iran Strike + YES on Oil Spike + YES on Defense ETF)
 */

const DATA_API = 'https://data-api.polymarket.com';

// Cache correlation results (expensive to compute)
const correlationCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 min

function cacheGet(key) {
  const entry = correlationCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function cacheSet(key, data) {
  correlationCache.set(key, { data, ts: Date.now() });
}

async function safeFetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch trades for a market from Data API (recent 24h filter applied in-memory)
 */
async function getRecentTrades(conditionId, windowHours = 24) {
  const cacheKey = `corr_trades_${conditionId}_${windowHours}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const cutoff = Math.floor(Date.now() / 1000) - windowHours * 3600;
  const data = await safeFetchJSON(
    `${DATA_API}/trades?market=${conditionId}&limit=500`
  );

  if (!Array.isArray(data)) return [];

  // Filter to trades within the time window
  const recent = data.filter(t => (t.timestamp || 0) >= cutoff);
  cacheSet(cacheKey, recent);
  return recent;
}

/**
 * Extract unique wallet addresses from trades.
 * Returns a Set of lowercase wallet addresses.
 */
function extractWallets(trades) {
  const wallets = new Set();
  for (const t of trades) {
    const w = (t.proxyWallet || '').toLowerCase().trim();
    if (w && w.length > 0) wallets.add(w);
  }
  return wallets;
}

/**
 * Compute wallet volume per market (for narrative generation)
 */
function computeWalletVolumes(trades) {
  const volumes = {};
  for (const t of trades) {
    const w = (t.proxyWallet || '').toLowerCase().trim();
    if (!w) continue;
    const size = (t.size || 0) * (t.price || 0);
    volumes[w] = (volumes[w] || 0) + size;
  }
  return volumes;
}

/**
 * Build clusters of correlated markets using shared wallets.
 *
 * Algorithm:
 * 1. Build inverted index: wallet → [marketIds]
 * 2. Find wallets appearing in 2+ markets
 * 3. Build adjacency: market pair → shared wallet count
 * 4. Group markets into clusters via union-find
 * 5. Filter clusters with >= minSharedWallets
 *
 * @param {Array} marketData - Array of { conditionId, question, slug, exchange, volume24hr, walletsInWindow, tradesInWindow }
 * @param {number} minSharedWallets - Minimum shared wallets to flag a cluster (default: 5)
 * @returns {Array} clusters sorted by shared wallet count descending
 */
export function buildCorrelationClusters(marketData, minSharedWallets = 5) {
  if (!marketData || marketData.length === 0) return [];

  // Build inverted index: wallet → Set of marketIds
  const walletToMarkets = new Map();
  for (const m of marketData) {
    const walletSet = m.walletsInWindow || new Set();
    for (const w of walletSet) {
      if (!walletToMarkets.has(w)) walletToMarkets.set(w, new Set());
      walletToMarkets.get(w).add(m.conditionId);
    }
  }

  // Find wallets that appear in 2+ markets (cross-market movers)
  const crossMarketWallets = new Map(); // wallet → Set of marketIds
  for (const [wallet, markets] of walletToMarkets) {
    if (markets.size >= 2) {
      crossMarketWallets.set(wallet, markets);
    }
  }

  // Build adjacency matrix: marketId pair → shared wallet details
  const adjacency = new Map(); // `${m1}|${m2}` → { count, wallets: Set, combinedVolume }
  const marketMap = new Map(marketData.map(m => [m.conditionId, m]));

  for (const [wallet, markets] of crossMarketWallets) {
    const marketList = [...markets];
    for (let i = 0; i < marketList.length; i++) {
      for (let j = i + 1; j < marketList.length; j++) {
        const a = marketList[i], b = marketList[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!adjacency.has(key)) {
          adjacency.set(key, { marketA: a, marketB: b, sharedWallets: new Set(), walletVolumes: {} });
        }
        const entry = adjacency.get(key);
        entry.sharedWallets.add(wallet);
        // Accumulate wallet volumes across both markets
        const mA = marketMap.get(a);
        const mB = marketMap.get(b);
        const volA = mA?.walletVolumes?.[wallet] || 0;
        const volB = mB?.walletVolumes?.[wallet] || 0;
        entry.walletVolumes[wallet] = (entry.walletVolumes[wallet] || 0) + volA + volB;
      }
    }
  }

  // Union-Find for cluster grouping
  const parent = {};
  const rank = {};
  function find(x) {
    if (!parent[x]) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x, y) {
    const px = find(x), py = find(y);
    if (px === py) return;
    if ((rank[px] || 0) < (rank[py] || 0)) { parent[px] = py; }
    else if ((rank[px] || 0) > (rank[py] || 0)) { parent[py] = px; }
    else { parent[py] = px; rank[px] = (rank[px] || 0) + 1; }
  }

  // Only union market pairs with >= minSharedWallets
  const significantEdges = [];
  for (const [, edge] of adjacency) {
    if (edge.sharedWallets.size >= minSharedWallets) {
      union(edge.marketA, edge.marketB);
      significantEdges.push(edge);
    }
  }

  // Group markets by cluster root
  const clusterMap = new Map();
  for (const m of marketData) {
    const root = find(m.conditionId);
    // Only include markets that are part of a significant edge
    const isInSignificantEdge = significantEdges.some(
      e => e.marketA === m.conditionId || e.marketB === m.conditionId
    );
    if (!isInSignificantEdge) continue;
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(m);
  }

  // Build cluster objects
  const clusters = [];
  let clusterIdx = 0;

  for (const [root, members] of clusterMap) {
    if (members.length < 2) continue;

    // Collect all shared wallet info for this cluster
    const clusterEdges = significantEdges.filter(
      e => members.some(m => m.conditionId === e.marketA) &&
           members.some(m => m.conditionId === e.marketB)
    );

    // Merge shared wallets across all edges in cluster
    const allSharedWallets = new Set();
    for (const e of clusterEdges) {
      for (const w of e.sharedWallets) allSharedWallets.add(w);
    }

    // Combined volume: sum of each market's total volume
    const combinedVolume = members.reduce((sum, m) => sum + (parseFloat(m.volume24hr) || 0), 0);

    // Max shared wallets between any pair (the tightest connection)
    const maxPairShared = clusterEdges.length > 0
      ? Math.max(...clusterEdges.map(e => e.sharedWallets.size))
      : 0;

    // Top shared wallets by volume (for signal quality)
    const topSharedWallets = Object.entries(
      clusterEdges.reduce((acc, e) => {
        for (const [w, vol] of Object.entries(e.walletVolumes)) {
          acc[w] = (acc[w] || 0) + vol;
        }
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([addr, vol]) => ({ addr: addr.slice(0, 8) + '…', volume_usd: Math.round(vol) }));

    // Narrative summary
    const narrative = generateNarrative(members, allSharedWallets.size, combinedVolume);

    clusters.push({
      cluster_id: `cluster_${++clusterIdx}`,
      markets: members.map(m => ({
        question: m.question,
        slug: m.slug,
        exchange: m.exchange,
        conditionId: m.conditionId,
        volume24hr: m.volume24hr,
        threat_score: m.threat_score || 0,
        threat_level: m.threat_level || 'LOW',
      })),
      shared_wallet_count: allSharedWallets.size,
      max_pair_shared_wallets: maxPairShared,
      combined_volume_24h_usd: Math.round(combinedVolume),
      top_shared_wallets: topSharedWallets,
      narrative,
      signal_strength: allSharedWallets.size >= 20 ? 'STRONG' :
                       allSharedWallets.size >= 10 ? 'MODERATE' : 'WEAK',
      detected_at: new Date().toISOString(),
    });
  }

  // Sort by shared_wallet_count descending (tightest correlations first)
  clusters.sort((a, b) => b.shared_wallet_count - a.shared_wallet_count);
  return clusters;
}

/**
 * Generate a human-readable narrative for a cluster
 */
function generateNarrative(markets, sharedCount, combinedVolume) {
  if (markets.length === 0) return '';
  const volStr = combinedVolume >= 1e6
    ? `$${(combinedVolume / 1e6).toFixed(1)}M`
    : `$${Math.round(combinedVolume / 1000)}K`;

  const questions = markets.map(m => `"${m.question.slice(0, 60)}${m.question.length > 60 ? '…' : ''}"`);

  if (markets.length === 2) {
    return `${sharedCount} wallets active in both ${questions[0]} and ${questions[1]} (${volStr} combined 24h volume). Coordinated positioning suggests one thesis expressed across markets.`;
  }
  return `${sharedCount} wallets active across ${markets.length} correlated markets (${questions.slice(0, 2).join(', ')} +${markets.length - 2} more, ${volStr} combined 24h volume). Cross-market positioning pattern detected.`;
}

/**
 * Main export: run correlation analysis on a set of markets.
 *
 * @param {Array} markets - Array of scan result objects (must have conditionId, question, slug, exchange, volume24hr)
 * @param {object} options
 * @param {number} options.windowHours - Look-back window for trades (default: 24)
 * @param {number} options.minSharedWallets - Min wallets to flag cluster (default: 5)
 * @param {number} options.maxMarkets - Max markets to analyze (default: 80)
 * @returns {Promise<{clusters, meta}>}
 */
export async function runCorrelationAnalysis(markets, {
  windowHours = 24,
  minSharedWallets = 5,
  maxMarkets = 80,
} = {}) {
  const cacheKey = `correlation_${maxMarkets}_${windowHours}_${minSharedWallets}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const topMarkets = markets.slice(0, maxMarkets);

  // Fetch trades for all markets concurrently (batches of 15)
  const BATCH = 15;
  const enriched = [];
  for (let i = 0; i < topMarkets.length; i += BATCH) {
    const batch = topMarkets.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(m => getRecentTrades(m.conditionId, windowHours).catch(() => []))
    );
    for (let j = 0; j < batch.length; j++) {
      const m = batch[j];
      const trades = results[j];
      enriched.push({
        conditionId: m.conditionId,
        question: m.question,
        slug: m.slug,
        exchange: m.exchange || 'polymarket',
        volume24hr: m.volume24hr,
        threat_score: m.threat_score,
        threat_level: m.threat_level,
        walletsInWindow: extractWallets(trades),
        walletVolumes: computeWalletVolumes(trades),
        tradeCount: trades.length,
      });
    }
  }

  const clusters = buildCorrelationClusters(enriched, minSharedWallets);

  const result = {
    clusters,
    meta: {
      markets_analyzed: enriched.length,
      clusters_found: clusters.length,
      min_shared_wallets_threshold: minSharedWallets,
      window_hours: windowHours,
      computed_at: new Date().toISOString(),
    },
  };

  cacheSet(cacheKey, result);
  return result;
}
