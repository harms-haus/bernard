import { NextRequest } from 'next/server';

const BERNARD_UI_URL = process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810';

async function proxyRequest(
  request: NextRequest,
  method: string
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const path = request.nextUrl.pathname.replace('/bernard', '');
  const targetUrl = new URL(path || '/', BERNARD_UI_URL);

  if (searchParams.toString()) {
    targetUrl.search = searchParams.toString();
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  const options: RequestInit = {
    method,
    headers,
  };

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = request.body;
  }

  try {
    const response = await fetch(targetUrl.toString(), options);

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'UI Proxy Error',
        message: (error as Error).message,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return proxyRequest(request, 'GET');
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest): Promise<Response> {
  return proxyRequest(request, 'PUT');
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return proxyRequest(request, 'PATCH');
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return proxyRequest(request, 'DELETE');
}
