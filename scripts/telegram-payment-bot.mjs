#!/usr/bin/env node
/**
 * Prescience Telegram Payment Verification Bot
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies USDC payments on Base and grants Pro tier access.
 *
 * FLOW (V1):
 *   1. User sends $20 USDC on Base to our wallet
 *   2. User DMs this bot their Base tx hash
 *   3. Bot verifies: correct USDC token, amount >= $20, correct
 *      recipient, transaction confirmed
 *   4. Bot writes user to pro-subscribers.json (30-day expiry)
 *   5. User gets instant DM signal delivery (bypasses 1hr free delay)
 *
 * FLOW (V2 — expiry management):
 *   6. 3 days before expiry: notify user to renew
 *   7. On expiry: remove Pro status, notify user
 *
 * Commands:
 *   /start  — welcome + setup instructions
 *   /help   — how to pay + what Pro includes
 *   /status — current Pro status + expiry
 *   <tx>    — verify a Base transaction hash
 *
 * Pro subscriber file: /data/workspace-shared/signals/pro-subscribers.json
 *
 * USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * Our wallet:   0x001c1422dbad5d258c4e0824c5510b7cf8c6c97a
 * Amount min:   20 USDC (20_000_000 raw)
 *
 * Usage:
 *   node telegram-payment-bot.mjs [--dry] [--check-expiry]
 *
 * --dry           Run without posting to Telegram
 * --check-expiry  Run expiry check only, then exit
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env ───────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const BOT_TOKEN = process.env.PRESCIENCE_BOT_TOKEN;
if (!BOT_TOKEN) { console.error('Missing PRESCIENCE_BOT_TOKEN'); process.exit(1); }

// ── Config ────────────────────────────────────────────────────────────
const SUBSCRIBERS_PATH = '/data/workspace-shared/signals/pro-subscribers.json';
const FREE_CHANNEL_ID  = '-5124728560'; // Prescience community chat

// Base network constants
const BASE_RPC_URL  = 'https://mainnet.base.org';
const USDC_ADDRESS  = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // Base USDC
const PRO_WALLET    = '0x001c1422dbad5d258c4e0824c5510b7cf8c6c97a'; // Our payment wallet
const USDC_DECIMALS = 6;
const MIN_USDC_RAW  = 20 * Math.pow(10, USDC_DECIMALS); // 20 USDC
const PRO_DAYS      = 30;
const PRO_MS        = PRO_DAYS * 24 * 3600 * 1000;
// ERC-20 Transfer(address,address,uint256) topic
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const checkExpiryOnly = args.includes('--check-expiry');

// ── HTTP helpers ──────────────────────────────────────────────────────
function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } }); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function tgPost(method, params) {
  if (dryRun) { console.log(`[DRY] ${method}`, JSON.stringify(params).slice(0, 120)); return Promise.resolve({ ok: true }); }
  return post('api.telegram.org', `/bot${BOT_TOKEN}/${method}`, params);
}

function tgGet(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/${method}?${qs}`, res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    }).on('error', reject);
  });
}

// ── Base JSON-RPC ─────────────────────────────────────────────────────
let rpcId = 1;
function baseRPC(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ });
    const req = https.request(
      { hostname: 'mainnet.base.org', path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b).result); } catch { resolve(null); } }); }
    );
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ── Pro Subscribers ───────────────────────────────────────────────────
function loadSubscribers() {
  try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_PATH, 'utf-8')); } catch { return []; }
}

function saveSubscribers(subs) {
  const dir = path.dirname(SUBSCRIBERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBSCRIBERS_PATH, JSON.stringify(subs, null, 2));
}

function getSubscriber(chatId) {
  const subs = loadSubscribers();
  return subs.find(s => String(s.chat_id) === String(chatId));
}

function upsertSubscriber(sub) {
  const subs = loadSubscribers();
  const idx = subs.findIndex(s => String(s.chat_id) === String(sub.chat_id));
  if (idx >= 0) subs[idx] = { ...subs[idx], ...sub };
  else subs.push(sub);
  saveSubscribers(subs);
}

// ── USDC Payment Verification ─────────────────────────────────────────
async function verifyUSDCPayment(txHash) {
  const normalised = txHash.toLowerCase().startsWith('0x') ? txHash.toLowerCase() : '0x' + txHash.toLowerCase();

  // 1. Get transaction receipt
  const receipt = await baseRPC('eth_getTransactionReceipt', [normalised]);
  if (!receipt) {
    // Could be unconfirmed — check if tx exists at all
    const tx = await baseRPC('eth_getTransactionByHash', [normalised]);
    if (!tx) return { valid: false, reason: 'Transaction not found on Base. Check the hash and try again.' };
    return { valid: false, reason: 'Transaction found but not yet confirmed. Wait for 1 confirmation and try again.' };
  }

  // 2. Check success
  if (receipt.status !== '0x1') {
    return { valid: false, reason: 'Transaction failed (reverted). Please send a new transaction.' };
  }

  // 3. Check for USDC Transfer log matching our wallet
  const logs = receipt.logs || [];
  let found = null;

  for (const log of logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS) continue;
    if (!log.topics || log.topics.length < 3) continue;
    if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;

    // Decode: topics[1]=from, topics[2]=to (both 32-byte padded)
    const to = ('0x' + log.topics[2].slice(-40)).toLowerCase();
    if (to !== PRO_WALLET) continue;

    const amount = parseInt(log.data, 16);
    if (amount < MIN_USDC_RAW) {
      return {
        valid: false,
        reason: `USDC transfer found but amount too small: $${(amount / Math.pow(10, USDC_DECIMALS)).toFixed(2)} USDC. Pro requires $20.00 USDC.`,
      };
    }

    const from = ('0x' + log.topics[1].slice(-40)).toLowerCase();
    found = { amount, amountUsdc: amount / Math.pow(10, USDC_DECIMALS), from, to, txHash: normalised };
    break;
  }

  if (!found) {
    return {
      valid: false,
      reason: 'No USDC transfer to our wallet found in this transaction.\n\n'
        + `Expected: USDC (Base) → ${PRO_WALLET}\n`
        + 'Make sure you sent to the correct wallet on Base network.',
    };
  }

  // 4. Check for duplicate — already used to pay
  const subs = loadSubscribers();
  const duplicate = subs.find(s => s.payment_txs?.includes(normalised));
  if (duplicate) {
    return { valid: false, reason: `This transaction was already used to activate Pro for another account.` };
  }

  return { valid: true, ...found };
}

// ── Message formatting ────────────────────────────────────────────────
const INSTRUCTIONS = `
💳 <b>How to get Pro access:</b>

1. Send <b>$20 USDC</b> on <b>Base network</b> to:
   <code>${PRO_WALLET}</code>

2. DM me your transaction hash:
   <code>0x1234abcd...</code>

3. I'll verify on-chain and activate your Pro status within 60 seconds.

<b>Pro includes:</b>
• ⚡ Instant signal DMs (no 1hr delay)
• 🎯 STRONG_CALL priority alerts
• 📊 Volume spike notifications
• Valid for 30 days · Renew anytime

⚠️ Base network only. USDC only. Min $20.00.`;

function proStatusMsg(sub) {
  if (!sub || !sub.active) return `❌ <b>No active Pro subscription.</b>\n\nSend /help to see how to subscribe.`;
  const expiry = new Date(sub.expiry_ts);
  const daysLeft = Math.max(0, Math.round((sub.expiry_ts - Date.now()) / 86400000));
  const freshness = daysLeft > 7 ? '🟢' : daysLeft > 3 ? '🟡' : '🔴';
  return `${freshness} <b>Pro Active</b>\n\nExpires: ${expiry.toUTCString().slice(0, 16)}\nDays remaining: <b>${daysLeft}</b>\n\nTo renew, send another $20 USDC and DM me the tx hash.`;
}

// ── Handle incoming message ───────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const userId = msg.from?.id;
  const text   = (msg.text || '').trim();
  if (!chatId || !text) return;

  // Ignore group messages (only handle DMs)
  if (msg.chat.type !== 'private') return;

  const username = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || 'there';

  // Commands
  if (text === '/start') {
    await tgPost('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `👁 <b>Welcome to Prescience Pro</b>, ${username}!\n\nI verify your Base payment and activate instant signal delivery.${INSTRUCTIONS}`,
    });
    return;
  }

  if (text === '/help') {
    await tgPost('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: INSTRUCTIONS });
    return;
  }

  if (text === '/status') {
    const sub = getSubscriber(chatId);
    await tgPost('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: proStatusMsg(sub) });
    return;
  }

  // Tx hash detection: starts with 0x and is 66 chars, or close enough
  const txMatch = text.match(/\b(0x[0-9a-fA-F]{64})\b/);
  if (txMatch) {
    const txHash = txMatch[1];

    // Acknowledge
    await tgPost('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `🔍 Verifying <code>${txHash.slice(0, 20)}…</code> on Base…`,
    });

    const result = await verifyUSDCPayment(txHash);

    if (!result.valid) {
      await tgPost('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: `❌ <b>Verification failed</b>\n\n${result.reason}\n\nNeed help? Use /help to see payment instructions.`,
      });
      console.log(`[FAIL] chat=${chatId} tx=${txHash.slice(0, 20)} reason=${result.reason.slice(0, 80)}`);
      return;
    }

    // Payment valid — grant Pro
    const now = Date.now();
    const expiry = now + PRO_MS;
    const existingSub = getSubscriber(chatId);

    // Stack on top of existing expiry if still active (reward early renewal)
    const newExpiry = existingSub?.active && existingSub.expiry_ts > now
      ? existingSub.expiry_ts + PRO_MS
      : expiry;

    upsertSubscriber({
      chat_id: chatId,
      user_id: userId,
      username: msg.from?.username || null,
      first_name: msg.from?.first_name || null,
      active: true,
      activated_at: new Date(now).toISOString(),
      expiry_ts: newExpiry,
      expiry_date: new Date(newExpiry).toISOString(),
      amount_usdc: result.amountUsdc,
      from_wallet: result.from,
      payment_txs: [...(existingSub?.payment_txs || []), txHash.toLowerCase()],
      expiry_notified: false,
    });

    const expiryStr = new Date(newExpiry).toUTCString().slice(0, 16);
    const isRenewal = existingSub?.active;

    await tgPost('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `✅ <b>Pro ${isRenewal ? 'Renewed' : 'Activated'}!</b>\n\n`
        + `Payment: <b>$${result.amountUsdc.toFixed(2)} USDC</b> confirmed on Base\n`
        + `Valid until: <b>${expiryStr}</b>\n\n`
        + `⚡ You now receive signals <b>instantly</b> — before the free channel.\n\n`
        + `Use /status to check your subscription anytime.`,
    });

    console.log(`[PRO GRANTED] chat=${chatId} ${username} $${result.amountUsdc} USDC expires=${expiryStr}`);
    return;
  }

  // Unrecognised input
  await tgPost('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text: `💡 Send me your Base transaction hash to verify payment.\n\nUse /help for instructions or /status to check your subscription.`,
  });
}

// ── V2: Expiry management ─────────────────────────────────────────────
async function runExpiryCheck() {
  const subs = loadSubscribers();
  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 3600 * 1000;
  let changed = false;

  for (const sub of subs) {
    if (!sub.active) continue;

    // Expired
    if (sub.expiry_ts <= now) {
      console.log(`[EXPIRY] Removing Pro: chat=${sub.chat_id} ${sub.username || ''}`);
      sub.active = false;
      sub.expired_at = new Date(now).toISOString();
      changed = true;

      await tgPost('sendMessage', {
        chat_id: sub.chat_id, parse_mode: 'HTML',
        text: `🔔 <b>Your Prescience Pro subscription has expired.</b>\n\n`
          + `You can renew for another 30 days by sending $20 USDC on Base to:\n`
          + `<code>${PRO_WALLET}</code>\n\n`
          + `Then DM me your new transaction hash. All the best!`,
      });
      continue;
    }

    // Expiring within 3 days — send warning (once)
    if (sub.expiry_ts - now < THREE_DAYS && !sub.expiry_notified) {
      const daysLeft = Math.ceil((sub.expiry_ts - now) / 86400000);
      console.log(`[EXPIRY WARNING] ${daysLeft}d left: chat=${sub.chat_id}`);
      sub.expiry_notified = true;
      changed = true;

      await tgPost('sendMessage', {
        chat_id: sub.chat_id, parse_mode: 'HTML',
        text: `⏳ <b>Your Pro subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.</b>\n\n`
          + `Renew now to keep instant signal delivery. Send $20 USDC on Base to:\n`
          + `<code>${PRO_WALLET}</code>\n\nThen DM me the tx hash.`,
      });
    }
  }

  if (changed && !dryRun) saveSubscribers(subs);
  console.log(`[EXPIRY CHECK] Done — ${subs.filter(s => s.active).length} active Pro subscribers`);
}

// ── Polling loop ──────────────────────────────────────────────────────
async function startPolling() {
  console.log(`\n🤖 Prescience Payment Bot starting (dry=${dryRun})...`);

  // Verify token
  const me = await tgGet('getMe');
  if (!me?.result?.username) { console.error('Failed to authenticate with Telegram'); process.exit(1); }
  console.log(`   Authenticated as @${me.result.username}`);

  // Run expiry check on startup
  await runExpiryCheck();

  if (checkExpiryOnly) { console.log('Expiry check complete. Exiting.'); process.exit(0); }

  let offset = 0;
  console.log('   Polling for messages...\n');

  // Periodic expiry check every 6 hours
  const EXPIRY_INTERVAL_MS = 6 * 3600 * 1000;
  let lastExpiryCheck = Date.now();

  while (true) {
    try {
      const updates = await tgGet('getUpdates', { offset, limit: 100, timeout: 30, allowed_updates: 'message' });

      if (updates?.result?.length) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          if (update.message) {
            await handleMessage(update.message).catch(err =>
              console.error(`Handle error: ${err.message}`)
            );
          }
        }
      } else {
        offset = updates?.result?.length ? updates.result[updates.result.length - 1].update_id + 1 : offset;
      }

      // Periodic expiry check
      if (Date.now() - lastExpiryCheck > EXPIRY_INTERVAL_MS) {
        await runExpiryCheck();
        lastExpiryCheck = Date.now();
      }

    } catch (err) {
      console.error(`Polling error: ${err.message}. Retrying in 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────
startPolling();
