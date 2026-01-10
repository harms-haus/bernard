import { NextRequest, NextResponse } from 'next/server';
import { V1_UPSTREAMS } from '@/lib/services/config';

function passThroughAuth(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const authHeader = headers.get('authorization');
  const cookie = headers.get('cookie');
  const apiKey = headers.get('x-api-key');

  if (authHeader) result['authorization'] = authHeader;
  if (cookie) result['cookie'] = cookie;
  if (apiKey) result['x-api-key'] = apiKey;

  return result;
}

function findUpstream(path: string): { url: string; path: string; streaming: boolean } | null {
  for (const [route, config] of Object.entries(V1_UPSTREAMS)) {
    if (path.startsWith(route)) {
      return config;
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = '/' + (resolvedParams.path || []).join('/');

  const upstream = findUpstream(path);
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const targetUrl = `${upstream.url}${path}`;
  const headers = passThroughAuth(request.headers);

  try {
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(headers),
      duplex: 'half',
    } as RequestInit);

    const response = await fetch(proxyReq);

    if (upstream.streaming && response.body) {
      const streamingHeaders = new Headers(response.headers);
      streamingHeaders.set('Transfer-Encoding', 'chunked');
      streamingHeaders.set('Cache-Control', 'no-cache');
      streamingHeaders.set('X-Accel-Buffering', 'no');
      
      return new Response(response.body, {
        status: response.status,
        headers: streamingHeaders,
      });
    }

    const jsonData = await response.json();
    return NextResponse.json(jsonData, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Error', message: (error as Error).message },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = '/' + (resolvedParams.path || []).join('/');

  const upstream = findUpstream(path);
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const targetUrl = `${upstream.url}${upstream.path || path}`;
  const headers = passThroughAuth(request.headers);

  try {
    const body = await request.arrayBuffer();
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(headers),
      body: body,
      duplex: 'half',
    } as RequestInit);

    const response = await fetch(proxyReq);

    if (upstream.streaming && response.body) {
      const streamingHeaders = new Headers(response.headers);
      streamingHeaders.set('Transfer-Encoding', 'chunked');
      streamingHeaders.set('Cache-Control', 'no-cache');
      streamingHeaders.set('X-Accel-Buffering', 'no');
      
      return new Response(response.body, {
        status: response.status,
        headers: streamingHeaders,
      });
    }

    try {
      const jsonData = await response.json();
      return NextResponse.json(jsonData, { status: response.status });
    } catch {
      const textData = await response.text();
      return new NextResponse(textData, { status: response.status });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Error', message: (error as Error).message },
      { status: 502 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = '/' + (resolvedParams.path || []).join('/');

  const upstream = findUpstream(path);
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const targetUrl = `${upstream.url}${upstream.path || path}`;
  const headers = passThroughAuth(request.headers);

  try {
    const body = await request.arrayBuffer();
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(headers),
      body: body,
      duplex: 'half',
    } as RequestInit);

    const response = await fetch(proxyReq);

    try {
      const jsonData = await response.json();
      return NextResponse.json(jsonData, { status: response.status });
    } catch {
      const textData = await response.text();
      return new NextResponse(textData, { status: response.status });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Error', message: (error as Error).message },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = '/' + (resolvedParams.path || []).join('/');

  const upstream = findUpstream(path);
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const targetUrl = `${upstream.url}${upstream.path || path}`;
  const headers = passThroughAuth(request.headers);

  try {
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(headers),
      duplex: 'half',
    } as RequestInit);

    const response = await fetch(proxyReq);

    try {
      const jsonData = await response.json();
      return NextResponse.json(jsonData, { status: response.status });
    } catch {
      const textData = await response.text();
      return new NextResponse(textData, { status: response.status });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Error', message: (error as Error).message },
      { status: 502 }
    );
  }
}
