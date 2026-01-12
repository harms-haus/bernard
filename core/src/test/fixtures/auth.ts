export function mockSession(overrides: Partial<SessionData> = {}): SessionData {
  const base: SessionData = {
    id: 'test-session-id',
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000), // 1 hour
  }

  return { ...base, ...overrides }
}

export function mockUser(overrides: Partial<UserData> = {}): UserData {
  const base: UserData = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
  }

  return { ...base, ...overrides }
}

interface SessionData {
  id: string
  userId: string
  email: string
  name: string
  createdAt: Date
  expiresAt: Date
}

interface UserData {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}
