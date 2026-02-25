#!/usr/bin/env node
/**
 * sync-backtest.mjs
 * ══════════════════════════════════════════════════════════════════════
 * Syncs signal log data into public/data/backtest-signals.json
 * so Vercel serverless can read it as a static asset.
 *
 * Run before every deploy:
 *   node sync-backtest.mjs
 *   node sync-backtest.mjs --commit
 *   node sync-backtest.mjs --commit --deploy
 * ══════════════════════════════════════════════════════════════════════
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POST_LOG  = '/data/workspace-shared/signals/telegram-post-log.json';
const OUT       = path.resolve(__dirname, '..', 'public', 'data', 'backtest-signals.json');

function load(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return []; }
}

const rawSignals = load(POST_LOG);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rawSignals, null, 2));
console.log(`[sync-backtest] Wrote ${rawSignals.length} signals → ${OUT}`);

if (process.argv.includes('--commit')) {
  try {
    execSync(
      `cd "${path.resolve(__dirname, '..')}" && git add public/data/backtest-signals.json && git diff --cached --quiet || git commit -m "chore: sync backtest signals snapshot [skip ci]"`,
      { stdio: 'inherit' }
    );
    console.log('[sync-backtest] Committed.');
  } catch { console.log('[sync-backtest] Nothing to commit.'); }
}

if (process.argv.includes('--deploy')) {
  try {
    const creds = JSON.parse(fs.readFileSync('/data/.openclaw/credentials.json', 'utf-8'));
    const tok = creds.vercel_token;
    execSync(
      `cd "${path.resolve(__dirname, '..')}" && vercel --prod --yes --token="${tok}"`,
      { stdio: 'inherit' }
    );
    console.log('[sync-backtest] Deployed to Vercel.');
  } catch (e) { console.error('[sync-backtest] Deploy failed:', e.message); }
}
