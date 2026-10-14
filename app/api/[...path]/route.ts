import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length !== 1 || !['chat', 'session', 'orders', 'faults', 'health'].includes(path[0]))
    return Response.json({ error: 'Not found' }, { status: 404 });
  try {
    const response = await fetch(
      `${process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3001'}/${path[0]}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          authorization: request.headers.get('authorization') ?? '',
        },
        body: request.method === 'POST' ? await request.text() : undefined,
        signal: AbortSignal.timeout(35000),
        cache: 'no-store',
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return Response.json(
      { error: 'Agent service unavailable. Start all services with npm run dev.' },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
