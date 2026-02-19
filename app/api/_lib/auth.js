// Prescience API Authentication — x402 Payment Protocol
// Uses Coinbase x402 for micropayments on Base (USDC)
// Internal health check bypass via PRESCIENCE_INTERNAL_KEY env var

import { NextResponse } from 'next/server';

// Our receiving wallet (deployer)
const PAY_TO = '0x11F5397F191144894cD907A181ED61A7bf5634dE';

// Network: Base mainnet
const NETWORK = 'eip155:8453';

// Facilitator URL (Coinbase CDP hosted)
const FACILITATOR_URL = 'https://x402.org/facilitator';

// Internal health check secret (bypass x402 for monitoring)
const INTERNAL_SECRET = process.env.PRESCIENCE_INTERNAL_KEY || '';

// Price per API call in USDC (6 decimals)
const PRICE_USDC = '$0.001';

// Build the 402 Payment Required response
function buildPaymentRequired() {
  const paymentRequirements = {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: '1000', // 0.001 USDC = 1000 units (6 decimals)
    resource: 'https://prescience.markets/api',
    description: 'Prescience API — insider trading intelligence',
    mimeType: 'application/json',
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    extra: {
      name: 'USDC',
      version: '2',
    },
  };

  const encoded = Buffer.from(JSON.stringify([paymentRequirements])).toString('base64');

  return new NextResponse(
    JSON.stringify({
      error: 'Payment Required',
      message: 'This endpoint requires x402 payment',
      price: PRICE_USDC,
      network: NETWORK,
      protocol: 'https://x402.org',
      payTo: PAY_TO,
      accepts: [paymentRequirements],
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Required': encoded,
      },
    }
  );
}

// Verify payment via facilitator
async function verifyPayment(paymentHeader) {
  try {
    const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    const res = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        paymentRequirements: {
          scheme: 'exact',
          network: NETWORK,
          maxAmountRequired: '1000',
          resource: 'https://prescience.markets/api',
          payTo: PAY_TO,
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          maxTimeoutSeconds: 300,
        },
      }),
    });

    if (!res.ok) return false;
    const result = await res.json();
    return result.valid === true;
  } catch (err) {
    console.error('[x402] Payment verification failed:', err.message);
    return false;
  }
}

// Settle payment via facilitator
async function settlePayment(paymentHeader) {
  try {
    const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    const res = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        paymentRequirements: {
          scheme: 'exact',
          network: NETWORK,
          maxAmountRequired: '1000',
          resource: 'https://prescience.markets/api',
          payTo: PAY_TO,
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          maxTimeoutSeconds: 300,
        },
      }),
    });

    if (!res.ok) {
      console.error('[x402] Settlement failed:', res.status);
    }
  } catch (err) {
    console.error('[x402] Settlement error:', err.message);
  }
}

// Wrap a handler with x402 payment gate + internal bypass
export function requirePayment(handler) {
  return async (request) => {
    // Allow internal health checks to bypass payment
    const internalKey = request.headers.get('x-internal-key');
    if (INTERNAL_SECRET && internalKey === INTERNAL_SECRET) {
      return handler(request);
    }

    // Check for payment header
    const paymentHeader = request.headers.get('payment-signature') || request.headers.get('x-payment');
    
    if (!paymentHeader) {
      return buildPaymentRequired();
    }

    // Verify payment
    const valid = await verifyPayment(paymentHeader);
    if (!valid) {
      return new NextResponse(
        JSON.stringify({ error: 'Payment verification failed' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Execute handler
    const response = await handler(request);

    // Settle payment after successful response
    if (response.status < 400) {
      settlePayment(paymentHeader).catch(() => {}); // fire and forget
    }

    return response;
  };
}

// For pulse: free summary without payment, full data with payment
export function requirePaymentForFull(summaryHandler, fullHandler) {
  return async (request) => {
    // Internal bypass
    const internalKey = request.headers.get('x-internal-key');
    if (INTERNAL_SECRET && internalKey === INTERNAL_SECRET) {
      return fullHandler(request);
    }

    // Check for payment header
    const paymentHeader = request.headers.get('payment-signature') || request.headers.get('x-payment');
    
    if (!paymentHeader) {
      // No payment = free summary
      return summaryHandler(request);
    }

    // Verify and serve full data
    const valid = await verifyPayment(paymentHeader);
    if (!valid) {
      return new NextResponse(
        JSON.stringify({ error: 'Payment verification failed' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const response = await fullHandler(request);
    
    if (response.status < 400) {
      settlePayment(paymentHeader).catch(() => {});
    }

    return response;
  };
}
