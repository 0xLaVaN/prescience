/**
 * PRESCIENCE — Velocity Detection
 * Rate-of-change scoring for markets. Detects volume spikes,
 * wallet creation surges, and flow direction shifts.
 *
 * Uses in-memory snapshot cache (survives within a single Vercel
 * instance lifetime — sufficient for detecting intra-session spikes).
 * For cross-instance persistence, snapshots are embedded in responses
 * so consumers can track deltas externally.
 */

// In-memory snapshot store: conditionId → array of snapshots (max 168 = 7 days hourly)
const snapshotStore = new Map();
const MAX_SNAPSHOTS = 168; // 7 days × 24h
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour minimum between snapshots

/**
 * Store a market snapshot for velocity tracking.
 */
export function recordSnapshot(conditionId, data) {
  if (!conditionId) return;

  const now = Date.now();
  let snapshots = snapshotStore.get(conditionId) || [];

  // Don't store more than once per hour
  const last = snapshots[snapshots.length - 1];
  if (last && (now - last.ts) < SNAPSHOT_INTERVAL_MS) return;

  snapshots.push({
    ts: now,
    volume24h: data.volume24h || 0,
    totalVolume: data.totalVolume || 0,
    totalWallets: data.totalWallets || 0,
    freshWallets: data.freshWallets || 0,
    flowDirectionV2: data.flowDirectionV2 || 'NEUTRAL',
    minoritySideFlow: data.minoritySideFlow || 0,
    majoritySideFlow: data.majoritySideFlow || 0,
    threatScore: data.threatScore || 0,
  });

  // Keep max snapshots
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS);
  }

  snapshotStore.set(conditionId, snapshots);
}

/**
 * Get historical snapshots for a market.
 */
export function getSnapshots(conditionId) {
  return snapshotStore.get(conditionId) || [];
}

/**
 * Compute velocity score for a market based on current data + history.
 *
 * Components:
 *   1. volume_spike: current 24h volume vs average of previous snapshots (0-40 pts)
 *   2. wallet_velocity: fresh wallet creation rate vs baseline (0-30 pts)
 *   3. flow_shift: did flow direction change recently? (0-30 pts)
 *
 * Returns: { velocity_score, volume_spike, wallet_velocity, flow_shift, details }
 */
export function computeVelocity(conditionId, currentData) {
  const snapshots = getSnapshots(conditionId);
  const now = Date.now();

  // Record current state
  recordSnapshot(conditionId, currentData);

  const result = {
    velocity_score: 0,
    volume_spike: 0,
    wallet_velocity: 0,
    flow_shift: 0,
    volume_spike_ratio: null,
    fresh_wallet_rate_per_hour: null,
    flow_changed: false,
    previous_flow: null,
    snapshots_available: snapshots.length,
    details: {},
  };

  // --- 1. Volume Spike Detection ---
  // Compare current 24h volume to historical average
  const vol24h = currentData.volume24h || 0;

  if (snapshots.length >= 2) {
    // Average volume from snapshots older than 6h (avoid self-comparison)
    const olderSnapshots = snapshots.filter(s => (now - s.ts) > 6 * 3600 * 1000);
    if (olderSnapshots.length > 0) {
      const avgVol = olderSnapshots.reduce((sum, s) => sum + (s.volume24h || 0), 0) / olderSnapshots.length;
      if (avgVol > 0) {
        const spikeRatio = vol24h / avgVol;
        result.volume_spike_ratio = Math.round(spikeRatio * 100) / 100;

        // Score: 3x = 20pts, 5x = 30pts, 10x+ = 40pts
        if (spikeRatio >= 10) result.volume_spike = 40;
        else if (spikeRatio >= 5) result.volume_spike = 30;
        else if (spikeRatio >= 3) result.volume_spike = 20;
        else if (spikeRatio >= 2) result.volume_spike = 10;
        else if (spikeRatio >= 1.5) result.volume_spike = 5;
      }
    }
  } else {
    // No history — use heuristic: high absolute volume = moderate spike signal
    // Compare volume to liquidity as proxy
    const liq = currentData.liquidity || 1;
    if (vol24h > liq * 3) result.volume_spike = 15;
    else if (vol24h > liq * 2) result.volume_spike = 8;
  }

  // --- 2. Wallet Velocity ---
  // Fresh wallets per hour (new wallets appearing recently)
  const freshWallets = currentData.freshWallets || 0;
  const totalWallets = currentData.totalWallets || 1;

  // Estimate wallets/hour from fresh wallet count (fresh = <7 days old)
  // Rough: if 20 fresh wallets over ~24h sample = ~0.83/hr
  const estimatedHours = 24; // trade sample roughly covers 24h
  const freshRate = freshWallets / estimatedHours;
  result.fresh_wallet_rate_per_hour = Math.round(freshRate * 100) / 100;

  // Compare to baseline from snapshots
  if (snapshots.length >= 2) {
    const olderSnapshots = snapshots.filter(s => (now - s.ts) > 6 * 3600 * 1000);
    if (olderSnapshots.length > 0) {
      const avgFresh = olderSnapshots.reduce((sum, s) => sum + (s.freshWallets || 0), 0) / olderSnapshots.length;
      const baselineRate = avgFresh / estimatedHours;
      if (baselineRate > 0) {
        const walletSpikeRatio = freshRate / baselineRate;
        if (walletSpikeRatio >= 5) result.wallet_velocity = 30;
        else if (walletSpikeRatio >= 3) result.wallet_velocity = 20;
        else if (walletSpikeRatio >= 2) result.wallet_velocity = 10;
      } else if (freshRate > 1) {
        result.wallet_velocity = 15; // New activity where none existed
      }
    }
  } else {
    // No history — use absolute thresholds
    if (freshRate > 5) result.wallet_velocity = 20;
    else if (freshRate > 2) result.wallet_velocity = 10;
    else if (freshRate > 0.5) result.wallet_velocity = 5;
  }

  // --- 3. Flow Direction Shift ---
  // Check if flow direction changed in recent snapshots
  const recentSnapshots = snapshots.filter(s => (now - s.ts) < 24 * 3600 * 1000);
  const currentFlow = currentData.flowDirectionV2 || 'NEUTRAL';

  if (recentSnapshots.length > 0) {
    const previousFlow = recentSnapshots[0].flowDirectionV2;
    result.previous_flow = previousFlow;

    // Meaningful shifts
    const shiftMap = {
      'MAJORITY_ALIGNED→MINORITY_HEAVY': 30,  // Major reversal — biggest signal
      'MAJORITY_ALIGNED→MIXED': 15,
      'NEUTRAL→MINORITY_HEAVY': 25,
      'MIXED→MINORITY_HEAVY': 15,
      'MINORITY_HEAVY→MAJORITY_ALIGNED': 10,  // Smart money exiting?
    };

    const shiftKey = `${previousFlow}→${currentFlow}`;
    if (shiftMap[shiftKey]) {
      result.flow_shift = shiftMap[shiftKey];
      result.flow_changed = true;
    }
  }

  // --- Composite Score ---
  result.velocity_score = Math.min(100, result.volume_spike + result.wallet_velocity + result.flow_shift);

  result.details = {
    volume_spike_pts: result.volume_spike,
    wallet_velocity_pts: result.wallet_velocity,
    flow_shift_pts: result.flow_shift,
  };

  return result;
}
