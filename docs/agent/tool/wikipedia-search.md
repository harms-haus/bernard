# wikipedia_search Tool

The `wikipedia_search` tool enables voice assistant agents to search Wikipedia for articles by title or topic, returning structured search results with page metadata.

## Overview

This tool provides a unified interface for discovering Wikipedia articles through the MediaWiki API. It searches article titles and content snippets, returning structured results that can be used to identify relevant pages for further reading.

### Surface API

```typescript
wikipedia_search(query: string, n_results?: number, starting_index?: number): Promise<string>
```

**Parameters:**
- `query`: Search term for finding Wikipedia articles (required)
- `n_results`: Number of results to return (optional, default: 10, max: 50)
- `starting_index`: Starting index for pagination (optional, default: 0)

**Returns:** JSON string containing an array of search result objects

## Architecture

### Component Flow

```
Voice Assistant Agent
        ↓
    [Tool: wikipedia_search]
        ↓
    Wikipedia MediaWiki API
        ↓
    Structured Search Results
        (page_id, title, description, index)
```

### Execution Model

The tool performs search operations using the Wikipedia API:

1. **Query Processing**: Accepts search terms for article discovery
2. **API Search**: Uses MediaWiki search API with result limits and pagination
3. **Result Structuring**: Formats results as JSON with standardized fields
4. **Index Calculation**: Applies pagination offsets to result indices

## Search Results

### Result Structure

Each search result contains:

```typescript
{
  page_id: number;        // Wikipedia page identifier
  page_title: string;     // Article title
  description: string;    // Content snippet/description
  index: number;          // Result position (1-based, respects pagination)
}
```

### Search Behavior

- **Source**: MediaWiki search API via `wikipedia` npm package
- **Scope**: Searches article titles and content snippets
- **Limit**: Returns up to 50 results per request (API constraint)
- **Pagination**: Supports offset-based result pagination
- **Language**: Searches English Wikipedia by default

## Usage Examples

### Basic Search

```typescript
// Search for articles about TypeScript
wikipedia_search("TypeScript", 5)
// Returns: [{"page_id": 31089, "page_title": "TypeScript", "description": "TypeScript is a programming language developed and maintained by Microsoft...", "index": 1}, ...]
```

### Paginated Search

```typescript
// Get results 11-20 for "artificial intelligence"
wikipedia_search("artificial intelligence", 10, 10)
// Returns results with indices 11-20
```

## Error Handling

The tool provides structured error responses:

### API Errors

```
Wikipedia search failed: [error message from MediaWiki API]
```

### Network Issues

```
Wikipedia search failed: Request failed with status code 429
```

### Invalid Parameters

```
Wikipedia search failed: Invalid search query
```

## Technical Details

### Dependencies

- **Wikipedia API**: MediaWiki search API for article discovery
- **wikipedia package**: Node.js client library for Wikipedia API access
- **User-Agent Headers**: Custom headers for API compliance and rate limiting

### API Compliance

- **User-Agent**: Includes required `Api-User-Agent` and `User-Agent` headers
- **Rate Limiting**: Respects Wikipedia API rate limits and bot policies
- **Bot Policy**: Follows Wikipedia's bot usage guidelines

### Result Processing

- **Filtering**: Returns all search results without content filtering
- **Encoding**: Handles Unicode characters in article titles and descriptions
- **Deduplication**: Relies on Wikipedia API's natural result ordering

### Performance Considerations

- **Caching**: No client-side caching implemented
- **Limits**: Maximum 50 results per request to prevent API abuse
- **Timeouts**: Subject to network and API response times

## Future Enhancements

### Planned Capabilities

- Multi-language Wikipedia search support
- Result relevance scoring and sorting
- Category-based search filtering
- Geographic search biasing
- Image and multimedia result inclusion
- Cross-wiki search (Wikimedia projects)

### Integration Improvements

- Result caching for repeated queries
- Batch search operations
- Search suggestion/autocomplete support
- Result preview and summary generation
