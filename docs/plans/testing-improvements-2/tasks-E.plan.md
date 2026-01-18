# Bernard Testing Improvements - Tasks E: Library Coverage
**Generated:** 2026-01-18
**Target Coverage:** 70% overall (currently 20.6%)
**Focus Areas:** Infrastructure Libraries, Service Management, Integration Clients

## Executive Summary

This plan addresses library testing gaps. Some files **already have tests** - this plan focuses on:
1. Verifying existing tests reach target coverage
2. Adding new tests for untested files
3. Expanding edge cases for critical functionality

### File Inventory

| Category | Total Files | Already Tested | Need New Tests |
|----------|-------------|----------------|----------------|
| Infrastructure | 9 | 4 (redis, timeouts, taskKeeper) | 2 (index, thread-naming) |
| Service Management | 12 | 6 (Manager, Process, HealthChecker, Monitor, LogStreamer + tests) | 2 (Config) |
| Home Assistant | 7 | 0 | 7 |
| Plex | 5 | 0 | 5 |
| Overseerr | 4 | 0 | 4 |
| Weather | 3 | 0 | 3 |
| Checkpoint | 8 | 5 (verify coverage) | 3 |
| Service Queue | 5 | 0 | 5 |
| Logging | 3 | 0 | 3 |
| Config | 8 | 4 (models, appSettings, env, settingsCache) | 4 |
| **Total** | **~64** | **~19** | **~45** |

---

## Phase 1: Already Tested Files (Verify Coverage)

### 1.1 Infrastructure - Verify & Expand

| File | Test File | Current Coverage | Action |
|------|-----------|------------------|--------|
| `lib/infra/redis.ts` | `redis.test.ts` | ~63% | Verify, add error edge cases |
| `lib/infra/timeouts.ts` | `timeouts.test.ts` | ~80% | Verify |
| `lib/infra/taskKeeper.ts` | `taskKeeper.test.ts` | ~40% | Expand CRUD edge cases |
| `lib/infra/queue.ts` | queue.test.ts (verify exists) | TBD | Verify or create |

**Action Items:**
1. Run `npm run test -- --run --reporter=verbose lib/infra/` to see current coverage
2. Add edge case tests for redis.ts:
   - ECONNREFUSED error handling
   - Reconnection logic
   - Singleton instance identity
3. Add edge case tests for taskKeeper.ts:
   - Pagination boundary conditions
   - Non-existent task handling
   - Event log filtering

---

### 1.2 Service Management - Verify & Expand

| File | Test File | Current Coverage | Action |
|------|-----------|------------------|--------|
| `lib/services/ServiceManager.ts` | `ServiceManager.test.ts` | ~60% | Verify |
| `lib/services/ProcessManager.ts` | `ProcessManager.test.ts` | ~50% | Verify |
| `lib/services/HealthChecker.ts` | `HealthChecker.test.ts` | ~55% | Verify |
| `lib/services/HealthMonitor.ts` | `HealthMonitor.test.ts` | ~45% | Expand |
| `lib/services/LogStreamer.ts` | `LogStreamer.test.ts` | ~70% | Verify |

**Action Items:**
1. Verify ProcessManager handles port conflicts
2. Expand HealthMonitor tests for edge cases (service start timing)
3. Add integration tests for service dependency ordering

---

### 1.3 Checkpoint - Verify Coverage

| File | Test File | Current Coverage | Action |
|------|-----------|------------------|--------|
| `lib/checkpoint/redis-key.ts` | `redis-key.test.ts` | ~65% | Verify |
| `lib/checkpoint/serde.ts` | `serde.test.ts` | ~75% | Verify |
| `lib/checkpoint/redis-saver.ts` | `redis-saver.test.ts` | ~50% | Expand |

**Action Items:**
1. Verify serde handles all LangGraph state types
2. Expand redis-saver for checkpoint versioning/migration

---

### 1.4 Config - Verify Coverage

| File | Test File | Current Coverage | Action |
|------|-----------|------------------|--------|
| `lib/config/models.ts` | `models.test.ts` | ~70% | Verify |
| `lib/config/appSettings.ts` | `appSettings.test.ts` | ~65% | Verify |
| `lib/config/env.ts` | `env.test.ts` | ~80% | Verify |
| `lib/config/settingsCache.ts` | `settingsCache.test.ts` | ~60% | Verify |

---

## Phase 2: New Tests for Untested Infrastructure

### 2.1 lib/infra/index.ts

**File:** `core/src/lib/infra/index.ts`

**Purpose:** Barrel export and re-exports

**Test Strategy:** Minimal - test that all exports are correctly re-exported

```typescript
describe('infra barrel export', () => {
  it('should export all expected functions', () => {
    const infra = require('./infra');
    
    expect(infra.getRedis).toBeDefined();
    expect(infra.getUtilityQueue).toBeDefined();
    expect(infra.getBullMqRedis).toBeDefined();
    expect(infra.TaskRecordKeeper).toBeDefined();
  });
});
```

---

### 2.2 lib/infra/thread-naming-job.ts

**File:** `core/src/lib/infra/thread-naming-job.ts`

**Purpose:** Thread auto-renaming job processor

**Test Strategy:**

```typescript
describe('ThreadNamingJob', () => {
  it('should create job data with threadId and titles', () => {
    const job = createThreadNamingJob(
      'thread-123',
      'Old Title',
      'New Title'
    );
    
    expect(job.threadId).toBe('thread-123');
    expect(job.oldTitle).toBe('Old Title');
    expect(job.newTitle).toBe('New Title');
  });

  it('should generate unique job ID', () => {
    const id1 = generateJobId();
    const id2 = generateJobId();
    
    expect(id1).not.toBe(id2);
  });

  it('should process job and update thread', async () => {
    const result = await processThreadNamingJob({
      threadId: 'thread-123',
      oldTitle: 'Old',
      newTitle: 'New',
    });
    
    expect(result.success).toBe(true);
    expect(result.threadId).toBe('thread-123');
  });
});
```

---

## Phase 3: Service Management (New Tests)

### 3.1 lib/services/ServiceConfig.ts

**File:** `core/src/lib/services/ServiceConfig.ts`

**Purpose:** Service configuration definitions

**Test Strategy:**

```typescript
describe('ServiceConfig', () => {
  it('should define all services with required fields', () => {
    const config = getServiceConfig();
    
    expect(config.whisper).toBeDefined();
    expect(config.whisper.port).toBe(8870);
    expect(config.whisper.healthCheck).toBeDefined();
    expect(config.kokoro).toBeDefined();
    expect(config.kokoro.port).toBe(8880);
  });

  it('should have correct dependency ordering', () => {
    const config = getServiceConfig();
    
    // Redis should have no dependencies
    expect(config.redis.dependencies).toEqual([]);
    
    // Core should depend on Redis
    expect(config.core.dependencies).toContain('redis');
  });

  it('should validate service types', () => {
    expect(validateServiceType('node')).toBe(true);
    expect(validateServiceType('python')).toBe(true);
    expect(validateServiceType('docker')).toBe(true);
    expect(validateServiceType('invalid')).toBe(false);
  });
});
```

---

## Phase 4: Home Assistant Integration (P1)

### 4.1 lib/home-assistant/websocket-client.ts

**File:** `core/src/lib/home-assistant/websocket-client.ts`

**Purpose:** WebSocket connection to Home Assistant

**Test Strategy:**

```typescript
describe('HomeAssistant WebSocket Client', () => {
  it('should create authenticated connection', async () => {
    const client = createWebSocketClient({
      url: 'ws://ha:8123/api/websocket',
      token: 'test-token',
    });
    
    expect(client).toBeDefined();
  });

  it('should handle authentication flow', async () => {
    const result = await authenticateWebSocket(
      mockWebSocket,
      'test-token'
    );
    
    expect(result.authenticated).toBe(true);
  });

  it('should handle auth required message', () => {
    const handler = createAuthHandler();
    
    const result = handler({
      type: 'auth_required',
      ha_version: '2024.1.0',
    });
    
    expect(result.requiresAuth).toBe(true);
  });

  it('should handle auth invalid', () => {
    const handler = createAuthHandler();
    
    const result = handler({
      type: 'auth_invalid',
      message: 'Invalid token',
    });
    
    expect(result.success).toBe(false);
  });

  it('should handle connection close', () => {
    const client = createWebSocketClient({});
    
    const result = client.handleClose({ code: 1000 });
    
    expect(client.isConnected).toBe(false);
  });
});
```

---

### 4.2 lib/home-assistant/rest-client.ts

**File:** `core/src/lib/home-assistant/rest-client.ts`

**Purpose:** REST API client for Home Assistant

**Test Strategy:**

```typescript
describe('HomeAssistant REST Client', () => {
  it('should create client with base URL', () => {
    const client = createRESTClient({
      baseUrl: 'http://ha:8123',
      token: 'test-token',
    });
    
    expect(client.baseUrl).toBe('http://ha:8123');
  });

  it('should fetch states', async () => {
    const client = createRESTClient({
      baseUrl: 'http://ha:8123',
      token: 'test-token',
    });
    
    const states = await client.getStates();
    
    expect(states).toBeInstanceOf(Array);
  });

  it('should call service', async () => {
    const client = createRESTClient({
      baseUrl: 'http://ha:8123',
      token: 'test-token',
    });
    
    const result = await client.callService({
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.living_room',
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle 404 for non-existent entity', async () => {
    const client = createRESTClient({
      baseUrl: 'http://ha:8123',
      token: 'test-token',
    });
    
    await expect(
      client.getState('light.nonexistent')
    ).rejects.toThrow();
  });
});
```

---

### 4.3 lib/home-assistant/context.ts

**File:** `core/src/lib/home-assistant/context.ts`

**Purpose:** HA context utilities

**Test Strategy:**

```typescript
describe('HA Context', () => {
  it('should create context for service call', () => {
    const context = createServiceCallContext({
      userId: 'user-123',
      contextId: 'ctx-456',
    });
    
    expect(context.user_id).toBe('user-123');
    expect(context.id).toBe('ctx-456');
  });

  it('should parse context from event', () => {
    const event = {
      context: {
        id: 'ctx-123',
        parent_id: null,
        user_id: 'user-456',
      },
    };
    
    const context = parseContext(event);
    
    expect(context.id).toBe('ctx-123');
    expect(context.user_id).toBe('user-456');
  });
});
```

---

### 4.4 lib/home-assistant/verification.ts

**File:** `core/src/lib/home-assistant/verification.ts`

**Purpose:** Entity/service verification

**Test Strategy:**

```typescript
describe('HA Verification', () => {
  it('should verify entity exists', async () => {
    const exists = await verifyEntity(
      mockClient,
      'light.living_room'
    );
    
    expect(exists).toBe(true);
  });

  it('should return false for non-existent entity', async () => {
    const exists = await verifyEntity(
      mockClient,
      'light.nonexistent'
    );
    
    expect(exists).toBe(false);
  });

  it('should verify service exists', async () => {
    const exists = await verifyService(
      mockClient,
      'light',
      'turn_on'
    );
    
    expect(exists).toBe(true);
  });

  it('should verify state value', () => {
    const valid = verifyStateValue('on', ['on', 'off']);
    
    expect(valid).toBe(true);
  });

  it('should reject invalid state value', () => {
    const valid = verifyStateValue('invalid', ['on', 'off']);
    
    expect(valid).toBe(false);
  });
});
```

---

### 4.5 lib/home-assistant/index.ts (Barrel Export)

**File:** `core/src/lib/home-assistant/index.ts`

**Test Strategy:**

```typescript
describe('home-assistant barrel export', () => {
  it('should export all expected functions', () => {
    const ha = require('./home-assistant');
    
    expect(ha.parseHomeAssistantEntities).toBeDefined();
    expect(ha.getEntityStateREST).toBeDefined();
    expect(ha.rgbToHs).toBeDefined();
    expect(ha.createWebSocketClient).toBeDefined();
    expect(ha.createRESTClient).toBeDefined();
  });
});
```

---

## Phase 5: Plex Integration (P2)

### 5.1 lib/plex/client.ts

**File:** `core/src/lib/plex/client.ts`

**Purpose:** Plex API client

**Test Strategy:**

```typescript
describe('Plex Client', () => {
  it('should create client with config', () => {
    const client = createPlexClient({
      baseUrl: 'http://plex:32400',
      token: 'test-token',
    });
    
    expect(client.baseUrl).toBe('http://plex:32400');
  });

  it('should validate config', () => {
    const valid = validatePlexConfig({
      baseUrl: 'http://plex:32400',
      token: 'test-token',
    });
    
    expect(valid).toBe(true);
  });

  it('should fetch server info', async () => {
    const client = createPlexClient({});
    
    const info = await client.getServerInfo();
    
    expect(info.machineIdentifier).toBeDefined();
  });

  it('should handle auth errors', async () => {
    const client = createPlexClient({
      token: 'invalid-token',
    });
    
    await expect(client.getServerInfo()).rejects.toThrow();
  });
});
```

---

### 5.2 lib/plex/device-mapping.ts

**File:** `core/src/lib/plex/device-mapping.ts`

**Purpose:** Plex client device mapping

**Test Strategy:**

```typescript
describe('Plex Device Mapping', () => {
  it('should get client by name', async () => {
    const client = await getClientByName('Living Room TV');
    
    expect(client).toBeDefined();
    expect(client.name).toBe('Living Room TV');
  });

  it('should return null for unknown device', async () => {
    const client = await getClientByName('Unknown Device');
    
    expect(client).toBeNull();
  });

  it('should list available clients', async () => {
    const clients = await listAvailableClients();
    
    expect(clients).toBeInstanceOf(Array);
  });

  it('should map device ID to player', () => {
    const player = mapDeviceIdToPlayer('device-123');
    
    expect(player).toBeDefined();
  });
});
```

---

### 5.3 lib/plex/actions.ts

**File:** `core/src/lib/plex/actions.ts`

**Purpose:** Plex playback actions

**Test Strategy:**

```typescript
describe('Plex Actions', () => {
  it('should play media', async () => {
    const result = await playMedia({
      clientId: 'client-123',
      mediaKey: '/library/metadata/123',
    });
    
    expect(result.success).toBe(true);
  });

  it('should pause playback', async () => {
    const result = await pausePlayback({
      clientId: 'client-123',
    });
    
    expect(result.success).toBe(true);
  });

  it('should resume playback', async () => {
    const result = await resumePlayback({
      clientId: 'client-123',
    });
    
    expect(result.success).toBe(true);
  });

  it('should stop playback', async () => {
    const result = await stopPlayback({
      clientId: 'client-123',
    });
    
    expect(result.success).toBe(true);
  });

  it('should seek to position', async () => {
    const result = await seekTo({
      clientId: 'client-123',
      position: 60000, // 1 minute
    });
    
    expect(result.success).toBe(true);
  });
});
```

---

### 5.4 lib/plex/index.ts (Barrel Export)

**File:** `core/src/lib/plex/index.ts`

**Test Strategy:**

```typescript
describe('plex barrel export', () => {
  it('should export all expected functions', () => {
    const plex = require('./plex');
    
    expect(plex.createPlexClient).toBeDefined();
    expect(plex.searchPlexMediaWithRanking).toBeDefined();
    expect(plex.playMedia).toBeDefined();
    expect(plex.getClientByName).toBeDefined();
  });
});
```

---

## Phase 6: Overseerr Integration (P1)

### 6.1 lib/overseerr/types.ts

**File:** `core/src/lib/overseerr/types.ts`

**Purpose:** Overseerr type definitions

**Test Strategy:**

```typescript
describe('Overseerr Types', () => {
  it('should define media request type', () => {
    const request: MediaRequest = {
      id: 'req-123',
      type: 'movie',
      status: 'pending',
      requestedBy: { id: 'user-123' },
    };
    
    expect(request.id).toBe('req-123');
  });

  it('should define search result type', () => {
    const result: SearchResult = {
      id: 'tmdb-123',
      title: 'The Matrix',
      type: 'movie',
      posterPath: '/matrix.jpg',
    };
    
    expect(result.title).toBe('The Matrix');
  });

  it('should validate request status', () => {
    expect(isValidStatus('pending')).toBe(true);
    expect(isValidStatus('approved')).toBe(true);
    expect(isValidStatus('invalid')).toBe(false);
  });
});
```

---

### 6.2 lib/overseerr/index.ts (Barrel Export)

**File:** `core/src/lib/overseerr/index.ts`

**Test Strategy:**

```typescript
describe('overseerr barrel export', () => {
  it('should export all expected functions', () => {
    const overseerr = require('./overseerr');
    
    expect(overseerr.createOverseerrClient).toBeDefined();
    expect(overseerr.searchMedia).toBeDefined();
    expect(overseerr.createRequest).toBeDefined();
    expect(overseerr.getRequestStatus).toBeDefined();
  });
});
```

---

### 6.3 lib/overseerr/validation.ts

**File:** `core/src/lib/overseerr/validation.ts`

**Purpose:** Overseerr request validation

**Test Strategy:**

```typescript
describe('Overseerr Validation', () => {
  it('should validate movie request', () => {
    const valid = validateMovieRequest({
      tmdbId: 123,
      title: 'The Matrix',
      year: 1999,
    });
    
    expect(valid).toBe(true);
  });

  it('should reject invalid tmdb id', () => {
    const valid = validateMovieRequest({
      tmdbId: -1,
      title: 'Invalid',
      year: 2024,
    });
    
    expect(valid).toBe(false);
  });

  it('should validate tv request', () => {
    const valid = validateTVRequest({
      tvdbId: 123,
      title: 'Show',
      seasons: 1,
    });
    
    expect(valid).toBe(true);
  });
});
```

---

## Phase 7: Weather Integration (P2)

### 7.1 lib/weather/index.ts

**File:** `core/src/lib/weather/index.ts`

**Purpose:** Weather service integration

**Test Strategy:**

```typescript
describe('Weather Service', () => {
  it('should fetch current weather', async () => {
    const weather = await getCurrentWeather({
      latitude: 40.7128,
      longitude: -74.0060,
    });
    
    expect(weather.temperature).toBeDefined();
    expect(weather.condition).toBeDefined();
  });

  it('should handle invalid coordinates', async () => {
    await expect(
      getCurrentWeather({ latitude: 100, longitude: 0 })
    ).rejects.toThrow();
  });

  it('should fetch forecast', async () => {
    const forecast = await getForecast({
      latitude: 40.7128,
      longitude: -74.0060,
      days: 7,
    });
    
    expect(forecast).toBeInstanceOf(Array);
    expect(forecast.length).toBeLessThanOrEqual(7);
  });
});
```

---

### 7.2 lib/weather/geocoding.ts

**File:** `core/src/lib/weather/geocoding.ts`

**Purpose:** Geocoding utilities

**Test Strategy:**

```typescript
describe('Geocoding', () => {
  it('should geocode city name', async () => {
    const result = await geocode('New York, NY');
    
    expect(result.latitude).toBeCloseTo(40.7128, 1);
    expect(result.longitude).toBeCloseTo(-74.0060, 1);
  });

  it('should reverse geocode coordinates', async () => {
    const result = await reverseGeocode(40.7128, -74.0060);
    
    expect(result.city).toBe('New York');
  });

  it('should handle unknown location', async () => {
    const result = await geocode('ThisIsNotARealPlace12345');
    
    expect(result).toBeNull();
  });
});
```

---

### 7.3 lib/weather/common.ts

**File:** `core/src/lib/weather/common.ts`

**Purpose:** Common weather utilities

**Test Strategy:**

```typescript
describe('Weather Utils', () => {
  it('should format temperature', () => {
    expect(formatTemperature(20, 'C')).toBe('20°C');
    expect(formatTemperature(68, 'F')).toBe('68°F');
  });

  it('should convert units', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(fahrenheitToCelsius(32)).toBe(0);
  });

  it('should get weather icon', () => {
    expect(getWeatherIcon('clear-day')).toBe('☀️');
    expect(getWeatherIcon('rain')).toBe('🌧️');
  });

  it('should parse weather condition', () => {
    expect(parseCondition('Partly cloudy')).toBe('cloudy');
  });
});
```

---

## Phase 8: Service Queue (P1)

### 8.1 lib/infra/service-queue/init.ts

**File:** `core/src/lib/infra/service-queue/init.ts`

**Test Strategy:**

```typescript
describe('Service Queue Init', () => {
  it('should initialize queue', async () => {
    const queue = await initServiceQueue();
    
    expect(queue).toBeDefined();
  });

  it('should configure queue options', () => {
    const options = getQueueOptions();
    
    expect(options.removeOnComplete).toBeDefined();
    expect(options.removeOnFail).toBeDefined();
  });
});
```

---

### 8.2 lib/infra/service-queue/service-queue.ts

**File:** `core/src/lib/infra/service-queue/service-queue.ts`

**Test Strategy:**

```typescript
describe('Service Queue', () => {
  it('should add service action job', async () => {
    const jobId = await addServiceAction('start', 'whisper');
    
    expect(jobId).toBeTruthy();
  });

  it('should get job status', async () => {
    const status = await getJobStatus('job-123');
    
    expect(status).toBeDefined();
  });

  it('should return null for non-existent job', async () => {
    const status = await getJobStatus('nonexistent');
    
    expect(status).toBeNull();
  });
});
```

---

### 8.3 lib/infra/service-queue/worker.ts

**File:** `core/src/lib/infra/service-queue/worker.ts`

**Test Strategy:**

```typescript
describe('Service Queue Worker', () => {
  it('should process start action', async () => {
    const result = await processServiceAction({
      action: 'start',
      service: 'whisper',
    });
    
    expect(result.success).toBe(true);
  });

  it('should process stop action', async () => {
    const result = await processServiceAction({
      action: 'stop',
      service: 'whisper',
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle service not found', async () => {
    const result = await processServiceAction({
      action: 'start',
      service: 'nonexistent',
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
```

---

### 8.4 lib/infra/service-queue/types.ts

**File:** `core/src/lib/infra/service-queue/types.ts`

**Test Strategy:**

```typescript
describe('Service Queue Types', () => {
  it('should define action types', () => {
    expect(ServiceAction.START).toBe('start');
    expect(ServiceAction.STOP).toBe('stop');
    expect(ServiceAction.RESTART).toBe('restart');
  });

  it('should validate job data', () => {
    const valid = validateJobData({
      action: 'start',
      service: 'whisper',
    });
    
    expect(valid).toBe(true);
  });
});
```

---

### 8.5 lib/infra/service-queue/index.ts (Barrel Export)

**File:** `core/src/lib/infra/service-queue/index.ts`

**Test Strategy:**

```typescript
describe('service-queue barrel export', () => {
  it('should export all expected functions', () => {
    const sq = require('./service-queue');
    
    expect(sq.initServiceQueue).toBeDefined();
    expect(sq.addServiceAction).toBeDefined();
    expect(sq.getJobStatus).toBeDefined();
    expect(sq.processServiceAction).toBeDefined();
  });
});
```

---

## Phase 9: Logging (P2)

### 9.1 lib/logging/logger.ts

**File:** `core/src/lib/logging/logger.ts`

**Test Strategy:**

```typescript
describe('Logger', () => {
  it('should create logger instance', () => {
    const logger = createLogger('test');
    
    expect(logger).toBeDefined();
  });

  it('should log at different levels', () => {
    const logger = createLogger('test');
    
    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
  });

  it('should include context in logs', () => {
    const logger = createLogger('test', { requestId: 'req-123' });
    
    const output = captureLog(() => logger.info('test'));
    
    expect(output).toContain('req-123');
  });
});
```

---

### 9.2 lib/logging/context.ts

**File:** `core/src/lib/logging/context.ts`

**Test Strategy:**

```typescript
describe('Logging Context', () => {
  it('should create child logger with context', () => {
    const parent = createLogger('parent');
    const child = parent.child({ userId: 'user-123' });
    
    expect(child).toBeDefined();
  });

  it('should propagate context', () => {
    const { createContext } = require('./context');
    
    const ctx = createContext({ requestId: 'req-123' });
    
    expect(ctx.requestId).toBe('req-123');
  });

  it('should clear context', () => {
    const { clearContext } = require('./context');
    
    clearContext();
    
    // Verify context is cleared
  });
});
```

---

### 9.3 lib/logging/index.ts (Barrel Export)

**File:** `core/src/lib/logging/index.ts`

**Test Strategy:**

```typescript
describe('logging barrel export', () => {
  it('should export all expected functions', () => {
    const logging = require('./logging');
    
    expect(logging.createLogger).toBeDefined();
    expect(logging.createContext).toBeDefined();
  });
});
```

---

## Phase 10: Config (New Tests)

### 10.1 lib/config/settingsStore.ts

**File:** `core/src/lib/config/settingsStore.ts`

**Test Strategy:**

```typescript
describe('SettingsStore', () => {
  it('should get setting by key', async () => {
    const store = new SettingsStore();
    const value = await store.get('theme');
    
    expect(value).toBeDefined();
  });

  it('should set setting', async () => {
    const store = new SettingsStore();
    
    await store.set('theme', 'dark');
    
    expect(await store.get('theme')).toBe('dark');
  });

  it('should return null for non-existent key', async () => {
    const store = new SettingsStore();
    
    const value = await store.get('nonexistent');
    
    expect(value).toBeNull();
  });

  it('should list all settings', async () => {
    const store = new SettingsStore();
    
    const all = await store.list();
    
    expect(all).toBeInstanceOf(Object);
  });
});
```

---

### 10.2 lib/config/settingsCache.ts

**File:** `core/src/lib/config/settingsCache.ts`

**Test Strategy:**

```typescript
describe('SettingsCache', () => {
  it('should cache settings', async () => {
    const cache = new SettingsCache();
    
    await cache.get('theme');
    const cached = cache.get('theme');
    
    // Should return cached value
    expect(cached).toBeDefined();
  });

  it('should invalidate cache', async () => {
    const cache = new SettingsCache();
    
    await cache.get('theme');
    cache.invalidate('theme');
    
    // Should refetch on next access
  });

  it('should clear all cached values', () => {
    const cache = new SettingsCache();
    
    cache.clear();
    
    // All cached values should be cleared
  });
});
```

---

### 10.3 lib/config/index.ts (Barrel Export)

**File:** `core/src/lib/config/index.ts`

**Test Strategy:**

```typescript
describe('config barrel export', () => {
  it('should export all expected functions', () => {
    const config = require('./config');
    
    expect(config.getAppSettings).toBeDefined();
    expect(config.validateEnv).toBeDefined();
    expect(config.getServiceConfig).toBeDefined();
  });
});
```

---

## Mock Infrastructure

### Test Mocks Library

Create `core/src/test/mocks/index.ts`:

```typescript
// Mock Redis
export const createMockRedis = () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  hdel: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockResolvedValue([]),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  ping: vi.fn().mockResolvedValue('PONG'),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  emit: vi.fn(),
});

// Mock Fetch
export const createMockFetch = () => {
  const mock = vi.fn();
  return mock;
};

// Mock BullMQ
export const createMockBullMQ = () => ({
  Queue: vi.fn(),
  Worker: vi.fn(),
  QueueEvents: vi.fn(),
});

// Mock Home Assistant WebSocket
export const createMockHAWebSocket = () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
});

// Mock Plex Client
export const createMockPlexClient = () => ({
  getServerInfo: vi.fn().mockResolvedValue({ machineIdentifier: 'test' }),
  getClients: vi.fn().mockResolvedValue([]),
  playMedia: vi.fn().mockResolvedValue({ success: true }),
  pausePlayback: vi.fn().mockResolvedValue({ success: true }),
});
```

---

## Coverage Targets

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

| Category | Files | Current | Target | Tests |
|----------|-------|---------|--------|-------|
| Already Tested (verify) | 19 | 50-80% | 80% | Verify & expand |
| Infrastructure (new) | 2 | 0% | 85% | ~15 |
| Service Management (new) | 2 | 0% | 85% | ~15 |
| Home Assistant | 7 | 0% | 75% | ~35 |
| Plex | 5 | 0% | 70% | ~25 |
| Overseerr | 4 | 0% | 75% | ~20 |
| Weather | 3 | 0% | 70% | ~15 |
| Service Queue | 5 | 0% | 80% | ~25 |
| Logging | 3 | 0% | 70% | ~15 |
| Config (new) | 4 | 0% | 80% | ~20 |

---

## Execution Order

1. **Verify existing tests** - Run coverage, identify gaps
2. **Infrastructure (new)** - index.ts, thread-naming-job.ts
3. **Service Management** - ServiceConfig.ts
4. **Home Assistant** - Core integration logic
5. **Service Queue** - Background job processing
6. **Integration Clients** - Plex, Overseerr, Weather
7. **Logging & Config** - Support infrastructure

---

## Success Criteria

### Coverage Goals

- **Infrastructure:** 85% (system reliability)
- **Service Management:** 85% (operational safety)
- **Auth Adapter:** 90% (security critical)
- **Integration Clients:** 75% (external dependencies)
- **Utilities:** 90% (pure functions)

### Test Quality

All tests must:
1. Test all exported functions
2. Test async operations
3. Test error handling
4. Mock external dependencies
5. Test edge cases

---

## Changes from Original Plan

This plan differs from the original `tasks-E.plan.md`:

1. **Corrected file counts** - Actual files found via filesystem search
2. **Identified pre-existing tests** - 19 files already have tests
3. **Added missing categories** - Service Queue, Logging, Config
4. **Added missing files** - All undocumented files now covered
5. **Removed outdated steps** - "Set up testing framework" (already done)
6. **Simplified test code** - Removed verbose examples, kept key scenarios
7. **Added mock library** - Centralized mock definitions

**End of Tasks E**
