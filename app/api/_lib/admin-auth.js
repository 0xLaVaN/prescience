// Admin API Authentication — Bearer Token
// For internal agent access (TARS scanner, crons, health checks)
// Separate from x402 payment auth — returns 401, not 402

import { NextResponse } from 'next/server';

const RATE_LIMIT_WINDOW = 3600 * 1000; // 1 hour
const RATE_LIMIT_MAX = 1000;
const requestLog = new Map(); // ip -> { count, windowStart }

function checkRateLimit(request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    requestLog.set(ip, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Clean up rate limit map periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) requestLog.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

export function requireAdmin(handler) {
  return async (request) => {
    // Rate limit check
    if (!checkRateLimit(request)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', limit: `${RATE_LIMIT_MAX} requests per hour` },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const adminToken = process.env.PRESCIENCE_ADMIN_TOKEN;

    if (!adminToken || !token || token !== adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return handler(request);
  };
}
