export function mockCheckpoint(overrides: Partial<CheckpointData> = {}): CheckpointData {
  const base: CheckpointData = {
    v: 1,
    id: 'test-checkpoint-id',
    ts: new Date().toISOString(),
    channel_values: {},
    channel_versions: {},
    versions_seen: {},
  }

  return { ...base, ...overrides }
}

export function mockCheckpointMetadata(
  overrides: Partial<CheckpointMetadata> = {}
): CheckpointMetadata {
  const base: CheckpointMetadata = {
    source: 'input',
    step: -1,
    parents: {},
  }

  return { ...base, ...overrides }
}

interface CheckpointData {
  v: number
  id: string
  ts: string
  channel_values: Record<string, unknown>
  channel_versions: Record<string, string>
  versions_seen: Record<string, unknown>
}

interface CheckpointMetadata {
  source: 'input' | 'loop' | 'call'
  step: number
  parents: Record<string, string>
}
