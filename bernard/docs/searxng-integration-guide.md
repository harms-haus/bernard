# SearXNG Integration Guide for Bernard AI Assistant

This comprehensive guide provides step-by-step instructions for integrating SearXNG as the web search provider in Bernard AI Assistant.

## Table of Contents

1. [Introduction to SearXNG](#introduction-to-searxng)
2. [Configuration Options](#configuration-options)
3. [Setup Instructions](#setup-instructions)
4. [Advanced Configuration](#advanced-configuration)
5. [Troubleshooting](#troubleshooting)
6. [API Reference](#api-reference)
7. [Migration from Brave Search](#migration-from-brave-search)

## Introduction to SearXNG

### What is SearXNG?

SearXNG is a free, open-source, privacy-focused metasearch engine that aggregates results from multiple search engines without tracking users. It's a self-hostable alternative to commercial search APIs.

### Key Benefits

- **Privacy-focused**: No user tracking or data collection
- **Self-hostable**: Full control over your search infrastructure
- **Multi-engine**: Aggregates results from Google, Bing, DuckDuckGo, and others
- **No API keys required**: Many instances work without authentication
- **Customizable**: Filter results, adjust ranking, and configure engines

### Comparison with Brave Search

| Feature | SearXNG | Brave Search |
|---------|---------|--------------|
| Privacy | ✅ Excellent | ✅ Good |
| Cost | ✅ Free (self-hosted) | ❌ Paid API |
| Setup | ⚠️ Requires instance | ✅ Simple API key |
| Results | ✅ Multi-engine aggregation | ✅ Single source |
| Rate limits | ✅ Configurable | ❌ API limits |

## Configuration Options

### Option 1: Use Public SearXNG Instance (Recommended for Testing)

```bash
# .env configuration
SEARXNG_API_URL=https://searxng.example.com/search
# SEARXNG_API_KEY=optional-if-required
```

### Option 2: Self-Hosted SearXNG Instance (Recommended for Production)

```bash
# .env configuration
SEARXNG_API_URL=https://your-searxng-instance.com/search
SEARXNG_API_KEY=your-api-key-if-configured
```

### Option 3: Fallback to Brave Search (Legacy)

```bash
# .env configuration (legacy)
SEARCH_API_KEY=your-brave-api-key
SEARCH_API_URL=https://api.search.brave.com/res/v1/web/search
```

## Setup Instructions

### Step 1: Choose a SearXNG Instance

#### Public Instances

You can use any public SearXNG instance. Some popular ones:
- `https://searx.be/search`
- `https://searxng.org/search`
- `https://search.privacytools.io/search`

#### Self-Hosted Instance

For production use, we recommend self-hosting:

```bash
# Docker setup example
docker run -d \
  -p 8080:8080 \
  -v searxng-data:/etc/searxng \
  -e "INSTANCE_NAME=Bernard Search" \
  searxng/searxng
```

### Step 2: Configure Environment Variables

Edit your `.env` file:

```bash
# Basic SearXNG configuration
SEARXNG_API_URL=https://your-searxng-instance.com/search

# Optional: If your instance requires API key
SEARXNG_API_KEY=your-api-key

# Optional: Additional settings
SEARXNG_USER_AGENT=bernard-assistant/1.0
SEARXNG_TIMEOUT_MS=5000
```

### Step 3: Verify Configuration

```bash
# Check if search is configured correctly
curl -s http://localhost:3000/api/status | jq '.services.search'

# Should return: {"configured": true, "provider": "searxng"}
```

### Step 4: Test Web Search

```bash
# Test via API
curl -N http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"bernard-v1",
    "messages":[{"role":"user","content":"What is the capital of France?"}],
    "stream": true
  }'
```

## Advanced Configuration

### Redis Settings Override

You can override SearXNG configuration via Redis settings:

```json
{
  "services": {
    "searxng": {
      "apiUrl": "https://your-custom-instance.com/search",
      "apiKey": "your-custom-key",
      "userAgent": "bernard-assistant/1.0",
      "timeoutMs": 8000
    }
  }
}
```

### Configuration Priority

1. **Environment variables** (highest priority)
2. **Redis settings** (fallback)
3. **Default values** (lowest priority)

### Multiple Instances with Load Balancing

```bash
# Use a load balancer in front of multiple SearXNG instances
SEARXNG_API_URL=https://load-balancer.example.com/search
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Search tool is not configured"

**Solution:**
- Verify `SEARXNG_API_URL` is set in `.env`
- Check for typos in the URL
- Ensure the URL is accessible from your server

#### Issue: "Search service unavailable"

**Solution:**
- Check if SearXNG instance is running
- Verify network connectivity
- Test the SearXNG endpoint directly:

```bash
curl -v "https://your-searxng-instance.com/search?q=test&format=json"
```

#### Issue: No results returned

**Solution:**
- Check SearXNG instance configuration
- Verify engines are enabled in SearXNG settings
- Test with a simple query first

#### Issue: Timeout errors

**Solution:**
- Increase timeout: `SEARXNG_TIMEOUT_MS=10000`
- Check SearXNG instance performance
- Consider using a faster instance

### Debugging Commands

```bash
# Check Bernard logs
journalctl -u bernard -f

# Test SearXNG directly
curl -v "https://your-searxng-instance.com/search?q=bernard&format=json&language=en-US"

# Check configuration resolution
node -e "console.log(require('./agent/harness/intent/tools/web-search.ts').verifySearchConfigured())"
```

## API Reference

### SearXNG API Endpoint

```
GET /search?q={query}&format=json&pageno=1&language=en-US&num={count}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | ✅ | Search query |
| `format` | string | ✅ | Response format (must be `json`) |
| `pageno` | number | ✅ | Page number (default: `1`) |
| `language` | string | ✅ | Language code (default: `en-US`) |
| `num` | number | ❌ | Number of results (max: `8`) |

### Response Format

```json
{
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com",
      "content": "Page description or snippet",
      "engine": "google",
      "score": 0.95
    }
  ],
  "query": "search query",
  "number_of_results": 10
}
```

### Bernard Integration

The web search tool in Bernard transforms SearXNG responses into a user-friendly format:

```
1. Page Title — https://example.com :: Page description or snippet
2. Another Result — https://example.org :: Another description
```

## Migration from Brave Search

### Step-by-Step Migration

1. **Set up SearXNG instance** (public or self-hosted)
2. **Update `.env` file**:
   ```bash
   # Comment out old Brave configuration
   # SEARCH_API_KEY=your-brave-key
   # SEARCH_API_URL=https://api.search.brave.com/res/v1/web/search
   
   # Add SearXNG configuration
   SEARXNG_API_URL=https://your-searxng-instance.com/search
   ```
3. **Test thoroughly** in staging environment
4. **Monitor performance** and result quality
5. **Gradual rollout** to production

### Configuration Mapping

| Brave Search | SearXNG Equivalent |
|--------------|-------------------|
| `SEARCH_API_KEY` | `SEARXNG_API_KEY` (optional) |
| `SEARCH_API_URL` | `SEARXNG_API_URL` |
| Brave API format | SearXNG JSON format |

### Fallback Behavior

Bernard automatically falls back to Brave Search if:
1. `SEARXNG_API_URL` is not configured
2. SearXNG instance is unavailable
3. SearXNG returns invalid responses

## Best Practices

### Performance Optimization

- **Use nearby instances**: Choose SearXNG instances geographically close to your server
- **Configure timeouts**: Set `SEARXNG_TIMEOUT_MS` based on your latency requirements
- **Limit result count**: Use the `count` parameter to control response size

### Security Considerations

- **Use HTTPS**: Always use HTTPS for SearXNG API URLs
- **Validate instances**: Use trusted SearXNG instances
- **Monitor usage**: Track search requests and response times

### Monitoring and Maintenance

- **Log analysis**: Monitor Bernard logs for search-related errors
- **Performance metrics**: Track SearXNG response times
- **Result quality**: Periodically verify search result relevance

## Additional Resources

- [SearXNG Official Documentation](https://docs.searxng.org/)
- [Public SearXNG Instances](https://searx.space/)
- [Bernard API Documentation](https://github.com/your-repo/bernard/docs/api.md)

## Support

For issues with SearXNG integration:

1. Check Bernard logs for error details
2. Verify SearXNG instance status
3. Test SearXNG API directly
4. Consult the [troubleshooting section](#troubleshooting)
5. Open an issue with detailed error information

This guide provides comprehensive coverage of SearXNG integration with Bernard AI Assistant, from basic setup to advanced configuration and troubleshooting.