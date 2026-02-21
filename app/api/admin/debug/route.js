import { NextResponse } from 'next/server';

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const adminToken = process.env.PRESCIENCE_ADMIN_TOKEN;
  
  return NextResponse.json({
    hasAdminToken: !!adminToken,
    adminTokenLength: adminToken ? adminToken.length : 0,
    providedTokenLength: token.length,
    match: !!(adminToken && token && token === adminToken),
    adminTokenPrefix: adminToken ? adminToken.slice(0, 4) + '...' : 'none',
    providedTokenPrefix: token ? token.slice(0, 4) + '...' : 'none',
  });
}
