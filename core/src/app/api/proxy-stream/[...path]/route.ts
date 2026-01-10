import { NextRequest } from 'next/server';

const LANGGRAPH_API_URL = 'http://127.0.0.1:2024/';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const response = new Response(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathString = path.join('/');
  const targetUrl = `${LANGGRAPH_API_URL}${pathString}`;

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
    });

    if (response.body) {
      const headers = new Headers();
      headers.set('Transfer-Encoding', 'chunked');
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Accel-Buffering', 'no');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      
      for (const [key, value] of response.headers.entries()) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathString = path.join('/');
  const targetUrl = `${LANGGRAPH_API_URL}${pathString}`;

  try {
    const body = await request.arrayBuffer();
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: body,
    });

    const response = await fetch(proxyReq);

    if (response.body) {
      const headers = new Headers();
      headers.set('Transfer-Encoding', 'chunked');
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Accel-Buffering', 'no');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      
      for (const [key, value] of response.headers.entries()) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    try {
      const data = await response.json();
      return Response.json(data, { status: response.status });
    } catch {
      const text = await response.text();
      return new Response(text, { status: response.status });
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathString = path.join('/');
  const targetUrl = `${LANGGRAPH_API_URL}${pathString}`;

  try {
    const body = await request.arrayBuffer();
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: body,
    });

    const response = await fetch(proxyReq);

    if (response.body) {
      const headers = new Headers();
      headers.set('Transfer-Encoding', 'chunked');
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Accel-Buffering', 'no');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      
      for (const [key, value] of response.headers.entries()) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    try {
      const data = await response.json();
      return Response.json(data, { status: response.status });
    } catch {
      const text = await response.text();
      return new Response(text, { status: response.status });
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathString = path.join('/');
  const targetUrl = `${LANGGRAPH_API_URL}${pathString}`;

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
    });

    if (response.body) {
      const headers = new Headers();
      headers.set('Transfer-Encoding', 'chunked');
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Accel-Buffering', 'no');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      
      for (const [key, value] of response.headers.entries()) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
