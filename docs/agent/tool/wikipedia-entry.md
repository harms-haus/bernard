# wikipedia_entry Tool

The `wikipedia_entry` tool enables voice assistant agents to retrieve text content from specific Wikipedia articles with precise token-based pagination and length control.

## Overview

This tool provides a unified interface for accessing Wikipedia article content through the MediaWiki API. It retrieves full article text with intelligent token-based slicing for precise content limits and pagination support.

### Surface API

```typescript
wikipedia_entry(page_identifier: string, token_offset?: number, max_tokens?: number): Promise<string>
```

**Parameters:**
- `page_identifier`: Wikipedia page title or page ID (required)
- `token_offset`: Token offset for content slicing (optional, default: 0)
- `max_tokens`: Maximum tokens to return (optional, default: 1500, max: 10000)

**Returns:** JSON string containing article content with metadata

## Architecture

### Component Flow

```
Voice Assistant Agent
        ↓
    [Tool: wikipedia_entry]
        ↓
    Wikipedia MediaWiki API
        ↓
    Article Content Retrieval
        ↓
    Token-based Content Slicing
        ↓
    Structured Content Result
        (n_tokens, content, n_next_tokens)
```

### Execution Model

The tool performs content retrieval operations using the Wikipedia API:

1. **Page Resolution**: Resolves page identifier to MediaWiki page object
2. **Content Retrieval**: Fetches full article text with redirect handling
3. **Token Analysis**: Counts total tokens in full article content
4. **Content Slicing**: Applies token-based offset and length limits
5. **Result Structuring**: Returns content with pagination metadata

## Content Results

### Result Structure

Each content result contains:

```typescript
{
  n_tokens: number;        // Number of tokens in returned content
  content: string;         // Article text content (token-sliced)
  n_next_tokens: number;   // Remaining tokens after current slice
}
```

### Content Processing

- **Token Counting**: Uses precise tokenization for accurate limits
- **Unicode Support**: Handles all Unicode characters correctly
- **Redirect Handling**: Automatically follows Wikipedia redirects
- **Content Preservation**: Maintains article structure and formatting

## Usage Examples

### Basic Article Retrieval

```typescript
// Get first 1500 tokens of TypeScript article
wikipedia_entry("TypeScript")
// Returns: {"n_tokens": 1500, "content": "TypeScript is a programming language...", "n_next_tokens": 2847}
```

### Paginated Content Access

```typescript
// Get tokens 1000-2500 of Artificial Intelligence article
wikipedia_entry("Artificial Intelligence", 1000, 1500)
// Returns: {"n_tokens": 1500, "content": "...continued content...", "n_next_tokens": 1347}
```

### Large Content Retrieval

```typescript
// Get up to 5000 tokens starting from token 2000
wikipedia_entry("World War II", 2000, 5000)
// Returns: {"n_tokens": 5000, "content": "...article content...", "n_next_tokens": 0}
```

## Error Handling

The tool provides structured error responses:

### Page Not Found

```
Wikipedia page retrieval failed: No article found for identifier "NonExistentArticle123"
```

### API Errors

```
Wikipedia page retrieval failed: MediaWiki API error: 404 Not Found
```

### Network Issues

```
Wikipedia page retrieval failed: Request timeout after 30 seconds
```

### Invalid Parameters

```
Wikipedia page retrieval failed: Invalid page identifier
```

## Technical Details

### Dependencies

- **Wikipedia API**: MediaWiki page content API for article retrieval
- **wikipedia package**: Node.js client library for Wikipedia API access
- **Token Counter**: Custom tokenization utilities for precise content limits
- **User-Agent Headers**: Custom headers for API compliance

### Content Processing

- **Tokenization**: Uses consistent encoding for token counting and slicing
- **Pagination Logic**: Intelligent offset handling for backward compatibility
- **Content Integrity**: Preserves article structure and formatting
- **Encoding Handling**: Supports Unicode and special characters

### Performance Considerations

- **Memory Usage**: Loads full article content before slicing
- **Token Limits**: Maximum 10,000 tokens per request to prevent abuse
- **API Limits**: Subject to Wikipedia API rate limits and bot policies
- **Caching**: No client-side content caching implemented

### Token-based Pagination

- **Offset Behavior**: If offset exceeds content length, returns final tokens
- **Limit Enforcement**: Strictly enforces maximum token limits
- **Metadata**: Provides remaining token count for pagination decisions
- **Precision**: Uses exact token boundaries for content slicing

## Future Enhancements

### Planned Capabilities

- Content section extraction and navigation
- Multiple article batch retrieval
- Content summarization and key point extraction
- Image and media metadata inclusion
- Cross-reference link extraction
- Content change detection and updates
- Multi-language article support

### Performance Improvements

- Content streaming for large articles
- Client-side result caching
- Compressed content transfer
- Parallel content retrieval for multiple pages
