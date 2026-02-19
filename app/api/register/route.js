import { NextResponse } from 'next/server';
import { registerApiKey } from '../_lib/auth.js';

// Keep interest list for tracking
const interestList = [];

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, source } = body || {};
    
    if (!email || !email.includes('@')) {
      return NextResponse.json({ 
        error: 'Valid email required',
        message: 'Please provide a valid email address'
      }, { status: 400 });
    }

    // Register new API key
    const apiKey = registerApiKey(email, source || 'register');
    
    // Track interest
    interestList.push({ 
      email, 
      source: source || 'register', 
      timestamp: new Date().toISOString(),
      apiKey: apiKey.slice(0, 8) + '...' // Log partial key only
    });
    
    console.log(`[PRESCIENCE REGISTER] ${email} -> ${apiKey.slice(0, 8)}... (${source || 'register'})`);
    
    return NextResponse.json({
      success: true,
      message: 'Successfully registered for Prescience API!',
      api_key: apiKey,
      tier: 'free',
      limits: {
        daily_calls: 10,
        rate_limit: '10 calls/minute',
        endpoints: ['/api/pulse', '/api/scan', '/api/news']
      },
      usage: {
        header: 'x-api-key',
        example: `curl -H "x-api-key: ${apiKey}" https://prescience.markets/api/pulse`
      },
      upgrade: {
        message: 'Upgrade to Pro for unlimited calls and all endpoints',
        price: '0.005 ETH/month',
        endpoint: '/api/upgrade'
      },
      next_steps: [
        'Save your API key securely - it won\'t be shown again',
        'Add x-api-key header to all API requests',
        'Start with /api/pulse to get live market data',
        'Upgrade to Pro at /api/upgrade for unlimited access'
      ]
    });

  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    return NextResponse.json({ 
      error: 'Registration failed', 
      message: 'Internal server error during registration',
      detail: err.message 
    }, { status: 500 });
  }
}
