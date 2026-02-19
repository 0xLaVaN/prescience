import { NextResponse } from 'next/server';
import { 
  getApiKeyInfo, 
  upgradeApiKey, 
  verifyEthPayment, 
  registerApiKey 
} from '../_lib/auth.js';

// Your ETH wallet address for payments (from brand.json email context)
const PAYMENT_WALLET = '0x742d35Cc6634C0532925a3b8D21D8F5c9a5E5a1E'; // Replace with actual wallet

export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, txHash, email } = body || {};

    // Validate required fields
    if (!txHash) {
      return NextResponse.json({
        error: 'Transaction hash required',
        message: 'Provide the ETH transaction hash for your 0.005 ETH payment'
      }, { status: 400 });
    }

    // If no API key provided, register new one
    let targetApiKey = apiKey;
    if (!targetApiKey) {
      if (!email || !email.includes('@')) {
        return NextResponse.json({
          error: 'Email or API key required',
          message: 'Provide either your existing API key or email to create new Pro account'
        }, { status: 400 });
      }
      targetApiKey = registerApiKey(email, 'pro-signup');
    }

    // Verify API key exists
    const keyInfo = getApiKeyInfo(targetApiKey);
    if (!keyInfo) {
      return NextResponse.json({
        error: 'Invalid API key',
        message: 'API key not found. Register first at /api/register'
      }, { status: 400 });
    }

    // Check if already Pro
    if (keyInfo.tier === 'pro') {
      return NextResponse.json({
        error: 'Already Pro',
        message: 'This API key is already upgraded to Pro tier',
        key: targetApiKey,
        tier: 'pro'
      }, { status: 400 });
    }

    // Verify ETH payment on-chain
    console.log(`[UPGRADE] Verifying payment for ${keyInfo.email}: ${txHash}`);
    
    const paymentResult = await verifyEthPayment(txHash, 0.005);
    
    if (!paymentResult.valid) {
      return NextResponse.json({
        error: 'Payment verification failed',
        message: paymentResult.error || 'Could not verify ETH transaction',
        expected: {
          amount: '0.005 ETH',
          to: PAYMENT_WALLET,
          network: 'Base'
        }
      }, { status: 400 });
    }

    // Upgrade API key to Pro
    const upgraded = upgradeApiKey(targetApiKey, txHash);
    
    if (!upgraded) {
      return NextResponse.json({
        error: 'Upgrade failed',
        message: 'Could not upgrade API key to Pro tier'
      }, { status: 500 });
    }

    // Success response
    return NextResponse.json({
      success: true,
      message: 'Successfully upgraded to Prescience Pro!',
      key: targetApiKey,
      tier: 'pro',
      benefits: {
        daily_calls: 'unlimited',
        rate_limit: '100 calls/minute',
        endpoints: 'all endpoints including /signals, /correlations',
        support: 'priority support'
      },
      payment: {
        tx_hash: txHash,
        amount: '0.005 ETH',
        verified: true,
        block_number: paymentResult.blockNumber
      },
      next_steps: [
        'Set x-api-key header to your API key in all requests',
        'You now have access to all Pro endpoints',
        'Pro benefits are valid for the current month',
        'Check /api/signals for trading signal intelligence'
      ]
    });

  } catch (err) {
    console.error('[UPGRADE ERROR]', err);
    return NextResponse.json({
      error: 'Upgrade failed',
      message: 'Internal server error during upgrade process',
      detail: err.message
    }, { status: 500 });
  }
}

// GET endpoint to check upgrade status
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('key') || request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json({
        error: 'API key required',
        message: 'Provide API key as ?key= parameter or x-api-key header'
      }, { status: 400 });
    }
    
    const keyInfo = getApiKeyInfo(apiKey);
    if (!keyInfo) {
      return NextResponse.json({
        error: 'Invalid API key'
      }, { status: 400 });
    }
    
    return NextResponse.json({
      key: apiKey.slice(0, 8) + '...',
      email: keyInfo.email,
      tier: keyInfo.tier,
      created: keyInfo.createdAt,
      last_used: keyInfo.lastUsed,
      calls_today: keyInfo.callCount,
      daily_limit: keyInfo.tier === 'free' ? 10 : 'unlimited',
      upgrade_info: keyInfo.tier === 'free' ? {
        price: '0.005 ETH/month',
        benefits: ['Unlimited daily calls', '100 calls/minute', 'All Pro endpoints'],
        wallet: PAYMENT_WALLET,
        network: 'Base'
      } : {
        upgraded: keyInfo.upgradeDate,
        tx_hash: keyInfo.paymentTxHash
      }
    });
    
  } catch (err) {
    return NextResponse.json({
      error: 'Status check failed',
      detail: err.message
    }, { status: 500 });
  }
}