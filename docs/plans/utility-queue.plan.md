# Utility Queue Implementation Plan

## 📋 Overview

Implement a **BullMQ-based background job queue** for all utility-type operations in Bernard, starting with automatic thread naming. The utility queue will handle lightweight, non-blocking tasks that shouldn't impact the main conversation flow.

---

## 🎯 Objectives

1. **Non-blocking execution**: All utility tasks run in background, zero impact on main chat
2. **Unified queue**: Single "utility" queue for all utility-type operations (naming, metadata, future tasks)
3. **Resilience**: Automatic retries, exponential backoff, job persistence
4. **Monitoring**: Track job status, failures, and performance
5. **Scalability**: Configurable concurrency for parallel job processing

---

## 🏗️ Architecture

### Queue Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Bernard Utility Queue                  │
│                  (BullMQ + Redis)                    │
└─────────────────────────────────────────────────────────────┘
                         ↓
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
    ┌─────────────┐      ┌──────────────┐
    │ Thread Name │      │ Future Jobs  │
    │ Generation  │      │              │
    └─────────────┘      └──────────────┘
```

### Job Types

| Job Type | Description | Payload | Expected Duration |
|----------|-------------|----------|-------------------|
| `thread-naming` | Generate title from first message | `{ threadId, message }` | 100-500ms |
| `metadata-update` | Update thread metadata (future) | `{ threadId, metadata }` | <50ms |
| `embedding-cache` | Precompute embeddings (future) | `{ content, id }` | 500-1000ms |

---

## 📁 File Structure

```
services/bernard-agent/
├── src/
│   ├── bernard-agent/
│   │   ├── names.ts          # NEW - Queue, worker, nameThread node
│   │   ├── graph.ts          # MODIFY - Add name_thread node
│   │   └── state.ts          # OPTIONAL - Add threadTitle field
│   └── lib/
│       └── infra/
│           └── queue.ts       # NEW - BullMQ queue initialization
└── index.ts                    # MODIFY - Start worker on boot
```

---

## 🔧 Components

### 1. Queue Infrastructure (`src/lib/infra/queue.ts`)

**Purpose**: Centralized BullMQ queue management for utility operations.

**Features**:
- Single "utility" queue for all background tasks
- Redis connection reuse (same as checkpointer)
- Configuration options (retries, concurrency, TTL)
- Job deduplication support

**Interface**:
```typescript
export interface UtilityJobData {
  type: 'thread-naming' | 'metadata-update' | 'embedding-cache' | string;
  data: any;
}

export interface UtilityJobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export function getUtilityQueue(): Queue<UtilityJobData>;
export async function startUtilityWorker(): Promise<Worker<UtilityJobData, any, string>>;
export function addUtilityJob(type: string, data: any, options?: JobsOptions): Promise<Job<UtilityJobData>>;
```

### 2. Thread Naming Logic (`src/bernard-agent/names.ts`)

**Purpose**: Generate thread titles using utility model.

**Flow**:
1. Check if thread already named (Redis query)
2. Queue "thread-naming" job with deduplication
3. Job processor:
   - Resolve utility model
   - Generate title (3-6 words, 30 tokens max)
   - Store in Redis metadata
   - Log completion
4. Fire-and-forget from graph (return immediately)

**Key Functions**:
```typescript
async function nameThread(state, config): Promise<{}>;
async function processThreadNamingJob(job): Promise<UtilityJobResult>;
async function generateTitle(message: string): Promise<string>;
```

### 3. Graph Integration (`src/bernard-agent/graph.ts`)

**Purpose**: Hook naming into Bernard agent graph without blocking.

**Changes**:
- Add `name_thread` node (non-blocking)
- Connect START → name_thread
- `name_thread` queues job and returns immediately
- Main flow never waits for naming

**Graph Flow**:
```
START → name_thread (queues job, returns instantly) → call_react_model → tools → ...
        ↓
    [Background job processes asynchronously]
```

### 4. Worker Startup (`index.ts`)

**Purpose**: Initialize utility worker when Bernard agent starts.

**Configuration**:
- Concurrency: 5 parallel jobs
- Retries: 3 with exponential backoff (2s, 4s, 8s)
- Job TTL: 24 hours (abandon stale jobs)
- Remove completed jobs: Keep last 100
- Remove failed jobs: Keep last 500

---

## 🔌 Configuration

### Environment Variables

```env
# services/bernard-agent/.env

# Utility Model Configuration
MODELS_UTILITY_PRIMARY=gpt-4o-mini
MODELS_UTILITY_PROVIDER_ID=openai-provider-1

# Utility Queue Configuration
UTILITY_QUEUE_CONCURRENCY=5           # Max parallel jobs
UTILITY_QUEUE_RETRIES=3               # Retry attempts
UTILITY_QUEUE_BACKOFF=2000            # Initial backoff (ms)
UTILITY_QUEUE_TTL=86400000           # Job TTL (24 hours)
UTILITY_QUEUE_REMOVE_COMPLETED=100     # Keep last N completed jobs
UTILITY_QUEUE_REMOVE_FAILED=500        # Keep last N failed jobs

# Optional: Disable naming per request
UTILITY_AUTO_NAME_THREADS=true        # Enable/disable auto-naming
```

### Redis Keys

| Pattern | Purpose | Example |
|----------|---------|----------|
| `bull:utility:jobs:*` | Job data | `bull:utility:1` |
| `bull:utility:delayed:*` | Delayed jobs | `bull:utility:delayed` |
| `bull:utility:priority:*` | Priority queue | `bull:utility:priority` |
| `bull:utility:completed:*` | Completed jobs | `bull:utility:completed` |
| `bernard:thread:{threadId}` | Thread metadata | `bernard:thread:abc-123` |

---

## 🔄 Job Processing Lifecycle

### 1. Job Queued

```typescript
await addUtilityJob('thread-naming', {
  threadId: 'abc-123',
  message: 'What is the weather in SF?'
}, {
  jobId: `thread-naming:abc-123`,  // Deduplication key
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
});
```

### 2. Job Processing (Worker)

```typescript
worker = new Worker('utility', async (job) => {
  const { type, data } = job.data;

  switch (type) {
    case 'thread-naming':
      return await processThreadNamingJob(job);
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}, { concurrency: 5 });
```

### 3. Success Path

```
Job starts → Process thread naming → Generate title → Store in Redis → Job completed
    ↓           ↓                 ↓               ↓              ↓
  Log:         Log:            Log:            Log:
  Processing    Model called      Title stored     ✓ Completed
  job...       (gpt-4o-mini)   (bernard:thread...)
```

### 4. Failure Path

```
Job starts → Model call fails → Retry 1 (2s delay) → Retry 2 (4s delay) → Retry 3 (8s delay) → Job failed
    ↓            ↓                    ↓                      ↓                      ↓                    ↓
  Log:        Log:                Log:                   Log:                  Log:
  Processing    Error: 502          Retry attempt 2        Retry attempt 3        ✗ Failed
  job...        (network error)      ...                    ...                    (max retries exceeded)
```

### 5. Recovery

Failed jobs are retained in Redis for debugging:
```bash
# List failed jobs
redis-cli KEYS "bull:utility:failed:*"

# Get job data
redis-cli GET "bull:utility:1"

# Retry manually (via API or script)
```

---

## 📊 Monitoring & Observability

### Logs

**Log Format**:
```json
{
  "timestamp": "2026-01-07T05:30:00.000Z",
  "level": "info",
  "component": "UtilityQueue",
  "jobId": "1",
  "jobType": "thread-naming",
  "threadId": "abc-123",
  "status": "processing"
}
```

**Log Levels**:
- `info`: Job queued, processing, completed
- `warn`: Retry attempts, slow jobs
- `error`: Job failed, model errors
- `debug`: Detailed job data (development only)

### Metrics (Optional Future)

Add to Grafana/Prometheus:
- Jobs queued per minute
- Jobs processed per minute
- Average job duration
- Failure rate
- Queue depth

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// tests/queue.test.ts
describe('Utility Queue', () => {
  it('should queue thread naming job', async () => {
    const job = await addUtilityJob('thread-naming', { threadId: 'test', message: 'Hello' });
    expect(job.id).toBeDefined();
    expect(job.data.type).toBe('thread-naming');
  });

  it('should deduplicate jobs with same ID', async () => {
    const job1 = await addUtilityJob('thread-naming', { threadId: 'test', message: 'Hello' }, { jobId: 'same' });
    const job2 = await addUtilityJob('thread-naming', { threadId: 'test', message: 'Hello' }, { jobId: 'same' });
    expect(job1.id).toBe(job2.id); // Same job
  });

  it('should generate title from first message', async () => {
    const title = await generateTitle('What is the weather?');
    expect(title).toMatch(/weather/i);
    expect(title.length).toBeLessThanOrEqual(50);
  });
});
```

### Integration Tests

```bash
# Scenario 1: New thread gets named
curl -X POST http://localhost:2024/threads
THREAD_ID=$(jq -r .thread_id)

curl -X POST http://localhost:2024/runs/stream \
  -H "Content-Type: application/json" \
  -d "{
    \"assistant_id\": \"bernard_agent\",
    \"thread_id\": \"$THREAD_ID\",
    \"input\": { \"messages\": [{ \"role\": \"user\", \"content\": \"Hello Bernard\" }] }
  }"

sleep 2
redis-cli GET "bernard:thread:$THREAD_ID"
# Expected: {"name":"Hello","updatedAt":"..."}

# Scenario 2: Existing thread not renamed
curl -X POST http://localhost:2024/runs/stream \
  -d "{
    \"thread_id\": \"$THREAD_ID\",
    \"input\": { \"messages\": [{ \"role\": \"user\", \"content\": \"Second message\" }] }
  }"

redis-cli GET "bernard:thread:$THREAD_ID"
# Expected: Name unchanged from Scenario 1

# Scenario 3: Naming failure doesn't break chat
# Mock model failure, send message, verify chat completes
```

### Load Testing

```bash
# Create 100 threads concurrently
for i in {1..100}; do
  curl -X POST http://localhost:2024/threads &
done

# Verify queue processes all jobs
redis-cli KEYS "bull:utility:*" | wc -l
```

---

## 🚦 Deployment Steps

### Phase 1: Infrastructure

1. **Create queue infrastructure**
   ```bash
   # Create src/lib/infra/queue.ts
   # Implement getUtilityQueue(), startUtilityWorker()
   ```

2. **Add utility model config**
   ```bash
   # Edit .env
   echo 'MODELS_UTILITY_PRIMARY=gpt-4o-mini' >> services/bernard-agent/.env
   ```

### Phase 2: Thread Naming

3. **Implement naming logic**
   ```bash
   # Create src/bernard-agent/names.ts
   # Implement processThreadNamingJob(), generateTitle(), nameThread()
   ```

4. **Integrate with graph**
   ```bash
   # Modify src/bernard-agent/graph.ts
   # Add name_thread node, connect to START
   ```

5. **Start worker**
   ```bash
   # Modify index.ts
   # Call startUtilityWorker() on startup
   ```

### Phase 3: Testing

6. **Unit tests**
   ```bash
   npm run test
   ```

7. **Integration test**
   ```bash
   # Manual testing via UI or curl
   # Verify naming happens in background
   ```

8. **Performance test**
   ```bash
   # Send 50 messages, measure latency
   # Verify zero impact on main chat
   ```

### Phase 4: Monitoring

9. **Log verification**
   ```bash
   tail -f logs/bernard-agent.log | grep UtilityQueue
   ```

10. **Health check** (optional)
    ```bash
    # Add /health endpoint to report queue status
    curl http://localhost:2024/health
    ```

---

## 📝 Future Extensions

### Additional Job Types

1. **Thread Summarization**: Periodic summary of long threads
   ```typescript
   type: 'thread-summary'
   data: { threadId, maxMessages: 50 }
   ```

2. **Embedding Caching**: Pre-compute embeddings for search
   ```typescript
   type: 'embedding-cache'
   data: { content, id }
   ```

3. **Metadata Cleanup**: Remove old thread metadata
   ```typescript
   type: 'metadata-cleanup'
   data: { olderThanDays: 90 }
   ```

### Advanced Features

1. **Priority Jobs**: Urgent naming with higher priority
   ```typescript
   addUtilityJob('thread-naming', data, { priority: 10 })
   ```

2. **Scheduled Jobs**: Batch naming at quiet hours
   ```typescript
   queue.addBulk(jobs, { delay: untilMidnight() })
   ```

3. **Distributed Workers**: Multiple Bernard instances share queue
   ```typescript
   // Worker 1 on instance A
   // Worker 2 on instance B
   // Both process from same Redis queue
   ```

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ New threads automatically named after first message
- ✅ Existing threads not renamed
- ✅ Zero latency impact on main chat
- ✅ Naming failures don't break conversations
- ✅ Utility model used (not router model)

### Non-Functional Requirements
- ✅ Jobs survive process restarts
- ✅ Retry logic with exponential backoff
- ✅ Job deduplication
- ✅ Concurrency control (max 5 parallel)
- ✅ Comprehensive logging
- ✅ Graceful degradation (fallback on failures)

### Performance Requirements
- ✅ Main chat latency: +0ms (no blocking)
- ✅ Naming latency: <500ms
- ✅ Queue depth: <100 under normal load
- ✅ Worker throughput: 10+ jobs/second

---

## 🔍 Troubleshooting

### Issue: Jobs not processing

**Symptoms**:
- Queue depth growing
- No "processing" logs
- Thread names not appearing

**Checks**:
```bash
# 1. Verify worker started
tail -f logs/bernard-agent.log | grep "Utility queue worker started"

# 2. Check Redis connection
redis-cli PING
# Should return PONG

# 3. Verify queue exists
redis-cli KEYS "bull:utility:*"
# Should see job keys

# 4. Check worker logs for errors
tail -f logs/bernard-agent.log | grep "UtilityQueue" | grep "error"
```

**Solutions**:
- Restart Bernard agent (worker auto-starts)
- Check Redis connection string in `.env`
- Verify utility model is configured

### Issue: High failure rate

**Symptoms**:
- Many failed jobs
- Retry logs frequent
- Thread names missing

**Checks**:
```bash
# Check failure reason distribution
redis-cli KEYS "bull:utility:failed:*" | wc -l

# Sample a failed job
redis-cli GET "bull:utility:failed:1" | jq .
```

**Solutions**:
- Check utility model availability
- Verify API rate limits
- Increase retry attempts in config
- Add fallback to default name on failure

### Issue: Slow processing

**Symptoms**:
- Queue depth >50
- Jobs take >5 seconds
- Naming appears after long delay

**Checks**:
```bash
# Check concurrency setting
grep UTILITY_QUEUE_CONCURRENCY .env

# Monitor worker performance
tail -f logs/bernard-agent.log | grep "Processing time"
```

**Solutions**:
- Increase concurrency (e.g., UTILITY_QUEUE_CONCURRENCY=10)
- Add more worker instances
- Use faster utility model (gpt-4o-mini instead of gpt-4o)

---

## 📚 References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [LangGraph Parallel Execution](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents#parallel-execution)
- [Bernard Thread Management](../../AGENTS.md#threads--management)
- [Redis Queue Best Practices](https://redis.io/topics/cluster-tutorial)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Status**: Planning
