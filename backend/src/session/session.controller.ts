import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards, Query, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from "@nestjs/swagger"
import type { Request } from "express"
import type { SessionService } from "./session.service"
import { SessionGuard } from "./guards/session.guard"
import { CurrentSession } from "./decorators/current-session.decorator"
import type { SessionData } from "./session.service"

@ApiTags("Session Management")
@Controller("sessions")
@UseGuards(SessionGuard)
@ApiBearerAuth()
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get("current")
  @ApiOperation({ summary: "Get current session information" })
  @ApiResponse({ status: 200, description: "Current session data" })
  getCurrentSession(@CurrentSession() session: SessionData) {
    return this.sessionDataFormatter(session);
  }

  @Get("user/:userId")
  @ApiOperation({ summary: "Get all sessions for a user" })
  @ApiResponse({ status: 200, description: "User sessions list" })
  async getUserSessions(@Param("userId") userId: string, @CurrentSession() currentSession: SessionData) {
    // Only allow users to view their own sessions or admins to view any
    if (currentSession.userId !== userId && !currentSession.roles?.includes("admin")) {
      throw new Error("Unauthorized to view sessions for this user")
    }

    const sessions = await this.sessionService.getUserSessions(userId)

    return {
      userId,
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.sessionId === currentSession.sessionId,
      })),
      total: sessions.length,
    }
  }

  @Get("my")
  @ApiOperation({ summary: "Get current user's sessions" })
  @ApiResponse({ status: 200, description: "Current user's sessions" })
  async getMySessions(@CurrentSession() session: SessionData) {
    const sessions = await this.sessionService.getUserSessions(session.userId)

    return {
      sessions: sessions.map((s) => ({
        ...s,
        isCurrent: s.sessionId === session.sessionId,
      })),
      total: sessions.length,
    }
  }

  @Post("refresh")
  @ApiOperation({ summary: "Refresh current session" })
  @ApiResponse({ status: 200, description: "Session refreshed successfully" })
  async refreshSession(@CurrentSession() session: SessionData, @Req() req: Request) {
    const ipAddress = this.getClientIp(req)
    const userAgent = req.headers["user-agent"] || ""

    const refreshedSession = await this.sessionService.refreshSession(session.sessionId, ipAddress, userAgent)

    return {
      message: "Session refreshed successfully",
      expiresAt: refreshedSession?.expiresAt,
      lastAccessedAt: refreshedSession?.lastAccessedAt,
    }
  }

  @Post("extend")
  @ApiOperation({ summary: "Extend current session" })
  @ApiResponse({ status: 200, description: "Session extended successfully" })
  async extendSession(
    @CurrentSession() session: SessionData,
    @Body() body: { additionalTime: number }, // in milliseconds
  ) {
    if (body.additionalTime <= 0 || body.additionalTime > 7 * 24 * 60 * 60 * 1000) {
      throw new Error("Invalid extension time")
    }

    const extendedSession = await this.sessionService.extendSession(session.sessionId, body.additionalTime)

    return {
      message: "Session extended successfully",
      expiresAt: extendedSession?.expiresAt,
      additionalTime: body.additionalTime,
    }
  }

  @Post("metadata")
  @ApiOperation({ summary: "Update session metadata" })
  @ApiResponse({ status: 200, description: "Session metadata updated" })
  async updateSessionMetadata(@CurrentSession() session: SessionData, @Body() metadata: Record<string, any>) {
    await this.sessionService.updateSessionMetadata(session.sessionId, metadata)

    return {
      message: "Session metadata updated successfully",
      sessionId: session.sessionId,
    }
  }

  @Delete("current")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Invalidate current session (logout)" })
  @ApiResponse({ status: 204, description: "Session invalidated successfully" })
  async invalidateCurrentSession(@CurrentSession() session: SessionData) {
    await this.sessionService.invalidateSession(session.sessionId, "user_logout")
  }

  @Delete(":sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Invalidate a specific session" })
  @ApiResponse({ status: 204, description: "Session invalidated successfully" })
  async invalidateSession(@Param("sessionId") sessionId: string, @CurrentSession() currentSession: SessionData) {
    // Verify the session belongs to the current user or user is admin
    const targetSession = await this.sessionService.getSession(sessionId)
    if (!targetSession) {
      throw new Error("Session not found")
    }

    if (targetSession.userId !== currentSession.userId && !currentSession.roles?.includes("admin")) {
      throw new Error("Unauthorized to invalidate this session")
    }

    await this.sessionService.invalidateSession(sessionId, "user_manual")
  }

  @Delete("user/:userId/all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Invalidate all sessions for a user" })
  @ApiResponse({ status: 204, description: "All user sessions invalidated" })
  async invalidateAllUserSessions(
    @Param("userId") userId: string,
    @CurrentSession() currentSession: SessionData,
    @Query("excludeCurrent") excludeCurrent: string = "true",
  ) {
    // Only allow users to invalidate their own sessions or admins
    if (currentSession.userId !== userId && !currentSession.roles?.includes("admin")) {
      throw new Error("Unauthorized to invalidate sessions for this user")
    }

    const excludeSessionId = excludeCurrent === "true" ? currentSession.sessionId : undefined
    const invalidatedCount = await this.sessionService.invalidateAllUserSessions(userId, excludeSessionId)

    return {
      message: `Invalidated ${invalidatedCount} sessions`,
      invalidatedCount,
      excludedCurrent: excludeCurrent === "true",
    }
  }

  @Delete("my/all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Invalidate all current user's sessions except current" })
  @ApiResponse({ status: 204, description: "All other sessions invalidated" })
  async invalidateAllMySessions(@CurrentSession() session: SessionData) {
    const invalidatedCount = await this.sessionService.invalidateAllUserSessions(session.userId, session.sessionId)

    return {
      message: `Invalidated ${invalidatedCount} other sessions`,
      invalidatedCount,
    }
  }

  @Get("statistics")
  @ApiOperation({ summary: "Get session statistics" })
  @ApiResponse({ status: 200, description: "Session statistics" })
  @ApiQuery({ name: "hours", required: false, description: "Time range in hours (default: 24)" })
  async getSessionStatistics(@Query("hours") hours: string = "24", @CurrentSession() session: SessionData) {
    // Only allow admins to view statistics
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to view session statistics")
    }

    const timeRange = Number.parseInt(hours) * 60 * 60 * 1000
    const statistics = await this.sessionService.getSessionStatistics(timeRange)

    return {
      timeRange: `${hours} hours`,
      ...statistics,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("active/count")
  @ApiOperation({ summary: "Get active sessions count" })
  @ApiResponse({ status: 200, description: "Active sessions count" })
  async getActiveSessionsCount(@CurrentSession() session: SessionData) {
    // Only allow admins to view active sessions count
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to view active sessions count")
    }

    const count = await this.sessionService.getActiveSessionsCount()

    return {
      activeSessionsCount: count,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("cleanup")
  @ApiOperation({ summary: "Cleanup expired sessions" })
  @ApiResponse({ status: 200, description: "Expired sessions cleaned up" })
  async cleanupExpiredSessions(@CurrentSession() session: SessionData) {
    // Only allow admins to trigger cleanup
    if (!session.roles?.includes("admin")) {
      throw new Error("Unauthorized to cleanup sessions")
    }

    const cleanedCount = await this.sessionService.cleanupExpiredSessions()

    return {
      message: `Cleaned up ${cleanedCount} expired sessions`,
      cleanedCount,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for session service" })
  healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "session-management",
    }
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers["x-forwarded-for"] as string
    const realIp = request.headers["x-real-ip"] as string
    const cfConnectingIp = request.headers["cf-connecting-ip"] as string

    if (forwarded) {
      return forwarded.split(",")[0].trim()
    }

    if (realIp) {
      return realIp
    }

    if (cfConnectingIp) {
      return cfConnectingIp
    }

    return request.ip || request.connection.remoteAddress || "unknown"
  }
}
