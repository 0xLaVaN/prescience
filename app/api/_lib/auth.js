// Prescience API Authentication — x402 Payment Protocol
// Uses Coinbase x402 for micropayments on Base (USDC)
// Internal health check bypass via PRESCIENCE_INTERNAL_KEY env var

import { x402ResourceServer } from '@x402/next';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { withX402 } from '@x402/next';

// Our receiving wallet (deployer)
const PAY_TO = '0x11F5397F191144894cD907A181ED61A7bf5634dE';

// Network: Base mainnet
const NETWORK = 'eip155:8453';

// Internal health check secret (bypass x402 for monitoring)
const INTERNAL_SECRET = process.env.PRESCIENCE_INTERNAL_KEY || '';

// Create shared x402 resource server (uses default Coinbase CDP facilitator)
const server = new x402ResourceServer();
server.register(NETWORK, new ExactEvmScheme());

// Route config for paid endpoints: $0.001 USDC per call
export const paidRouteConfig = {
  accepts: {
    scheme: 'exact',
    network: NETWORK,
    payTo: PAY_TO,
    price: '$0.001',
  },
  description: 'Prescience API — insider trading intelligence',
};

// Wrap a handler with x402 payment gate + internal bypass
export function requirePayment(handler) {
  const x402Handler = withX402(handler, paidRouteConfig, server);
  
  return async (request) => {
    // Allow internal health checks to bypass payment
    const internalKey = request.headers.get('x-internal-key');
    if (INTERNAL_SECRET && internalKey === INTERNAL_SECRET) {
      return handler(request);
    }
    
    return x402Handler(request);
  };
}

// For pulse free tier (summary only, no payment needed)
export function requirePaymentForFull(summaryHandler, fullHandler) {
  const x402Handler = withX402(fullHandler, paidRouteConfig, server);
  
  return async (request) => {
    // Internal bypass
    const internalKey = request.headers.get('x-internal-key');
    if (INTERNAL_SECRET && internalKey === INTERNAL_SECRET) {
      return fullHandler(request);
    }
    
    // Check if payment header is present
    const paymentHeader = request.headers.get('payment-signature') || request.headers.get('x-payment');
    if (paymentHeader) {
      return x402Handler(request);
    }
    
    // No payment = free summary
    return summaryHandler(request);
  };
}
