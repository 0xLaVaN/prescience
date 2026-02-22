#!/usr/bin/env node
/**
 * Prescience Resolution Tracker
 * 
 * Checks if markets we signaled have resolved. Generates proof-of-call
 * receipts and posts them to the Telegram community channel.
 * 
 * Flow:
 *   1. Read telegram-post-log.json (our signals)
 *   2. Check each against Polymarket Gamma API for resolution
 *   3. If resolved: generate receipt, post to Telegram, save to scorecard
 *   4. Skip already-processed resolutions
 * 
 * Usage: node resolution-tracker.mjs [--dry]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const BOT_TOKEN = process.env.PRESCIENCE_BOT_TOKEN;
const CHAT_ID = process.env.PRESCIENCE_COMMUNITY_CHAT_ID || '-5124728560';
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';
const RECEIPTS_PATH = '/data/workspace-shared/signals/resolution-receipts.json';
const SCORECARD_PATH = '/data/workspace-shared/signals/scorecard-data.json';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

if (!BOT_TOKEN) { console.error('Missing PRESCIENCE_BOT_TOKEN'); process.exit(1); }

// --- File I/O ---

function loadJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf-8')); } catch { return []; }
}

function saveJson(path, data) {
  const dir = path.split('/').slice(0, -1).join('/');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// --- Polymarket Resolution Check ---

async function checkResolution(slug) {
  // Try Gamma API first
  try {
    const resp = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&limit=1`);
    if (resp.ok) {
      const markets = await resp.json();
      const m = Array.isArray(markets) ? markets[0] : markets;
      if (m) {
        const resolved = m.resolved === true || m.closed === true || m.active === false;
        if (resolved) {
          // Determine outcome
          const outcomePrices = m.outcomePrices ? JSON.parse(m.outcomePrices) : null;
          let outcome = null;
          if (outcomePrices) {
            const yesPrice = parseFloat(outcomePrices[0]);
            outcome = yesPrice > 0.9 ? 'YES' : yesPrice < 0.1 ? 'NO' : null;
          }
          // Check resolvedOutcome field directly
          if (!outcome && m.resolvedOutcome) {
            outcome = m.resolvedOutcome.toUpperCase();
          }
          return {
            resolved: true,
            outcome,
            endDate: m.endDate || m.closedTime,
            question: m.question,
            finalYesPrice: outcomePrices ? parseFloat(outcomePrices[0]) : null,
          };
        }
        return { resolved: false };
      }
    }
  } catch (err) {
    console.error(`Gamma API error for ${slug}: ${err.message}`);
  }

  // Fallback: try our admin API
  try {
    const config = JSON.parse(fs.readFileSync('/data/workspace-shared/config.json', 'utf-8'));
    const resp = await fetch(`${config.admin_api.base_url}/scan?limit=100`, {
      headers: { 'Authorization': `Bearer ${config.admin_api.bearer_token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      const markets = data.scan || data.markets || [];
      const m = markets.find(x => (x.slug || x.conditionId) === slug);
      if (m && (m.resolved || m.closed || m.active === false)) {
        const yesPrice = m.currentPrices?.Yes;
        const outcome = yesPrice > 0.9 ? 'YES' : yesPrice < 0.1 ? 'NO' : null;
        return {
          resolved: true,
          outcome,
          endDate: m.endDate,
          question: m.question,
          finalYesPrice: yesPrice,
        };
      }
    }
  } catch {}

  return { resolved: false };
}

// --- Receipt Formatting ---

function formatReceipt(signal, resolution) {
  const signalDate = new Date(signal.timestamp);
  const now = new Date();
  const daysBefore = Math.round((now - signalDate) / 86400000);
  
  const signalPrice = signal.yesPrice != null ? Math.round(signal.yesPrice * 100) : null;
  const outcomeEmoji = resolution.outcome === 'YES' ? '✅' : resolution.outcome === 'NO' ? '❌' : '⏳';
  
  // Calculate implied P&L
  let pnlLine = '';
  if (signalPrice != null && resolution.outcome) {
    // If outcome is YES and we flagged it: profit = (100 - signalPrice) / signalPrice
    // If outcome is NO: loss = signalPrice / signalPrice = -100% (you lose your bet)
    // But we don't make directional calls — we flag activity. 
    // Show P&L for both sides.
    if (resolution.outcome === 'YES') {
      const yesReturn = ((100 - signalPrice) / signalPrice * 100).toFixed(0);
      pnlLine = `If you bought YES at ${signalPrice}¢: <b>+${yesReturn}%</b>`;
    } else {
      const noPrice = 100 - signalPrice;
      const noReturn = ((100 - noPrice) / noPrice * 100).toFixed(0);
      pnlLine = `If you bought NO at ${noPrice}¢: <b>+${noReturn}%</b>`;
    }
  }

  const lines = [
    `📊 <b>RESOLUTION RECEIPT</b>`,
    '',
    `<b>${resolution.question || signal.question}</b>`,
    '',
    `${outcomeEmoji} Outcome: <b>${resolution.outcome || 'UNKNOWN'}</b>`,
    `🎯 Our signal: ${signalDate.toISOString().split('T')[0]} at ${signalPrice != null ? signalPrice + '¢' : 'N/A'}`,
    `📈 Signal score: ${signal.score}/12`,
  ];
  
  if (pnlLine) lines.push(`💰 ${pnlLine}`);
  if (daysBefore > 0) lines.push(`⏱️ Called it <b>${daysBefore} day${daysBefore > 1 ? 's' : ''}</b> before resolution.`);
  
  lines.push('', `🔗 <a href="https://prescience.markets">Track record → prescience.markets</a>`);
  lines.push('', '<i>Prescience — See who sees first.</i>');
  
  return lines.join('\n');
}

// --- Telegram ---

async function sendTelegram(text) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram: ${data.description}`);
  return data.result;
}

// --- Main ---

async function main() {
  const postLog = loadJson(POST_LOG_PATH);
  const receipts = loadJson(RECEIPTS_PATH);
  const scorecard = loadJson(SCORECARD_PATH);
  
  const processedSlugs = new Set(receipts.map(r => r.slug));
  
  // Only check signals we haven't already processed
  const toCheck = postLog.filter(s => s.slug && !processedSlugs.has(s.slug));
  
  // Deduplicate slugs (same market may appear multiple times in post log)
  const uniqueSlugs = [...new Set(toCheck.map(s => s.slug))];
  
  if (uniqueSlugs.length === 0) {
    console.log(JSON.stringify({ checked: 0, resolved: 0, reason: 'No unprocessed signals' }));
    return;
  }

  console.log(`Checking ${uniqueSlugs.length} unresolved signal(s)...`);
  
  const results = { resolved: [], unresolved: [], errors: [] };
  
  for (const slug of uniqueSlugs) {
    // Get the best signal entry for this slug (highest score)
    const signals = toCheck.filter(s => s.slug === slug);
    const signal = signals.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    
    try {
      // Rate limit: small delay between API calls
      await new Promise(r => setTimeout(r, 500));
      
      const resolution = await checkResolution(slug);
      
      if (!resolution.resolved) {
        results.unresolved.push(slug);
        continue;
      }
      
      if (!resolution.outcome) {
        // Resolved but can't determine outcome — skip for now
        console.log(`⚠️ ${slug}: resolved but outcome unclear, skipping`);
        continue;
      }
      
      const receiptText = formatReceipt(signal, resolution);
      
      if (dryRun) {
        console.log(`[DRY RUN] Would post receipt for: ${signal.question}`);
        console.log(`  Outcome: ${resolution.outcome}`);
        console.log(`  Signal price: ${signal.yesPrice ? Math.round(signal.yesPrice * 100) + '¢' : 'N/A'}`);
      } else {
        try {
          await sendTelegram(receiptText);
          console.log(`✅ Receipt posted: ${signal.question} → ${resolution.outcome}`);
        } catch (err) {
          console.error(`❌ Failed to post receipt for ${slug}: ${err.message}`);
          results.errors.push({ slug, error: err.message });
          continue;
        }
      }
      
      // Save receipt
      const receipt = {
        slug,
        question: signal.question,
        outcome: resolution.outcome,
        signalDate: signal.timestamp,
        signalScore: signal.score,
        signalYesPrice: signal.yesPrice,
        signalFlowDirection: signal.flowDirection,
        resolvedAt: new Date().toISOString(),
        receiptPosted: !dryRun,
      };
      
      receipts.push(receipt);
      
      // Save scorecard entry
      const scorecardEntry = {
        slug,
        question: signal.question,
        outcome: resolution.outcome,
        signalDate: signal.timestamp,
        signalScore: signal.score,
        signalYesPrice: signal.yesPrice,
        resolvedAt: new Date().toISOString(),
        // Calculate P&L for scorecard
        impliedPnlYes: signal.yesPrice != null && resolution.outcome === 'YES'
          ? ((1 - signal.yesPrice) / signal.yesPrice * 100).toFixed(1) + '%'
          : null,
        impliedPnlNo: signal.yesPrice != null && resolution.outcome === 'NO'
          ? (signal.yesPrice / (1 - signal.yesPrice) * 100).toFixed(1) + '%'
          : null,
        hit: null, // We don't make directional calls, so hit/miss is complex
      };
      scorecard.push(scorecardEntry);
      
      results.resolved.push({ slug, outcome: resolution.outcome });
      
    } catch (err) {
      console.error(`Error checking ${slug}: ${err.message}`);
      results.errors.push({ slug, error: err.message });
    }
  }
  
  if (!dryRun) {
    saveJson(RECEIPTS_PATH, receipts);
    saveJson(SCORECARD_PATH, scorecard);
  }
  
  console.log(JSON.stringify({
    checked: uniqueSlugs.length,
    resolved: results.resolved.length,
    unresolved: results.unresolved.length,
    errors: results.errors.length,
    resolvedMarkets: results.resolved,
    dryRun,
  }, null, 2));
}

main();
