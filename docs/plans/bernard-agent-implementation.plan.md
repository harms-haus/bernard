# Bernard-Agent Implementation Plan (Final)

## Executive Summary

**Goal**: Create a new `bernard-agent` service at `services/bernard-agent/` following the LangGraph local agent server pattern. This service will run as a LangGraph local server and be proxied via `proxy-api`, eventually replacing the current `services/bernard/` service.

**Critical Rules**:
1. **`services/bernard-chat/apps/agents/`** - Example templates ONLY, will be deleted eventually. **DO NOT IMPORT**.
2. **`services/bernard/`** - Source for copying ONLY. **DO NOT IMPORT**.
3. **COPY everything you need** into `bernard-agent/` - it must be fully standalone.
4. No cross-service imports. Each service is independent.

**Directory Structure**:
```
services/bernard-agent/
├── langgraph.json              # Graph registry for LangGraph CLI
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript config
├── .env.example                # Environment template
├── README.md                   # Documentation
└── src/
    └── bernard-agent/
        ├── graph.ts            # Main ReAct graph
        ├── state.ts            # State definition
        ├── configuration.ts    # Configurable parameters
        ├── tools/              # TOOL IMPLEMENTATIONS (copied from bernard)
        │   ├── index.ts
        │   ├── web-search.tool.ts
        │   ├── website-content.tool.ts
        │   ├── wikipedia-search.tool.ts
        │   ├── wikipedia-entry.tool.ts
        │   ├── get-weather-data.tool.ts
        │   ├── home-assistant-list-entities.tool.ts
        │   ├── home-assistant-execute-services.tool.ts
        │   ├── home-assistant-toggle-light.tool.ts
        │   ├── home-assistant-get-entity-state.tool.ts
        │   ├── home-assistant-historical-state.tool.ts
        │   └── timer.tool.ts    # NOT IMPLEMENTING - for reference only
        │   └── play_media_tv.tool.ts # NOT IMPLEMENTING - for reference only
        └── lib/                # SHARED LIBRARIES (copied from bernard)
            ├── config/          # Configuration utilities
            │   └── settings.ts
            ├── home-assistant/  # HA integration
            │   └── index.ts
            └── logging.ts       # Logging utilities
```

---

## Phase 1: Create bernard-agent Service Structure

### 1.1 Create Directory Structure

```bash
cd /home/blake/Documents/software/bernard/services

# Create bernard-agent directory with nested structure
mkdir -p bernard-agent/src/bernard-agent/tools
mkdir -p bernard-agent/src/bernard-agent/lib/config
mkdir -p bernard-agent/src/bernard-agent/lib/home-assistant

# Create empty files
touch bernard-agent/langgraph.json
touch bernard-agent/package.json
touch bernard-agent/tsconfig.json
touch bernard-agent/.env.example
touch bernard-agent/README.md
touch bernard-agent/src/bernard-agent/graph.ts
touch bernard-agent/src/bernard-agent/state.ts
touch bernard-agent/src/bernard-agent/configuration.ts
touch bernard-agent/src/bernard-agent/tools/index.ts
touch bernard-agent/src/bernard-agent/lib/config/settings.ts
touch bernard-agent/src/bernard-agent/lib/home-assistant/index.ts
touch bernard-agent/src/bernard-agent/lib/logging.ts

# Create tool files
for tool in web-search website-content wikipedia-search wikipedia-entry \
           get-weather-data home-assistant-list-entities \
           home-assistant-execute-services home-assistant-toggle-light \
           home-assistant-get-entity-state home-assistant-historical-state \
           timer play_media_tv; do
  touch "bernard-agent/src/bernard-agent/tools/${tool}.tool.ts"
done
```

### 1.2 Create package.json

```json
{
  "name": "bernard-agent",
  "author": "",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx @langchain/langgraph-cli dev --port 2024 --config langgraph.json",
    "build": "tsc",
    "build:watch": "tsc --watch",
    "type-check": "tsc --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@langchain/core": "^0.3.42",
    "@langchain/langgraph": "^0.2.55",
    "@langchain/langgraph-checkpoint-redis": "^1.0.1",
    "langchain": "^0.3.19",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8",
    "@langchain/community": "^0.3.35",
    "@langchain/anthropic": "^0.3.15",
    "@langchain/openai": "^0.4.4",
    "ioredis": "^5.4.1",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.26.1",
    "@typescript-eslint/parser": "^8.26.1",
    "eslint": "^9.19.0",
    "eslint-config-prettier": "^10.1.1",
    "@types/node": "^20",
    "prettier": "^3.3.3",
    "tsx": "^4.19.1",
    "typescript": "^5"
  }
}
```

### 1.3 Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.4 Create langgraph.json

```json
{
  "node_version": "20",
  "dependencies": ["."],
  "graphs": {
    "bernard_agent": "./src/bernard-agent/graph.ts:graph"
  },
  "env": ".env"
}
```

### 1.5 Create .env.example

```bash
# Bernard Agent Configuration

# LLM Models
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Web Search (SearXNG)
SEARXNG_API_URL=http://localhost:8080
SEARXNG_API_KEY=

# Home Assistant
HA_BASE_URL=http://homeassistant.local:8123
HA_ACCESS_TOKEN=

# Weather (OpenWeather)
OPENWEATHER_API_KEY=

# Redis (for checkpointer - optional, MemorySaver used by default)
REDIS_URL=redis://localhost:6379
```

---

## Phase 2: Copy Tools from Current Bernard

**Source**: `services/bernard/src/agent/tool/`
**Target**: `services/bernard-agent/src/bernard-agent/tools/`

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent/src/bernard-agent/tools

# Copy tool implementations (adapt for standalone use)
cp ../../../bernard/src/agent/tool/web-search.tool.ts ./web-search.tool.ts
cp ../../../bernard/src/agent/tool/website-content.tool.ts ./website-content.tool.ts
cp ../../../bernard/src/agent/tool/wikipedia-search.tool.ts ./wikipedia-search.tool.ts
cp ../../../bernard/src/agent/tool/wikipedia-entry.tool.ts ./wikipedia-entry.tool.ts
cp ../../../bernard/src/agent/tool/get-weather-data.tool.ts ./get-weather-data.tool.ts
cp ../../../bernard/src/agent/tool/home-assistant-list-entities.tool.ts ./home-assistant-list-entities.tool.ts
cp ../../../bernard/src/agent/tool/home-assistant-execute-services.tool.ts ./home-assistant-execute-services.tool.ts
cp ../../../bernard/src/agent/tool/home-assistant-toggle-light.tool.ts ./home-assistant-toggle-light.tool.ts
cp ../../../bernard/src/agent/tool/home-assistant-get-entity-state.tool.ts ./home-assistant-get-entity-state.tool.ts
cp ../../../bernard/src/agent/tool/home-assistant-historical-state.tool.ts ./home-assistant-historical-state.tool.ts

# Copy but NOT implementing these (for reference only)
cp ../../../bernard/src/agent/tool/timer.tool.ts ./timer.tool.ts
cp ../../../bernard/src/agent/tool/play_media_tv.tool.ts ./play_media_tv.tool.ts
```

---

## Phase 3: Copy Shared Libraries from Current Bernard

### 3.1 Copy Configuration

**Source**: `services/bernard/src/lib/config/`
**Target**: `services/bernard-agent/src/bernard-agent/lib/config/`

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent/src/bernard-agent/lib/config

cp ../../../bernard/src/lib/config/settings.ts ./
cp ../../../bernard/src/lib/config/appSettings.ts ./
```

### 3.2 Copy Home Assistant Integration

**Source**: `services/bernard/src/lib/home-assistant/`
**Target**: `services/bernard-agent/src/bernard-agent/lib/home-assistant/`

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent/src/bernard-agent/lib/home-assistant

cp ../../../bernard/src/lib/home-assistant/index.ts ./
```

### 3.3 Copy Logging

**Source**: `services/bernard/src/lib/logging.ts`
**Target**: `services/bernard-agent/src/bernard-agent/lib/logging.ts`

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent/src/bernard-agent/lib

cp ../../../bernard/src/lib/logging.ts ./
```

---

## Phase 4: Core Agent Files

### 4.1 State Definition (`state.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/state.ts
import { BaseMessage } from "@langchain/core/messages";
import {
  Annotation,
  Messages,
  messagesStateReducer,
} from "@langchain/langgraph";

/**
 * Main graph state for Bernard agent.
 * 
 * SIMPLIFIED: No memory fields - memory system deferred to future implementation.
 * Uses standard MessagesAnnotation for message handling.
 */
export const BernardStateAnnotation = Annotation.Root({
  /**
   * The messages in the conversation.
   */
  messages: Annotation<BaseMessage[], Messages>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type BernardState = typeof BernardStateAnnotation.State;
```

### 4.2 Configuration (`configuration.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/configuration.ts
import { Annotation, LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Default system prompt for Bernard voice assistant.
 */
export const BERNARD_SYSTEM_PROMPT = `You are Bernard, a helpful AI voice assistant.

Current Time: {time}

Your personality:
- Helpful, friendly, and concise
- You have access to tools for home automation, web search, weather, Wikipedia, and more
- When you need to take action, use the appropriate tools

You are a voice assistant, so keep responses natural and conversational.`;

/**
 * Configuration annotation for configurable parameters.
 */
export const BernardConfigurationAnnotation = Annotation.Root({
  /**
   * User ID for HA entity scoping.
   */
  userId: Annotation<string>(),

  /**
   * The language model to use for the routing agent (with tools).
   */
  reactModel: Annotation<string>(),

  /**
   * The language model to use for response generation (no tools).
   */
  responseModel: Annotation<string>(),

  /**
   * System prompt template.
   */
  systemPrompt: Annotation<string>(),

  /**
   * Home Assistant configuration (if available).
   */
  homeAssistantConfig: Annotation<{
    baseUrl: string;
    accessToken: string;
  } | null>(),
});

export type BernardConfiguration = typeof BernardConfigurationAnnotation.State;

/**
 * Extract and validate configuration from RunnableConfig.
 */
export function ensureBernardConfiguration(
  config?: LangGraphRunnableConfig,
): BernardConfiguration {
  const configurable = config?.configurable || {};
  return {
    userId: configurable?.userId || "default",
    reactModel: configurable?.reactModel || "anthropic/claude-3-7-sonnet-latest",
    responseModel: configurable?.responseModel || "anthropic/claude-3-7-sonnet-latest",
    systemPrompt: configurable?.systemPrompt || BERNARD_SYSTEM_PROMPT,
    homeAssistantConfig: configurable?.homeAssistantConfig || null,
  };
}
```

### 4.3 Utilities (`utils.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/utils.ts
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";

/**
 * Load a chat model from a fully specified name.
 */
export async function loadChatModel(
  fullySpecifiedName: string,
): Promise<BaseChatModel> {
  const index = fullySpecifiedName.indexOf("/");
  if (index === -1) {
    return await initChatModel(fullySpecifiedName);
  } else {
    const provider = fullySpecifiedName.slice(0, index);
    const model = fullySpecifiedName.slice(index + 1);
    return await initChatModel(model, { modelProvider: provider });
  }
}
```

---

## Phase 5: Tool System

### 5.1 Tools Index (`tools/index.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/index.ts
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ensureBernardConfiguration } from "../configuration.js";

// Re-export all tools
export { webSearchTool } from "./web-search.tool.js";
export { websiteContentTool } from "./website-content.tool.js";
export { wikipediaSearchTool } from "./wikipedia-search.tool.js";
export { wikipediaEntryTool } from "./wikipedia-entry.tool.js";
export { weatherTool } from "./get-weather-data.tool.js";
export { listEntitiesTool, createListHAEntitiesTool } from "./home-assistant-list-entities.tool.js";
export { executeServiceTool } from "./home-assistant-execute-services.tool.js";
export { toggleLightTool } from "./home-assistant-toggle-light.tool.js";
export { getEntityStateTool } from "./home-assistant-get-entity-state.tool.js";
export { historicalStateTool } from "./home-assistant-historical-state.tool.js";

/**
 * Get all available Bernard tools, configured with runtime settings.
 */
export function getBernardTools(config?: LangGraphRunnableConfig) {
  const bernardConfig = ensureBernardConfiguration(config);
  const haConfig = bernardConfig.homeAssistantConfig;

  return {
    webSearchTool: (await import("./web-search.tool.js")).webSearchTool,
    websiteContentTool: (await import("./website-content.tool.js")).websiteContentTool,
    wikipediaSearchTool: (await import("./wikipedia-search.tool.js")).wikipediaSearchTool,
    wikipediaEntryTool: (await import("./wikipedia-entry.tool.js")).wikipediaEntryTool,
    weatherTool: (await import("./get-weather-data.tool.js")).weatherTool,
    listEntitiesTool: (await import("./home-assistant-list-entities.tool.js")).listEntitiesTool,
    getEntityStateTool: (await import("./home-assistant-get-entity-state.tool.js")).getEntityStateTool,
    toggleLightTool: (await import("./home-assistant-toggle-light.tool.js")).toggleLightTool,
    executeServiceTool: (await import("./home-assistant-execute-services.tool.js")).executeServiceTool,
    historicalStateTool: (await import("./home-assistant-historical-state.tool.js")).historicalStateTool,
  };
}
```

### 5.2 Web Search Tool (`tools/web-search.tool.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/web-search.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "@/lib/logging.js";

const DEFAULT_SEARXNG_API_URL = "http://localhost:8080";
const DEFAULT_RESULT_COUNT = 5;

export const webSearchTool = tool(
  async ({ query, count }: { query: string; count?: number }) => {
    const apiUrl = process.env.SEARXNG_API_URL || DEFAULT_SEARXNG_API_URL;
    
    try {
      const url = new URL("/search", apiUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("num", String(count || DEFAULT_RESULT_COUNT));

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return `Search failed: ${response.status} ${response.statusText}`;
      }

      const data = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        return "No search results found.";
      }

      return data.results
        .slice(0, count || DEFAULT_RESULT_COUNT)
        .map((r: any, i: number) => `${i + 1}. ${r.title} - ${r.url}`)
        .join("\n");
    } catch (error) {
      logger.error({ error, query }, "Web search failed");
      return `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "web_search",
    description: "Search the web for fresh information. Use for current events.",
    schema: z.object({
      query: z.string().min(3).describe("The search query"),
      count: z.number().int().min(1).max(10).optional().describe("Number of results"),
    }),
  },
);
```

### 5.3 Website Content Tool (`tools/website-content.tool.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/website-content.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "@/lib/logging.js";

export const websiteContentTool = tool(
  async ({ url }: { url: string }) => {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return `Failed to fetch ${url}: ${response.status} ${response.statusText}`;
      }

      const html = await response.text();
      
      // Simple HTML extraction
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return text.slice(0, 8000);
    } catch (error) {
      logger.error({ error, url }, "Website content fetch failed");
      return `Failed to fetch ${url}: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "get_website_content",
    description: "Extract the main text content from a webpage URL.",
    schema: z.object({
      url: z.string().url().describe("The URL to extract content from"),
    }),
  },
);
```

### 5.4 Wikipedia Tools (`tools/wikipedia-search.tool.ts`, `tools/wikipedia-entry.tool.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/wikipedia-search.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const wikipediaSearchTool = tool(
  async ({ query }: { query: string }) => {
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`
    );

    const data = await response.json();
    
    if (!data.query?.search) {
      return "No Wikipedia results found.";
    }

    return data.query.search
      .slice(0, 5)
      .map((r: any, i: number) => `${i + 1}. ${r.title}: ${r.snippet}...`)
      .join("\n");
  },
  {
    name: "wikipedia_search",
    description: "Search Wikipedia for information about a topic.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  },
);
```

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/wikipedia-entry.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const wikipediaEntryTool = tool(
  async ({ title }: { title: string }) => {
    // Get page content
    const contentResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );
    const contentData = await contentResponse.json();
    const pages = contentData.query?.pages;
    const pageId = Object.keys(pages || {})[0];
    const extract = pages?.[pageId]?.extract || "Page not found.";

    // Get page image
    const imageResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=500&format=json&origin=*`
    );
    const imageData = await imageResponse.json();
    const imagePages = imageData.query?.pages;
    const imagePageId = Object.keys(imagePages || {})[0];
    const thumbnail = imagePages?.[imagePageId]?.thumbnail?.source;

    return {
      title,
      extract: extract.slice(0, 4000),
      image: thumbnail,
    };
  },
  {
    name: "wikipedia_entry",
    description: "Get the full content of a Wikipedia page by title.",
    schema: z.object({
      title: z.string().describe("The Wikipedia page title"),
    }),
  },
);
```

### 5.5 Weather Tool (`tools/get-weather-data.tool.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/get-weather-data.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const weatherTool = tool(
  async ({ location }: { location: string }) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return "Weather service not configured. Set OPENWEATHER_API_KEY environment variable.";
    }

    const geoResponse = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`
    );
    const geoData = await geoResponse.json();

    if (!geoData.length) {
      return `Location "${location}" not found.`;
    }

    const { lat, lon, name } = geoData[0];

    const weatherResponse = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`
    );
    const weatherData = await weatherResponse.json();

    const current = weatherData.current;
    return `${name} Weather:
- Temperature: ${current.temp}°F
- Conditions: ${current.weather[0].description}
- Humidity: ${current.humidity}%
- Wind: ${current.wind_speed} mph`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a location.",
    schema: z.object({
      location: z.string().describe("City name or 'City, Country'"),
    }),
  },
);
```

### 5.6 Home Assistant Tools (`tools/home-assistant-*.tool.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/home-assistant-list-entities.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ensureBernardConfiguration } from "../configuration.js";

export const listEntitiesTool = tool(
  async ({ domain, regex }: { domain?: string; regex?: string } = {}, config?: LangGraphRunnableConfig) => {
    const bernardConfig = ensureBernardConfiguration(config);
    const haConfig = bernardConfig.homeAssistantConfig;

    if (!haConfig) {
      return "Home Assistant not configured.";
    }

    const response = await fetch(
      `${haConfig.baseUrl}/api/states`,
      { headers: { Authorization: `Bearer ${haConfig.accessToken}` } }
    );
    const entities = await response.json();

    let filtered = entities;
    if (domain) {
      filtered = filtered.filter((e: any) => e.entity_id.startsWith(`${domain}.`));
    }

    if (regex) {
      const pattern = new RegExp(regex, "i");
      filtered = filtered.filter((e: any) => pattern.test(`${e.entity_id} ${e.state}`));
    }

    return filtered
      .map((e: any) => `${e.entity_id}: ${e.state}`)
      .join("\n");
  },
  {
    name: "list_home_assistant_entities",
    description: "List Home Assistant entities. Filter by domain or regex.",
    schema: z.object({
      domain: z.string().optional().describe("Filter by domain (e.g., 'light', 'sensor')"),
      regex: z.string().optional().describe("Regex pattern to match entity"),
    }),
  },
);
```

```typescript
// File: services/bernard-agent/src/bernard-agent/tools/home-assistant-toggle-light.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ensureBernardConfiguration } from "../configuration.js";

export const toggleLightTool = tool(
  async ({ entity_id, state }: { entity_id: string; state: "on" | "off" }, config?: LangGraphRunnableConfig) => {
    const bernardConfig = ensureBernardConfiguration(config);
    const haConfig = bernardConfig.homeAssistantConfig;

    if (!haConfig) {
      return "Home Assistant not configured.";
    }

    const domain = entity_id.split(".")[0];
    await fetch(
      `${haConfig.baseUrl}/api/services/${domain}/turn_${state}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${haConfig.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entity_id }),
      }
    );

    return `Turned ${state} ${entity_id}`;
  },
  {
    name: "toggle_home_assistant_light",
    description: "Toggle a Home Assistant light or switch on/off.",
    schema: z.object({
      entity_id: z.string().describe("The entity ID to control"),
      state: z.enum(["on", "off"]).describe("Desired state"),
    }),
  },
);
```

**NOTE**: The remaining HA tools (`get-entity-state`, `execute-services`, `historical-state`) follow the same pattern - copy from `services/bernard/src/agent/tool/` and adapt to use the configuration pattern.

---

## Phase 6: Main Graph (`graph.ts`)

```typescript
// File: services/bernard-agent/src/bernard-agent/graph.ts
import {
  LangGraphRunnableConfig,
  START,
  StateGraph,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { loadChatModel } from "./utils.js";

import { BernardStateAnnotation } from "./state.js";
import { BernardConfigurationAnnotation, ensureBernardConfiguration } from "./configuration.js";
import * as Tools from "./tools/index.js";

/**
 * Node: call_react_model
 * 
 * The routing agent - decides which tools to call, then decides if more are needed.
 * Has tools bound so it can output tool calls.
 */
async function callReactModel(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  const tools = [
    Tools.webSearchTool,
    Tools.websiteContentTool,
    Tools.wikipediaSearchTool,
    Tools.wikipediaEntryTool,
    Tools.weatherTool,
    Tools.listEntitiesTool,
    Tools.getEntityStateTool,
    Tools.toggleLightTool,
    Tools.executeServiceTool,
    Tools.historicalStateTool,
  ];

  const llm = await loadChatModel(bernardConfig.reactModel);
  const boundLLM = llm.bind({ tools });

  const systemPrompt = bernardConfig.systemPrompt
    .replace("{time}", new Date().toISOString());

  const result = await boundLLM.invoke(
    [{ role: "system", content: systemPrompt }, ...state.messages],
    { configurable: { model: bernardConfig.reactModel } }
  );

  return { messages: [result] };
}

/**
 * Route from call_react_model: tools or response?
 */
function shouldCallTools(
  state: typeof BernardStateAnnotation.State,
): "tools" | "call_response_model" {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  if (!lastMessage || !("tool_calls" in lastMessage)) {
    return "call_response_model";
  }

  const toolCalls = lastMessage.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return "call_response_model";
  }

  return "tools";
}

/**
 * Node: tools
 * 
 * Execute tool calls using prebuilt ToolNode.
 * CRITICAL: After tools execute, we ALWAYS return to call_react_model.
 */
async function executeTools(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  const tools = [
    Tools.webSearchTool,
    Tools.websiteContentTool,
    Tools.wikipediaSearchTool,
    Tools.wikipediaEntryTool,
    Tools.weatherTool,
    Tools.listEntitiesTool,
    Tools.getEntityStateTool,
    Tools.toggleLightTool,
    Tools.executeServiceTool,
    Tools.historicalStateTool,
  ];

  const toolNode = new ToolNode(tools);
  const result = await toolNode.invoke(state, config);

  return { messages: result.messages };
}

/**
 * Node: call_response_model
 * 
 * The response agent - generates the final natural language response.
 * Has NO tools bound - pure response generation.
 */
async function callResponseModel(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  const llm = await loadChatModel(bernardConfig.responseModel);

  const systemPrompt = bernardConfig.systemPrompt
    .replace("{time}", new Date().toISOString());

  const result = await llm.invoke(
    [{ role: "system", content: systemPrompt }, ...state.messages],
    { configurable: { model: bernardConfig.responseModel } }
  );

  return { messages: [result] };
}

/**
 * Create the Bernard agent graph.
 * 
 * Graph structure:
 * 
 *     START
 *        │
 *        ▼
 *  call_react_model
 *        │
 *        ├── tools ──► tools ──► call_react_model ──► ...
 *        │
 *        └── no tools ──► call_response_model ──► END
 */
export function createBernardGraph() {
  const workflow = new StateGraph(
    BernardStateAnnotation,
    BernardConfigurationAnnotation,
  )
    .addNode("call_react_model", callReactModel)
    .addNode("tools", executeTools)
    .addNode("call_response_model", callResponseModel)

    .addEdge(START, "call_react_model")
    .addConditionalEdges(
      "call_react_model",
      shouldCallTools,
      { tools: "tools", call_response_model: "call_response_model" }
    )
    .addEdge("tools", "call_react_model")  // NO CHOICE - always ask for more
    .addEdge("call_response_model", END);

  const checkpointer = new MemorySaver();

  return workflow.compile({
    checkpointer,
    interruptBefore: [],
    interruptAfter: [],
  });
}

export const graph = createBernardGraph();
graph.name = "BernardAgent";
```

---

## Phase 7: Update Proxy API Routes

**File**: `proxy-api/src/routes/v1.ts`

```typescript
// Update the upstream URL
const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';

// Chat completions proxy
fastify.register(proxy, {
  upstream: BERNARD_AGENT_URL,
  prefix: '/chat/completions',
  rewritePrefix: '/v1/chat/completions',
  http2: false,
  disableContentHandling: true,
  rewriteRequestHeaders: passThroughAuth,
  errorHandler: (reply: any, error: any) => {
    logger.error({ msg: 'Proxy Error (Chat)', error: error.message, upstream: BERNARD_AGENT_URL });
    reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-agent' });
  }
} as any);

// Threads proxy
fastify.register(proxy, {
  upstream: BERNARD_AGENT_URL,
  prefix: '/threads',
  rewritePrefix: '/threads',
  http2: false,
  rewriteRequestHeaders: passThroughAuth,
  errorHandler: (reply: any, error: any) => {
    logger.error({ msg: 'Proxy Error (Threads)', error: error.message, upstream: BERNARD_AGENT_URL });
    reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-agent' });
  }
} as any);
```

---

## Phase 8: Running & Testing

### 8.1 Install Dependencies

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent
npm install
```

### 8.2 Run the Agent

```bash
cd /home/blake/Documents/software/bernard/services/bernard-agent
npm run dev
```

This starts the LangGraph dev server on port 2024.

### 8.3 Test

```bash
curl -X POST http://localhost:2024/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bernard_agent",
    "messages": [{"role": "user", "content": "What is the weather in San Francisco?"}]
  }'
```

---

## Files Summary

### To Create (NEW)

```
services/bernard-agent/
├── langgraph.json              # Graph registry
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript config
├── .env.example                # Environment template
├── README.md                   # Documentation
└── src/
    └── bernard-agent/
        ├── graph.ts            # Main graph (ReAct pattern)
        ├── state.ts            # State definition
        ├── configuration.ts    # Configurable parameters
        ├── utils.ts            # Utilities
        ├── tools/              # TOOL IMPLEMENTATIONS
        │   ├── index.ts
        │   ├── web-search.tool.ts
        │   ├── website-content.tool.ts
        │   ├── wikipedia-search.tool.ts
        │   ├── wikipedia-entry.tool.ts
        │   ├── get-weather-data.tool.ts
        │   ├── home-assistant-list-entities.tool.ts
        │   ├── home-assistant-execute-services.tool.ts
        │   ├── home-assistant-toggle-light.tool.ts
        │   ├── home-assistant-get-entity-state.tool.ts
        │   ├── home-assistant-historical-state.tool.ts
        │   ├── timer.tool.ts    # NOT IMPLEMENTING - reference only
        │   └── play_media_tv.tool.ts # NOT IMPLEMENTING - reference only
        └── lib/                # SHARED LIBRARIES
            ├── config/
            │   ├── settings.ts
            │   └── appSettings.ts
            ├── home-assistant/
            │   └── index.ts
            └── logging.ts       # Logging utilities
```

### To Modify

```
proxy-api/
└── src/routes/v1.ts            # Update upstream URLs
```

### Preserved (NOT Touched)

```
services/
├── bernard/           # PRESERVED (original - source for copying only)
└── bernard-chat/      # PRESERVED (examples only - will be deleted)
```

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Service Structure | 30 minutes |
| Phase 2: Copy Tools | 15 minutes |
| Phase 3: Copy Libraries | 15 minutes |
| Phase 4: Tool Implementation | 3-4 hours |
| Phase 5: Main Graph | 1 hour |
| Phase 6: Proxy Routes | 30 minutes |
| Phase 7-8: Testing | 1-2 hours |

**Total**: ~7-9 hours

---

## Critical Rules Reminder

1. **DO NOT import** from `bernard` or `bernard-chat` services
2. **COPY** what you need into `bernard-agent/`
3. `bernard-agent/` must be **fully standalone**
4. No cross-service dependencies

---

## Approval

**Status**: Ready for implementation

**Last Updated**: 2026-01-04

**Author**: AI Planning Assistant
