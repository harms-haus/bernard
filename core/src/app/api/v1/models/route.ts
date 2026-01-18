import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import fs from 'fs';
import path from 'path';

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';

export const dynamic = 'force-dynamic';

async function getGraphsFromLangGraphServer(): Promise<string[]> {
  try {
    // Create client inside function for testability
    const client = new Client({
      apiUrl: LANGGRAPH_API_URL,
    });
    // Try to get assistants (SDK auto-creates one per graph)
    const assistants = await client.assistants.search({});
    // Return unique graph_ids from assistants
    return [...new Set(assistants.map((a) => a.graph_id))];
  } catch {
    return [];
  }
}

function getGraphsFromConfig(): string[] {
  try {
    const langgraphJsonPath = path.join(process.cwd(), 'langgraph.json');
    const config = JSON.parse(fs.readFileSync(langgraphJsonPath, 'utf-8'));
    return Object.keys(config.graphs || {});
  } catch {
    return [];
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    },
  });
}

export async function GET(_request: NextRequest) {
  try {
    // Get available graphs - first try LangGraph server, fall back to config
    let graphIds = await getGraphsFromLangGraphServer();
    if (graphIds.length === 0) {
      graphIds = getGraphsFromConfig();
    }

    // Ensure bernard_agent is always available (the main agent)
    if (!graphIds.includes('bernard_agent')) {
      graphIds.unshift('bernard_agent');
    }

    // Build models list in OpenAI-compatible format
    const models = graphIds.map((id) => ({
      id,
      object: 'model',
      created: Date.now() / 1000,
      owned_by: 'bernard',
    }));

    return NextResponse.json(
      { object: 'list', data: models },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        },
      }
    );
  } catch (error) {
    console.error('Models endpoint error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to list models' },
      { status: 500 }
    );
  }
}
