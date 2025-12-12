# Web Search API Documentation

This document provides comprehensive API documentation for the Bernard web search tool, including SearXNG integration details.

## Table of Contents

1. [Tool Overview](#tool-overview)
2. [Configuration](#configuration)
3. [API Endpoint](#api-endpoint)
4. [Request Parameters](#request-parameters)
5. [Response Format](#response-format)
6. [Error Handling](#error-handling)
7. [Provider-Specific Details](#provider-specific-details)
8. [Examples](#examples)

## Tool Overview

The web search tool provides access to search functionality through Bernard's AI assistant. It supports SearXNG as the primary search provider.

### Supported Providers

| Provider | Status | Priority |
|----------|--------|----------|
| SearXNG | ✅ Recommended | 1 (Highest) |

### Key Features

- **Privacy-focused**: SearXNG integration for enhanced privacy
- **Consistent interface**: Unified API regardless of provider
- **Error handling**: Graceful degradation and clear error messages
- **Rate limiting**: Configurable timeouts and result limits

## Configuration

### Environment Variables

#### SearXNG Configuration (Recommended)

```bash
# Required
SEARXNG_API_URL=https://your-searxng-instance.com/search

# Optional
SEARXNG_API_KEY=your-api-key-if-required
SEARXNG_USER_AGENT=bernard-assistant/1.0
SEARXNG_TIMEOUT_MS=5000
```

### Configuration Priority

1. **Environment variables** (highest priority)
2. **Redis settings** (fallback)
3. **Default values** (lowest priority)

### Configuration Verification

```bash
# Check if search is configured
curl -s http://localhost:3000/api/status | jq '.services.search'

# Expected response when configured:
{
  "configured": true,
  "provider": "searxng"
}
```

## API Endpoint

The web search tool is accessed through Bernard's chat completion API:

```
POST /api/v1/chat/completions
```

### Tool Invocation

The web search tool is automatically invoked when the AI determines a search is needed, or can be explicitly called:

```json
{
  "tool_calls": [
    {
      "name": "web_search",
      "arguments": {
        "query": "search term",
        "count": 3
      }
    }
  ]
}
```

## Request Parameters

### Tool-Specific Parameters

| Parameter | Type | Required | Description | Default | Min | Max |
|-----------|------|----------|-------------|---------|-----|-----|
| `query` | string | ✅ | Search query | - | 3 chars | - |
| `count` | number | ❌ | Number of results | 3 | 1 | 8 |

### Query Parameter Details

- **Minimum length**: 3 characters
- **Maximum length**: No hard limit, but practical limits apply
- **Character encoding**: UTF-8 supported
- **Special characters**: Automatically URL-encoded

### Count Parameter Details

- **Default**: 3 results
- **Minimum**: 1 result
- **Maximum**: 8 results (enforced by Bernard)
- **SearXNG limit**: 8 results (configurable per instance)

## Response Format

### Success Response

```
1. Page Title — https://example.com :: Page description or snippet
2. Another Result — https://example.org :: Another description
3. Third Result — https://example.net :: Third description
```

### Response Format Specification

```
{result_number}. {title} — {url} :: {description}
```

### Field Details

| Field | Description | Maximum Length |
|-------|-------------|----------------|
| `result_number` | 1-based index | - |
| `title` | Page title from search result | 100 chars |
| `url` | Full URL to the page | 2048 chars |
| `description` | Snippet or content preview | 200 chars |

### Error Responses

```
Search tool is not configured (Missing search API configuration.)
```

```
Search service unavailable, please try again later
```

```
Search failed: 500 Internal Server Error
```

```
No results.
```

## Error Handling

### Error Types and Messages

| Error Type | HTTP Status | Response Message | Retryable |
|------------|-------------|------------------|-----------|
| Configuration missing | 400 | "Search tool is not configured" | ❌ |
| Network error | - | "Search service unavailable" | ✅ |
| API error (4xx) | 4xx | "Search failed: {status}" | ⚠️ |
| API error (5xx) | 5xx | "Search failed: {status}" | ✅ |
| Timeout | - | "Search service unavailable" | ✅ |
| Invalid response | 400 | "Invalid search response" | ❌ |
| No results | 200 | "No results." | ❌ |

### Timeout Behavior

- **Default timeout**: 5 seconds
- **Configurable**: Via `SEARXNG_TIMEOUT_MS` environment variable

## Provider-Specific Details

### SearXNG Provider

#### API Endpoint

```
GET {SEARXNG_API_URL}?q={query}&format=json&pageno=1&language=en-US&num={count}
```

#### Request Headers

```
Authorization: Bearer {SEARXNG_API_KEY}  # Only if API key configured
User-Agent: {SEARXNG_USER_AGENT}        # Default: bernard-assistant
```

#### Response Processing

1. **URL Construction**: [`buildSearXNGUrl()`](bernard/agent/harness/intent/tools/web-search.ts:218)
2. **API Request**: [`fetchSearXNGSearch()`](bernard/agent/harness/intent/tools/web-search.ts:282)
3. **Response Parsing**: [`parseSearXNGResults()`](bernard/agent/harness/intent/tools/web-search.ts:245)
4. **Result Formatting**: [`formatResults()`](bernard/agent/harness/intent/tools/web-search.ts:274)

#### SearXNG Response Format

```json
{
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com",
      "content": "Page description",
      "engine": "google",
      "score": 0.95
    }
  ],
  "query": "search term",
  "number_of_results": 10
}
```

## Examples

### Basic Search Request

```bash
curl -N http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"bernard-v1",
    "messages":[{"role":"user","content":"What is the weather in Paris?"}],
    "stream": true
  }'
```

### Direct Tool Invocation

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"bernard-v1",
    "messages":[{"role":"user","content":"Search the web for AI trends"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "web_search",
          "description": "Search the web for fresh information.",
          "parameters": {
            "type": "object",
            "properties": {
              "query": {"type": "string"},
              "count": {"type": "number"}
            },
            "required": ["query"]
          }
        }
      }
    ]
  }'
```

### Configuration Test

```bash
# Test SearXNG configuration
curl -v "https://your-searxng-instance.com/search?q=test&format=json&language=en-US"
```

### Error Handling Example

```bash
# Test with invalid configuration
SEARXNG_API_URL="" npm run dev

# Expected error response:
# "Search tool is not configured (Missing search API configuration.)"
```

## Performance Characteristics

### Response Times

| Provider | Typical Response Time | Timeout |
|----------|----------------------|---------|
| SearXNG | 300-1500ms | 5000ms |

### Rate Limits

| Provider | Rate Limit | Configurable |
|----------|------------|--------------|
| SearXNG | Instance-dependent | ✅ |

### Result Quality

| Provider | Result Relevance | Freshness | Diversity |
|----------|------------------|-----------|-----------|
| SearXNG | ✅ Good | ✅ Good | ✅ Excellent |

## Monitoring and Logging

### Log Format

```
INFO: Executing search: query="{query}" count={count} provider={provider}
ERROR: Search request failed: {error_message}
ERROR: SearXNG API error: {status} {statusText} - {body}
```

### Metrics

- **Request count**: Tracked per provider
- **Response time**: Measured in milliseconds
- **Error rate**: Monitored for reliability
- **Result count**: Analyzed for quality

## Troubleshooting

### Common Issues

#### "Search tool is not configured"
- **Cause**: Missing or invalid configuration
- **Solution**: Set `SEARXNG_API_URL`

#### "Search service unavailable"
- **Cause**: Network issues or provider downtime
- **Solution**: Check provider status, verify network connectivity

#### No results returned
- **Cause**: Provider issues or invalid query
- **Solution**: Test provider directly, verify query format

#### Timeout errors
- **Cause**: Slow provider response
- **Solution**: Increase `SEARXNG_TIMEOUT_MS`

### Debugging Commands

```bash
# Check Bernard logs
journalctl -u bernard -f

# Test provider directly
curl -v "https://your-searxng-instance.com/search?q=test&format=json"

# Verify configuration
node -e "console.log(require('./agent/harness/intent/tools/web-search.ts').verifySearchConfigured())"
```

## Best Practices

### Configuration
- Use environment variables for sensitive data
- Prefer SearXNG for privacy-focused deployments
- Configure appropriate timeouts based on network conditions

### Performance
- Choose geographically close SearXNG instances
- Monitor and adjust result counts based on usage patterns
- Implement caching for frequent queries

### Security
- Always use HTTPS for API endpoints
- Validate and sanitize search queries
- Monitor for unusual search patterns

### Monitoring
- Track search request metrics
- Monitor error rates and response times
- Log important events for debugging

## API Reference

### Tool Schema

```typescript
{
  name: "web_search",
  description: "Search the web for fresh information.",
  schema: z.object({
    query: z.string().min(3),
    count: z.number().int().min(1).max(8).optional()
  })
}
```

### Configuration Functions

- [`resolveSearchConfig()`](bernard/agent/harness/intent/tools/web-search.ts:174): Resolve search configuration
- [`verifySearchConfigured()`](bernard/agent/harness/intent/tools/web-search.ts:194): Verify configuration status
- [`executeSearch()`](bernard/agent/harness/intent/tools/web-search.ts:327): Execute search with selected provider

### Utility Functions

- [`buildSearXNGUrl()`](bernard/agent/harness/intent/tools/web-search.ts:218): Build SearXNG search URL
- [`parseSearXNGResults()`](bernard/agent/harness/intent/tools/web-search.ts:245): Parse SearXNG response
- [`formatResults()`](bernard/agent/harness/intent/tools/web-search.ts:274): Format results for output

This comprehensive API documentation covers all aspects of the Bernard web search tool, including configuration, usage, error handling, and provider-specific details for SearXNG integration.