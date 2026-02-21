import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/admin-auth.js';
import { getActiveMarkets, getAllActiveMarkets } from '../../_lib/polymarket';
import { getKalshiCached, getKalshiActiveMarkets } from '../../_lib/kalshi';

async function handleHealth(request) {
  const startTime = Date.now();
  const endpoints = {};
  const errors = [];

  // Check scan/polymarket
  let polymarketConnected = false;
  let polymarketCount = 0;
  let polymarketLastFetch = null;
  try {
    const markets = await getAllActiveMarkets(10);
    polymarketConnected = true;
    polymarketCount = markets.length;
    polymarketLastFetch = new Date().toISOString();
    endpoints.scan = { status: 'ok', markets_count: polymarketCount };
  } catch (err) {
    endpoints.scan = { status: 'error', error: err.message };
    errors.push({ endpoint: 'scan', error: err.message, timestamp: new Date().toISOString() });
  }

  // Check Kalshi
  let kalshiConnected = false;
  let kalshiLastFetch = null;
  try {
    const kalshiCached = getKalshiCached();
    kalshiConnected = kalshiCached.data.length > 0;
    kalshiLastFetch = kalshiCached.isFresh ? new Date().toISOString() : null;
    endpoints.pulse = { status: 'ok' };
  } catch (err) {
    endpoints.pulse = { status: 'error', error: err.message };
    errors.push({ endpoint: 'kalshi', error: err.message, timestamp: new Date().toISOString() });
  }

  endpoints.news = { status: 'ok' };
  endpoints.signals = { status: 'ok' };

  const responseTime = Date.now() - startTime;

  return NextResponse.json({
    status: errors.length === 0 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    api_version: '2.0',
    response_time_ms: responseTime,
    endpoints,
    polymarket: {
      connected: polymarketConnected,
      markets_count: polymarketCount,
      last_fetch: polymarketLastFetch,
    },
    kalshi: {
      connected: kalshiConnected,
      last_fetch: kalshiLastFetch,
    },
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const GET = requireAdmin(handleHealth);
