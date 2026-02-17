import { NextResponse } from 'next/server';

const interestList = [];

export async function POST(request) {
  try {
    const body = await request.json();
    const { email } = body || {};
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    interestList.push({ email, source: 'register', timestamp: new Date().toISOString() });
    console.log(`[PRESCIENCE REGISTER] ${email} at ${new Date().toISOString()}`);
    return NextResponse.json({
      ok: true,
      message: 'Registered! We\'ll send your API key to ' + email + ' shortly.',
      next_steps: 'Check your email for your API key. Set x-api-key header to access all endpoints.',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Registration failed', detail: err.message }, { status: 500 });
  }
}
