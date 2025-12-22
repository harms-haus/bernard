# Voice Assistant `get_website_content` Tool Implementation Guide

## Overview

This document provides complete specifications and implementation guidance for building a `get_website_content` tool that integrates with a voice assistant. The tool uses **@mozilla/readability** and **jsdom** to extract clean, structured article content from websites, with support for chunked token-based ingestion.

## Use Case

Voice assistants often need to retrieve and process web content. Rather than passing raw HTML, this tool:
- **Extracts readable content** (title, article text, metadata) from any webpage
- **Returns structured data** with token-based slicing for efficient LLM ingestion
- **Supports incremental loading** via `tokenOffset` and `tokenCount` for large articles
- **Filters out noise** (ads, navigation, sidebars) automatically

This enables voice assistants to answer questions about web content without overwhelming context windows.

## Dependencies

```json
{
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "jsdom": "^25.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

Install with:
```bash
npm install @mozilla/readability jsdom
npm install -D @types/node typescript
```

## Tool Specification

### Function Signature

```typescript
interface GetWebsiteContentInput {
  uri: string
  tokenOffset?: number
  tokenCount?: number
}

interface GetWebsiteContentOutput {
  title: string
  content: string
  url: string
  byline: string | null
  totalTokens: number
  returnedTokens: number
  tokenOffset: number
  hasMore: boolean
}

function getWebsiteContent(input: GetWebsiteContentInput): Promise<GetWebsiteContentOutput>
```

### Parameter Details

**`uri` (required, string)**
- The URL to fetch and parse
- Examples: `"https://example.com/article"`, `"https://docs.example.com/guide"`
- The tool handles both HTTP and HTTPS

**`tokenOffset` (optional, number, default: 0)**
- Starting position in the token stream of the article content
- Used for pagination when content exceeds token limits
- Useful for agents that need to read large articles in chunks
- Example: First call with `tokenOffset: 0, tokenCount: 2000`, then second call with `tokenOffset: 2000, tokenCount: 2000`

**`tokenCount` (optional, number, default: 4000)**
- Maximum number of tokens to return in this call
- Allows agents to control context window usage
- Typical range: 1000-8000 depending on LLM constraints
- If omitted, defaults to 4000 tokens

### Response Details

**`title` (string)**
- Article headline/page title extracted by Readability
- Empty string if no title found

**`content` (string)**
- Extracted article body text
- Already cleaned of HTML, ads, navigation
- Sliced to `[tokenOffset : tokenOffset + tokenCount]` tokens

**`url` (string)**
- The canonical URL of the article
- Useful for voice assistant to cite sources

**`byline` (string | null)**
- Author attribution if detected by Readability
- Null if no byline found

**`totalTokens` (number)**
- Total token count of the full article (before slicing)
- Agents use this to determine if more calls are needed

**`returnedTokens` (number)**
- Actual token count returned in this response
- May be less than `tokenCount` if article is shorter

**`tokenOffset` (number)**
- The offset used for this response (echoed back for clarity)
- Helps agents track pagination state

**`hasMore` (boolean)**
- `true` if more content exists beyond this slice
- `false` if this is the final chunk
- Agents use this to decide whether to call again

## Implementation Architecture

### Core Components

```
┌─────────────────────────────────────────────────┐
│         Voice Assistant Agent                    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│    getWebsiteContent(uri, offset, count)        │
│  ┌───────────────────────────────────────────┐  │
│  │ 1. Fetch HTML (node-fetch or axios)       │  │
│  │ 2. Create JSDOM from HTML                 │  │
│  │ 3. Extract via Readability                │  │
│  │ 4. Tokenize content                       │  │
│  │ 5. Slice tokens [offset:offset+count]     │  │
│  │ 6. Return structured result               │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Tokenization Strategy

Tokens are counted by splitting on **whitespace and punctuation**. This is a simple, fast heuristic suitable for most LLMs:

```typescript
function countTokens(text: string): number {
  return text.split(/\s+/).filter(t => t.length > 0).length
}

function sliceByTokens(text: string, offset: number, count: number): string {
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const sliced = tokens.slice(offset, offset + count)
  return sliced.join(' ')
}
```

**Note:** For production, consider using the actual tokenizer for your LLM (e.g., `js-tiktoken` for OpenAI models). This basic approach works for voice assistant context approximation.

## Reference Implementation

```typescript
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

interface GetWebsiteContentInput {
  uri: string
  tokenOffset?: number
  tokenCount?: number
}

interface GetWebsiteContentOutput {
  title: string
  content: string
  url: string
  byline: string | null
  totalTokens: number
  returnedTokens: number
  tokenOffset: number
  hasMore: boolean
}

/**
 * Simple token counter (whitespace-based)
 * For production, replace with LLM-specific tokenizer
 */
function countTokens(text: string): number {
  return text.split(/\s+/).filter(t => t.length > 0).length
}

/**
 * Slice text by token boundaries
 */
function sliceByTokens(text: string, offset: number, count: number): string {
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const sliced = tokens.slice(offset, offset + count)
  return sliced.join(' ')
}

/**
 * Fetch HTML from URI
 * Replace with your preferred HTTP client (fetch, axios, etc.)
 */
async function fetchHtml(uri: string): Promise<string> {
  const response = await fetch(uri, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VoiceAssistant/1.0)'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${uri}: ${response.status} ${response.statusText}`)
  }
  
  return response.text()
}

/**
 * Main tool implementation
 */
export async function getWebsiteContent(
  input: GetWebsiteContentInput
): Promise<GetWebsiteContentOutput> {
  const {
    uri,
    tokenOffset = 0,
    tokenCount = 4000
  } = input

  // Validation
  if (!uri) {
    throw new Error('uri parameter is required')
  }
  
  if (tokenOffset < 0) {
    throw new Error('tokenOffset must be >= 0')
  }
  
  if (tokenCount <= 0) {
    throw new Error('tokenCount must be > 0')
  }

  try {
    // 1. Fetch HTML
    const html = await fetchHtml(uri)

    // 2. Parse with JSDOM
    // runScripts: 'outside-only' prevents executing inline scripts
    // resources: 'usable' disabled to prevent network requests during parsing
    const dom = new JSDOM(html, {
      url: uri,
      runScripts: 'outside-only'
    })

    // 3. Extract with Readability
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article) {
      throw new Error('Failed to extract article content from page')
    }

    // 4. Get full text and count tokens
    const fullContent = article.textContent || ''
    const totalTokens = countTokens(fullContent)

    // 5. Slice by tokens
    const slicedContent = sliceByTokens(fullContent, tokenOffset, tokenCount)
    const returnedTokens = countTokens(slicedContent)

    // 6. Determine if more content exists
    const hasMore = (tokenOffset + tokenCount) < totalTokens

    return {
      title: article.title || '',
      content: slicedContent,
      url: article.url || uri,
      byline: article.byline || null,
      totalTokens,
      returnedTokens,
      tokenOffset,
      hasMore
    }

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`getWebsiteContent failed: ${error.message}`)
    }
    throw error
  }
}
```

## Usage Examples

### Basic Usage

```typescript
const result = await getWebsiteContent({
  uri: 'https://www.example.com/article'
})

console.log(`Title: ${result.title}`)
console.log(`Content (${result.returnedTokens} tokens): ${result.content}`)
console.log(`Total article size: ${result.totalTokens} tokens`)
```

### Incremental Ingestion (Large Articles)

```typescript
const uri = 'https://www.example.com/long-article'
let offset = 0
const chunkSize = 2000

while (true) {
  const chunk = await getWebsiteContent({
    uri,
    tokenOffset: offset,
    tokenCount: chunkSize
  })

  console.log(`Chunk ${offset / chunkSize + 1}: ${chunk.returnedTokens} tokens`)
  // Process chunk...

  offset += chunk.returnedTokens

  if (!chunk.hasMore) {
    console.log('Finished reading entire article')
    break
  }
}
```

### Voice Assistant Integration

```typescript
async function handleVoiceQuery(query: string): Promise<string> {
  // Agent extracts URL from voice query
  const url = 'https://example.com/article'

  // Fetch initial chunk
  const firstChunk = await getWebsiteContent({
    uri: url,
    tokenCount: 2000
  })

  // If answer found in first chunk, return early
  if (firstChunk.content.includes('answer')) {
    return `From "${firstChunk.title}": ${extractRelevantExcerpt(firstChunk.content)}`
  }

  // Otherwise, fetch next chunk
  if (firstChunk.hasMore) {
    const secondChunk = await getWebsiteContent({
      uri: url,
      tokenOffset: 2000,
      tokenCount: 2000
    })
    // Continue searching...
  }

  return 'Could not find answer'
}
```

## Design Decisions & Flexibility

This section documents key architectural choices to help coding agents make informed modifications.

### 1. Tokenization Approach

**Current:** Simple whitespace splitting

**Why:** Fast, works across languages, no dependencies

**Consider changing to:**
- **js-tiktoken**: For OpenAI-compatible token counting (most accurate for GPT models)
- **Hugging Face transformers**: For other LLM families
- **Byte-pair encoding**: Language-specific tokenization

```typescript
// Alternative with js-tiktoken (for OpenAI models)
import { encoding_for_model } from 'js-tiktoken'

const enc = encoding_for_model('gpt-4')
function countTokens(text: string): number {
  return enc.encode(text).length
}
```

### 2. HTTP Client

**Current:** Native `fetch` API (Node 18+)

**Why:** Built-in, no extra dependencies

**Alternatives:**
- **axios**: Better error handling, automatic retries
- **got**: Lightweight, streams support
- **undici**: Modern HTTP client with better performance

```typescript
// Alternative with axios
import axios from 'axios'

async function fetchHtml(uri: string): Promise<string> {
  const { data } = await axios.get(uri, {
    headers: { 'User-Agent': 'VoiceAssistant/1.0' },
    timeout: 10000
  })
  return data
}
```

### 3. Error Handling

**Current:** Basic error wrapping

**Considerations:**
- Should 404s throw or return empty content?
- How to handle timeouts (network slow vs. server down)?
- Should malformed HTML fallback gracefully?

**Enhanced error handling:**

```typescript
class WebContentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message)
  }
}

async function fetchHtml(uri: string): Promise<string> {
  try {
    const response = await fetch(uri, { signal: AbortSignal.timeout(10000) })
    
    if (response.status === 404) {
      throw new WebContentError('Page not found', 'NOT_FOUND', 404)
    }
    if (!response.ok) {
      throw new WebContentError(
        `HTTP ${response.status}`,
        'HTTP_ERROR',
        response.status
      )
    }
    return response.text()
  } catch (error) {
    if (error instanceof WebContentError) throw error
    throw new WebContentError('Network error', 'NETWORK_ERROR')
  }
}
```

### 4. Content Filtering

**Current:** Readability handles filtering automatically

**Future enhancements:**
- Skip pages with low content/noise ratio
- Filter adult content before returning
- Remove code blocks (for non-technical queries)
- Custom rules per domain

```typescript
function shouldSkipContent(article: Article): boolean {
  // Skip if too much boilerplate
  if (countTokens(article.textContent || '') < 100) {
    return true
  }
  
  // Skip if mostly code
  const codeLines = (article.textContent || '').split('\n')
    .filter(line => /^[\s]*[{}\[\]<>]/.test(line)).length
  if (codeLines / article.textContent!.split('\n').length > 0.5) {
    return true
  }
  
  return false
}
```

### 5. Caching

**Current:** No caching—fetches fresh content every call

**Consider adding:**
- Redis cache with 1-hour TTL for popular articles
- Memory cache for same-session repeats
- ETags for conditional requests

```typescript
const contentCache = new Map<string, CacheEntry>()

async function getWebsiteContent(input: GetWebsiteContentInput) {
  const cacheKey = `${input.uri}:${input.tokenOffset}:${input.tokenCount}`
  const cached = contentCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.data
  }
  
  // Fetch and cache...
  const result = { /* ... */ }
  contentCache.set(cacheKey, { data: result, timestamp: Date.now() })
  
  return result
}
```

### 6. Timeout & Resource Limits

**Current:** No explicit timeouts

**Recommendations:**

```typescript
const FETCH_TIMEOUT = 10000 // 10 seconds
const MAX_HTML_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_CONTENT_SIZE = 100000 // tokens

async function fetchHtml(uri: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(uri, { signal: controller.signal })
    const buffer = await response.arrayBuffer()
    
    if (buffer.byteLength > MAX_HTML_SIZE) {
      throw new Error(`Page too large: ${buffer.byteLength} bytes`)
    }
    
    return new TextDecoder().decode(buffer)
  } finally {
    clearTimeout(timeoutId)
  }
}

function validateTokenCount(count: number) {
  if (count > MAX_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size: ${count} > ${MAX_CONTENT_SIZE} tokens`)
  }
}
```

## Integration with Voice Assistant Frameworks

### Home Assistant Custom Component

```python
# For Home Assistant integration
import asyncio
from homeassistant.core import HomeAssistant

async def setup_platform(hass: HomeAssistant, config, async_add_devices, discovery_info=None):
    async def service_get_website_content(call):
        uri = call.data.get('uri')
        offset = call.data.get('offset', 0)
        count = call.data.get('count', 4000)
        
        # Call Node.js tool via HTTP or subprocess
        result = await call_nodejs_tool({
            'uri': uri,
            'tokenOffset': offset,
            'tokenCount': count
        })
        
        hass.bus.async_fire('website_content_retrieved', result)
    
    hass.services.async_register('voice_assistant', 'get_website_content', service_get_website_content)
```

### Ollama/LLaMA.cpp Integration

If running Ollama locally, wrap the tool as a callable function in your agent:

```typescript
import Ollama from 'ollama'

const ollama = new Ollama({ host: 'http://localhost:11434' })

async function agentWithWebAccess(userQuery: string) {
  const tools = [
    {
      name: 'get_website_content',
      description: 'Fetch and parse article content from a URL',
      function: getWebsiteContent,
      schema: {
        uri: 'string (required)',
        tokenOffset: 'number (default: 0)',
        tokenCount: 'number (default: 4000)'
      }
    }
  ]
  
  // Use with local LLM
  const response = await ollama.generate({
    model: 'mistral',
    prompt: userQuery,
    tools // Your framework must support tool calling
  })
}
```

## Testing Recommendations

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('getWebsiteContent', () => {
  // Mock fetch to avoid network calls
  
  it('should extract article title and content', async () => {
    const result = await getWebsiteContent({
      uri: 'https://example.com/article'
    })
    
    expect(result.title).toBeTruthy()
    expect(result.content).toBeTruthy()
    expect(result.totalTokens).toBeGreaterThan(0)
  })
  
  it('should slice content by token offset and count', async () => {
    const firstChunk = await getWebsiteContent({
      uri: 'https://example.com/article',
      tokenOffset: 0,
      tokenCount: 1000
    })
    
    const secondChunk = await getWebsiteContent({
      uri: 'https://example.com/article',
      tokenOffset: 1000,
      tokenCount: 1000
    })
    
    expect(firstChunk.content).not.toEqual(secondChunk.content)
    expect(firstChunk.hasMore).toBe(true)
  })
  
  it('should return hasMore=false for final chunk', async () => {
    const result = await getWebsiteContent({
      uri: 'https://example.com/short-article',
      tokenOffset: 0,
      tokenCount: 10000
    })
    
    expect(result.hasMore).toBe(false)
  })
})
```

### Integration Tests

Test against real websites (use well-known, stable URLs):

```typescript
it('should handle news articles', async () => {
  const result = await getWebsiteContent({
    uri: 'https://example-news.com/article/2024'
  })
  
  expect(result.title).toBeTruthy()
  expect(result.byline).toBeTruthy() // News articles usually have bylines
})

it('should handle documentation sites', async () => {
  const result = await getWebsiteContent({
    uri: 'https://docs.example.com/guide'
  })
  
  expect(result.content).toContain('class') // Docs often have code
})
```

## Security Considerations

### Input Validation

```typescript
import { URL } from 'url'

function validateUri(uri: string): void {
  try {
    const url = new URL(uri)
    
    // Only allow http(s)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP(S) URLs are allowed')
    }
    
    // Optional: Restrict to certain domains
    const allowedDomains = ['wikipedia.org', 'example.com']
    if (!allowedDomains.some(domain => url.hostname.endsWith(domain))) {
      throw new Error(`Domain ${url.hostname} not allowed`)
    }
  } catch (error) {
    throw new Error(`Invalid URI: ${uri}`)
  }
}
```

### JSDOM Security

```typescript
// Safe JSDOM configuration
const dom = new JSDOM(html, {
  url: uri,
  runScripts: 'outside-only', // Don't execute inline scripts
  beforeParse(window) {
    // Disable fetch/XMLHttpRequest
    window.fetch = undefined
    window.XMLHttpRequest = undefined
  }
})
```

### Rate Limiting

```typescript
const rateLimiter = new Map<string, number[]>()

function checkRateLimit(uri: string): void {
  const hostname = new URL(uri).hostname
  const now = Date.now()
  const recentRequests = (rateLimiter.get(hostname) || [])
    .filter(t => now - t < 60000) // Last 60 seconds
  
  if (recentRequests.length > 10) {
    throw new Error(`Rate limit exceeded for ${hostname}`)
  }
  
  recentRequests.push(now)
  rateLimiter.set(hostname, recentRequests)
}
```

## Troubleshooting Guide

### "Failed to extract article content from page"

**Cause:** Readability couldn't find meaningful content

**Solutions:**
- Page is mostly navigation/ads (Readability skips these)
- Content is dynamic (loaded via JavaScript) — consider using Playwright instead of JSDOM
- Page uses unusual HTML structure

**Fallback:**
```typescript
const article = reader.parse()
if (!article) {
  // Fallback: Return all text content
  const text = dom.window.document.body.textContent || ''
  return { content: text, title: dom.window.document.title }
}
```

### JSDOM Memory Issues with Large Pages

**Cause:** Parsing massive HTML documents

**Solution:**
```typescript
// Limit HTML size before parsing
if (html.length > 5 * 1024 * 1024) {
  // Truncate to reasonable size
  html = html.substring(0, 5 * 1024 * 1024)
}

const dom = new JSDOM(html, { url: uri })
```

### Incorrect Token Slicing

**Issue:** Token counts don't match LLM tokenizer

**Fix:** Replace simple whitespace tokenizer with actual LLM tokenizer:

```typescript
import { encoding_for_model } from 'js-tiktoken'

const enc = encoding_for_model('gpt-4') // Use your actual model

function countTokens(text: string): number {
  return enc.encode(text).length
}

function sliceByTokens(text: string, offset: number, count: number): string {
  const tokens = enc.encode(text)
  const sliced = tokens.slice(offset, offset + count)
  return enc.decode(sliced)
}
```

## Performance Optimization Tips

1. **Parallel requests** (if using multiple domains):
```typescript
const results = await Promise.all([
  getWebsiteContent({ uri: url1 }),
  getWebsiteContent({ uri: url2 })
])
```

2. **Stream large articles** instead of loading entirely:
```typescript
// For truly massive articles, consider streaming chunks
async function* streamWebsiteContent(uri: string, chunkSize: number = 2000) {
  let offset = 0
  while (true) {
    const chunk = await getWebsiteContent({ uri, tokenOffset: offset, tokenCount: chunkSize })
    yield chunk
    if (!chunk.hasMore) break
    offset += chunk.returnedTokens
  }
}
```

3. **Cache responses** by URL to avoid re-fetching same content

4. **Use ETags** for conditional requests (check if content changed)

## Conclusion

This tool provides a robust foundation for web content extraction in voice assistants. The reference implementation handles common cases well, but the modular design supports customization for specific needs:

- Replace tokenizer for LLM-specific accuracy
- Add caching for improved performance
- Implement domain-specific content filters
- Integrate with your chosen voice assistant framework

Start with the reference implementation, then optimize based on your voice assistant's actual usage patterns and performance requirements.
