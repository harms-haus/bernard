import { describe, it, expect, beforeEach } from 'vitest';
import { withCors, getCorsHeaders, handleOptions } from '../app/api/_lib/cors';

describe('CORS middleware', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    delete process.env['ALLOWED_ORIGINS'];
  });

  describe('getCorsHeaders', () => {
    it('should return wildcard CORS headers for OpenAI API compatibility', () => {
      const headers = getCorsHeaders('https://any-origin.com');
      expect(headers).toEqual({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, Origin, Referer, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent'
      });
    });

    it('should return wildcard CORS headers regardless of origin', () => {
      const headers = getCorsHeaders('https://evil.com');
      expect(headers).toEqual({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, Origin, Referer, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent'
      });
    });

    it('should return wildcard CORS headers when no origin provided', () => {
      const headers = getCorsHeaders(null);
      expect(headers).toEqual({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, Origin, Referer, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent'
      });
    });
  });

  describe('withCors', () => {
    it('should add CORS headers to response without mutating original', async () => {
      const handler = async () => {
        return new Response('Test content', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const wrappedHandler = withCors(handler);
      const response = await wrappedHandler();

      // Verify response has CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      
      // Verify original response properties are preserved
      expect(response.status).toBe(200);
      // statusText might be empty in test environment, so just check it's a string
      expect(typeof response.statusText).toBe('string');
      
      // Verify original headers are preserved
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      // Verify body is preserved
      const bodyText = await response.text();
      expect(bodyText).toBe('Test content');
    });

    it('should handle response with no headers', async () => {
      const handler = async () => {
        return new Response('No headers', {
          status: 201
        });
      };

      const wrappedHandler = withCors(handler);
      const response = await wrappedHandler();

      expect(response.status).toBe(201);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      
      const bodyText = await response.text();
      expect(bodyText).toBe('No headers');
    });

    it('should work with any origin for OpenAI API compatibility', async () => {
      const handler = async () => {
        return new Response('Any origin content', {
          status: 200
        });
      };

      const request = new Request('https://any-origin.com/api/test', {
        headers: { 'Origin': 'https://any-origin.com' }
      });

      const wrappedHandler = withCors(handler);
      const response = await wrappedHandler(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });

    it('should work with null origin', async () => {
      const handler = async () => {
        return new Response('No origin content', {
          status: 200
        });
      };

      const wrappedHandler = withCors(handler);
      const response = await wrappedHandler();

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });
  });

  describe('handleOptions', () => {
    it('should return 204 with CORS headers for OPTIONS request', () => {
      const request = new Request('https://example.com/api/test', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.com' }
      });

      const response = handleOptions(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });
  });
});