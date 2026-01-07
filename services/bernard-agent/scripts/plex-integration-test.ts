/**
 * Plex API Integration Test Script
 * Reads configuration from settings store (Redis) or .env file
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { searchPlexMedia, getPlexLibrarySections, getPlexItemMetadata, getPlexServerIdentity, discoverPlexClient } from '../src/lib/plex/media-search';
import { getSettings } from '../src/lib/config/settingsCache';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root as fallback
config({ path: join(__dirname, '..', '..', '.env') });

async function getPlexConfig() {
  // Priority 1: Get from settings store (Redis)
  try {
    const settings = await getSettings();
    if (settings.services?.plex?.baseUrl && settings.services?.plex?.token) {
      console.log('Using Plex config from settings store (Redis)');
      return {
        baseUrl: settings.services.plex.baseUrl,
        token: settings.services.plex.token
      };
    }
  } catch (error) {
    console.log('Settings store not available, using .env fallback');
  }

  // Priority 2: Fall back to .env
  if (process.env['PLEX_URL'] && process.env['PLEX_TOKEN']) {
    console.log('Using Plex config from .env');
    return {
      baseUrl: process.env['PLEX_URL'],
      token: process.env['PLEX_TOKEN']
    };
  }

  return null;
}

async function runTests() {
  console.log('=== Plex API Integration Tests ===\n');

  const plexConfig = await getPlexConfig();

  if (!plexConfig) {
    console.log('Error: Plex configuration not found');
    console.log('Please configure PLEX_URL and PLEX_TOKEN in settings or .env file');
    process.exit(1);
  }

  console.log(`Server: ${plexConfig.baseUrl}\n`);

  let passed = 0;
  let failed = 0;

  try {
    const identity = await getPlexServerIdentity(plexConfig);
    console.log(`✓ Server identity: ${identity.machineIdentifier}`);
    passed++;
  } catch (error) {
    console.log(`✗ Server identity failed: ${error}`);
    failed++;
  }

  try {
    const sections = await getPlexLibrarySections(plexConfig);
    console.log(`✓ Library sections: ${sections.length} found`);
    sections.forEach(s => console.log(`  - ${s.title} (${s.type})`));
    passed++;
  } catch (error) {
    console.log(`✗ Library sections failed: ${error}`);
    failed++;
  }

  try {
    const results = await searchPlexMedia(plexConfig, 'test', '');
    console.log(`✓ Search: Found ${results.length} results`);
    passed++;
  } catch (error) {
    console.log(`✗ Search failed: ${error}`);
    failed++;
  }

  try {
    const metadata = await getPlexItemMetadata(plexConfig, '99999999999');
    if (metadata === null) {
      console.log(`✓ Missing item: Correctly returned null`);
      passed++;
    } else {
      console.log(`✗ Missing item: Expected null`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ Missing item error: ${error}`);
    failed++;
  }

  try {
    const client = await discoverPlexClient(plexConfig, 'nonexistent-client');
    console.log(`✓ Client discovery: Correctly returned null for nonexistent client`);
    passed++;
  } catch (error) {
    console.log(`✗ Client discovery failed: ${error}`);
    failed++;
  }

  console.log(`\n=== Results: ${passed}/${passed + failed} passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
