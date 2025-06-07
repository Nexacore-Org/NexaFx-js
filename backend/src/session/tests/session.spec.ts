import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { SessionService } from "../session.service"
import { SessionSecurityService } from "../services/session-security.service"
import { MemorySessionStorage } from "../storage/memory-session.storage"
import { SessionStorage } from "../storage/session.storage"
import { jest } from "@jest/globals"

describe("SessionService", () => {
  let service: SessionService
  let storage: SessionStorage
  let securityService: SessionSecurityService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        SessionSecurityService,
        {
          provide: SessionStorage,
          useClass: MemorySessionStorage,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                SESSION_TTL: 24 * 60 * 60 * 1000,
                SESSION_REMEMBER_ME_TTL: 30 * 24 * 60 * 60 * 1000,
                SESSION_MAX_PER_USER: 5,
                SESSION_INACTIVITY_TIMEOUT: 30 * 60 * 1000,
                SESSION_STORAGE: "memory",
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<SessionService>(SessionService)
    storage = module.get<SessionStorage>(SessionStorage)
    securityService = module.get<SessionSecurityService>(SessionSecurityService)
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("createSession", () => {
    it("should create a new session", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        email: "test@example.com",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
        roles: ["user"],
      }

      const session = await service.createSession(options)

      expect(session).toBeDefined()
      expect(session.userId).toBe(options.userId)
      expect(session.username).toBe(options.username)
      expect(session.sessionId).toMatch(/^[a-f0-9]{64}$/)
      expect(session.isActive).toBe(true)
    })

    it("should enforce session limits per user", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      // Create maximum allowed sessions
      for (let i = 0; i < 5; i++) {
        await service.createSession({ ...options, metadata: { sessionNumber: i } })
      }

      // Creating one more should remove the oldest
      const newSession = await service.createSession({ ...options, metadata: { sessionNumber: 5 } })
      expect(newSession).toBeDefined()

      const userSessions = await service.getUserSessions("user123")
      expect(userSessions.length).toBeLessThanOrEqual(5)
    })
  })

  describe("getSession", () => {
    it("should retrieve an existing session", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      const createdSession = await service.createSession(options)
      const retrievedSession = await service.getSession(createdSession.sessionId)

      expect(retrievedSession).toBeDefined()
      expect(retrievedSession?.sessionId).toBe(createdSession.sessionId)
      expect(retrievedSession?.userId).toBe(options.userId)
    })

    it("should return null for non-existent session", async () => {
      const session = await service.getSession("nonexistent")
      expect(session).toBeNull()
    })

    it("should return null for expired session", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      const session = await service.createSession(options)

      // Manually expire the session
      session.expiresAt = Date.now() - 1000
      await storage.updateSession(session)

      const retrievedSession = await service.getSession(session.sessionId)
      expect(retrievedSession).toBeNull()
    })
  })

  describe("refreshSession", () => {
    it("should refresh session and update last accessed time", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      const session = await service.createSession(options)
      const originalLastAccessed = session.lastAccessedAt

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const refreshedSession = await service.refreshSession(session.sessionId, options.ipAddress, options.userAgent)

      expect(refreshedSession).toBeDefined()
      expect(refreshedSession!.lastAccessedAt).toBeGreaterThan(originalLastAccessed)
    })
  })

  describe("invalidateSession", () => {
    it("should invalidate a session", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      const session = await service.createSession(options)
      await service.invalidateSession(session.sessionId)

      const retrievedSession = await service.getSession(session.sessionId)
      expect(retrievedSession).toBeNull()
    })
  })

  describe("invalidateAllUserSessions", () => {
    it("should invalidate all user sessions except excluded one", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      // Create multiple sessions
      const session1 = await service.createSession(options)
      const session2 = await service.createSession(options)
      const session3 = await service.createSession(options)

      // Invalidate all except session2
      const invalidatedCount = await service.invalidateAllUserSessions("user123", session2.sessionId)

      expect(invalidatedCount).toBe(2)

      // session2 should still exist
      const remainingSession = await service.getSession(session2.sessionId)
      expect(remainingSession).toBeDefined()

      // Others should be gone
      expect(await service.getSession(session1.sessionId)).toBeNull()
      expect(await service.getSession(session3.sessionId)).toBeNull()
    })
  })

  describe("getUserSessions", () => {
    it("should return all active sessions for a user", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      await service.createSession(options)
      await service.createSession(options)
      await service.createSession(options)

      const userSessions = await service.getUserSessions("user123")
      expect(userSessions.length).toBe(3)
      expect(userSessions[0]).toHaveProperty("sessionId")
      expect(userSessions[0]).toHaveProperty("createdAt")
      expect(userSessions[0]).toHaveProperty("lastAccessedAt")
    })
  })

  describe("extendSession", () => {
    it("should extend session expiration time", async () => {
      const options = {
        userId: "user123",
        username: "testuser",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      }

      const session = await service.createSession(options)
      const originalExpiry = session.expiresAt
      const extensionTime = 60 * 60 * 1000 // 1 hour

      const extendedSession = await service.extendSession(session.sessionId, extensionTime)

      expect(extendedSession).toBeDefined()
      expect(extendedSession!.expiresAt).toBe(originalExpiry + extensionTime)
    })
  })
})
