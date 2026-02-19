// Prescience API Authentication & Rate Limiting
// Simple in-memory storage for MVP - replace with database in production

// In-memory stores (replace with Redis/DB for production)
const apiKeys = new Map(); // key -> { email, tier, createdAt, lastUsed, callCount, dailyReset }
const dailyCallCounts = new Map(); // key -> { date, calls }

// Constants
const FREE_TIER_DAILY_LIMIT = 10;
const PRO_TIER_MONTHLY_PRICE_ETH = 0.005;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const FREE_RATE_LIMIT = 10; // calls per minute
const PRO_RATE_LIMIT = 100; // calls per minute

// Generate secure API key
function generateApiKey() {
  return 'pk_' + Array.from({ length: 32 }, () => 
    Math.random().toString(36)[2] || '0'
  ).join('').slice(0, 32);
}

// Register new API key
export function registerApiKey(email, source = 'register') {
  const apiKey = generateApiKey();
  const now = new Date();
  
  apiKeys.set(apiKey, {
    email,
    tier: 'free',
    createdAt: now.toISOString(),
    lastUsed: now.toISOString(),
    source,
    callCount: 0,
    dailyReset: getDateString(now),
    monthlyReset: getMonthString(now),
    paymentTxHash: null,
    paymentVerified: false
  });
  
  console.log(`[API KEY REGISTERED] ${email} -> ${apiKey} (${source})`);
  return apiKey;
}

// Upgrade key to Pro tier
export function upgradeApiKey(apiKey, txHash) {
  const keyData = apiKeys.get(apiKey);
  if (!keyData) return false;
  
  keyData.tier = 'pro';
  keyData.paymentTxHash = txHash;
  keyData.paymentVerified = true;
  keyData.upgradeDate = new Date().toISOString();
  
  console.log(`[API KEY UPGRADED] ${keyData.email} -> Pro (tx: ${txHash})`);
  return true;
}

// Get date string for daily reset
function getDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// Get month string for monthly reset
function getMonthString(date = new Date()) {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

// Check and update rate limits
export function checkRateLimit(apiKey) {
  const keyData = apiKeys.get(apiKey);
  if (!keyData) return { allowed: false, error: 'Invalid API key' };
  
  const now = new Date();
  const today = getDateString(now);
  const currentMonth = getMonthString(now);
  
  // Update last used
  keyData.lastUsed = now.toISOString();
  
  // Reset daily counter if new day
  if (keyData.dailyReset !== today) {
    keyData.callCount = 0;
    keyData.dailyReset = today;
  }
  
  // Check if Pro tier needs monthly reset/payment renewal
  if (keyData.tier === 'pro' && keyData.monthlyReset !== currentMonth) {
    // For MVP, assume Pro is valid for the month they paid
    // In production, add payment expiry logic here
    keyData.monthlyReset = currentMonth;
  }
  
  // Apply limits based on tier
  const isFreeTier = keyData.tier === 'free';
  const dailyLimit = isFreeTier ? FREE_TIER_DAILY_LIMIT : Infinity;
  
  // Check daily limit for free tier
  if (isFreeTier && keyData.callCount >= dailyLimit) {
    return { 
      allowed: false, 
      error: 'Daily limit exceeded',
      limit: dailyLimit,
      calls_used: keyData.callCount,
      tier: keyData.tier,
      reset_time: 'midnight UTC'
    };
  }
  
  // Increment call count
  keyData.callCount++;
  
  return { 
    allowed: true, 
    tier: keyData.tier,
    calls_used: keyData.callCount,
    daily_limit: dailyLimit === Infinity ? 'unlimited' : dailyLimit
  };
}

// Middleware for API route protection
export function requireAuth(handler) {
  return async (request) => {
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'API key required',
        message: 'Add x-api-key header with your API key',
        get_key: 'POST /api/register with your email'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const rateLimitCheck = checkRateLimit(apiKey);
    
    if (!rateLimitCheck.allowed) {
      const status = rateLimitCheck.error === 'Invalid API key' ? 401 : 429;
      const response = {
        error: rateLimitCheck.error,
        tier: rateLimitCheck.tier,
        calls_used: rateLimitCheck.calls_used,
        limit: rateLimitCheck.limit
      };
      
      if (status === 429) {
        response.upgrade = {
          message: 'Upgrade to Pro for unlimited calls',
          price: `${PRO_TIER_MONTHLY_PRICE_ETH} ETH/month`,
          endpoint: '/api/upgrade'
        };
      }
      
      return new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Add auth data to request for handler
    request.auth = rateLimitCheck;
    
    return handler(request);
  };
}

// Get API key info
export function getApiKeyInfo(apiKey) {
  return apiKeys.get(apiKey);
}

// List all keys (for admin/debugging)
export function listApiKeys() {
  return Array.from(apiKeys.entries()).map(([key, data]) => ({
    key: key.slice(0, 8) + '...',
    email: data.email,
    tier: data.tier,
    createdAt: data.createdAt,
    callCount: data.callCount
  }));
}

// ETH payment verification (simplified for MVP)
export async function verifyEthPayment(txHash, expectedAmount = PRO_TIER_MONTHLY_PRICE_ETH) {
  // In production, use a real blockchain API like Alchemy/Infura
  // For MVP, assume all tx hashes are valid if they look like ETH tx hashes
  
  const isValidTxFormat = /^0x[a-fA-F0-9]{64}$/.test(txHash);
  
  if (!isValidTxFormat) {
    return { valid: false, error: 'Invalid transaction hash format' };
  }
  
  // Mock verification - replace with real blockchain check
  console.log(`[ETH PAYMENT] Verifying tx: ${txHash} for ${expectedAmount} ETH`);
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return { 
    valid: true, 
    amount: expectedAmount,
    from: '0x1234...', // Mock sender
    to: '0x5678...', // Mock receiver (your wallet)
    blockNumber: 123456,
    verified: true
  };
}