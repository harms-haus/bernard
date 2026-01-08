import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { V1_UPSTREAMS } from '@/lib/services/config';

const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';
const VLLM_URL = process.env.VLLM_URL || 'http://127.0.0.1:8860';

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

function findUpstream(path: string) {
  for (const [route, config] of Object.entries(V1_UPSTREAMS)) {
    if (path.startsWith(route)) {
      return config;
    }
  }
  return null;
}

async function fetchFromAgent<T>(path: string, timeout = 2000): Promise<T | null> {
  try {
    const resp = await axios.get<T>(`${BERNARD_AGENT_URL}${path}`, { timeout });
    return resp.data;
  } catch {
    return null;
  }
}

async function fetchFromVLLM<T>(path: string, timeout = 2000): Promise<T | null> {
  try {
    const resp = await axios.get<T>(`${VLLM_URL}${path}`, { timeout });
    return resp.data;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';

  if (path === 'models') {
    const models: any[] = [];

    const agentModels = await fetchFromAgent<{ data: any[] }>('/v1/models');
    if (agentModels?.data) {
      models.push(...agentModels.data);
    }

    const vllmModels = await fetchFromVLLM<{ data: any[] }>('/v1/models');
    if (vllmModels?.data) {
      models.push(...vllmModels.data);
    }

    models.push({
      id: 'whisper-1',
      object: 'model',
      created: 1677649963,
      owned_by: 'openai'
    });
    models.push({
      id: 'tts-1',
      object: 'model',
      created: 1677649963,
      owned_by: 'openai'
    });

    return NextResponse.json({ object: 'list', data: models });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';

  const upstream = findUpstream(path);
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const targetUrl = `${upstream.url}${upstream.path}`;
  const headers = passThroughAuth(request.headers);

  try {
    const body = await request.arrayBuffer();
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(headers),
      body: body,
      duplex: 'half',
    });

    const response = await fetch(proxyReq);

    if (upstream.streaming && response.body) {
      return new Response(response.body, {
        status: response.status,
        headers: new Headers(response.headers),
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
