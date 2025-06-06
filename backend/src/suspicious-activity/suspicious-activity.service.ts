import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { type Repository, MoreThan } from "typeorm"
import { SuspiciousActivity, ActivityType, SeverityLevel, ActionTaken } from "./entities/suspicious-activity.entity"
import { ActivityRule, RuleType, RuleStatus } from "./entities/activity-rule.entity"
import type {
  ActivityEvent,
  RuleEvaluationResult,
  ActivityAnalysisResult,
  UserRiskProfile,
  SuspiciousActivityAlert,
  SuspiciousActivityStats,
} from "./interfaces/suspicious-activity.interface"
import type { ActivityQueryDto } from "./dto/activity-query.dto"
import type { CreateRuleDto, UpdateRuleDto } from "./dto/rule-dto.ts"
import type { NotificationService } from "../notifications/notification.service"

@Injectable()
export class SuspiciousActivityService {
  private readonly logger = new Logger(SuspiciousActivityService.name)
  private readonly userRiskProfiles = new Map<string, UserRiskProfile>()
  private readonly knownUserLocations = new Map<string, Set<string>>()
  private readonly knownUserDevices = new Map<string, Set<string>>()
  private readonly userLoginTimes = new Map<string, Date[]>()
  private readonly userActivityCounts = new Map<string, Map<ActivityType, number>>()

  constructor(
    private suspiciousActivityRepository: Repository<SuspiciousActivity>,
    private activityRuleRepository: Repository<ActivityRule>,
    private notificationService: NotificationService,
    @InjectRepository(SuspiciousActivity)
    suspiciousActivityRepositoryInjection: Repository<SuspiciousActivity>,
    @InjectRepository(ActivityRule)
    activityRuleRepositoryInjection: Repository<ActivityRule>,
  ) {
    this.suspiciousActivityRepository = suspiciousActivityRepositoryInjection
    this.activityRuleRepository = activityRuleRepositoryInjection
    this.initializeDefaultRules()
  }

  private async initializeDefaultRules(): Promise<void> {
    try {
      const existingRules = await this.activityRuleRepository.find({ where: { isSystem: true } })
      if (existingRules.length === 0) {
        await this.createDefaultRules()
      }
    } catch (error) {
      this.logger.error(`Failed to initialize default rules: ${error.message}`)
    }
  }

  private async createDefaultRules(): Promise<void> {
    const defaultRules: CreateRuleDto[] = [
      // Rapid login attempts rule
      {
        name: "Rapid Login Attempts",
        description: "Detects multiple login attempts in a short period",
        ruleType: RuleType.FREQUENCY,
        activityTypes: [ActivityType.LOGIN_ATTEMPT],
        severityLevel: SeverityLevel.MEDIUM,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED],
        conditions: { minCount: 5 },
        threshold: 5,
        timeWindowMinutes: 5,
        riskScoreMultiplier: 1.5,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Failed login attempts rule
      {
        name: "Multiple Failed Logins",
        description: "Detects multiple failed login attempts",
        ruleType: RuleType.FREQUENCY,
        activityTypes: [ActivityType.FAILED_LOGIN],
        severityLevel: SeverityLevel.HIGH,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED, ActionTaken.ACCOUNT_LOCKED],
        conditions: { minCount: 5 },
        threshold: 5,
        timeWindowMinutes: 15,
        riskScoreMultiplier: 2.0,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Unusual location login rule
      {
        name: "Login from New Location",
        description: "Detects login from a previously unseen location",
        ruleType: RuleType.LOCATION,
        activityTypes: [ActivityType.LOGIN_ATTEMPT],
        severityLevel: SeverityLevel.MEDIUM,
        actions: [ActionTaken.LOGGED, ActionTaken.USER_NOTIFIED],
        conditions: { checkNewLocation: true },
        threshold: 1,
        timeWindowMinutes: 1440, // 24 hours
        riskScoreMultiplier: 1.2,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Unusual time login rule
      {
        name: "Login at Unusual Hours",
        description: "Detects login during unusual hours (11 PM - 5 AM)",
        ruleType: RuleType.TIME,
        activityTypes: [ActivityType.LOGIN_ATTEMPT],
        severityLevel: SeverityLevel.LOW,
        actions: [ActionTaken.LOGGED],
        conditions: { startHour: 23, endHour: 5 },
        threshold: 1,
        timeWindowMinutes: 1440, // 24 hours
        riskScoreMultiplier: 1.1,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Multiple financial transactions rule
      {
        name: "High Frequency Financial Transactions",
        description: "Detects unusually high number of financial transactions",
        ruleType: RuleType.FREQUENCY,
        activityTypes: [ActivityType.FINANCIAL_TRANSACTION],
        severityLevel: SeverityLevel.HIGH,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED, ActionTaken.ADMIN_NOTIFIED],
        conditions: { minCount: 10 },
        threshold: 10,
        timeWindowMinutes: 60,
        riskScoreMultiplier: 2.5,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Large data export rule
      {
        name: "Large Data Export",
        description: "Detects export of large amounts of data",
        ruleType: RuleType.THRESHOLD,
        activityTypes: [ActivityType.DATA_EXPORT],
        severityLevel: SeverityLevel.HIGH,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED, ActionTaken.ADMIN_NOTIFIED],
        conditions: { minSize: 10000000 }, // 10MB
        threshold: 1,
        timeWindowMinutes: 60,
        riskScoreMultiplier: 2.0,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Permission changes rule
      {
        name: "Multiple Permission Changes",
        description: "Detects multiple permission changes in a short period",
        ruleType: RuleType.FREQUENCY,
        activityTypes: [ActivityType.PERMISSION_CHANGE],
        severityLevel: SeverityLevel.HIGH,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED, ActionTaken.ADMIN_NOTIFIED],
        conditions: { minCount: 3 },
        threshold: 3,
        timeWindowMinutes: 30,
        riskScoreMultiplier: 2.0,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Account recovery attempts rule
      {
        name: "Multiple Account Recovery Attempts",
        description: "Detects multiple account recovery attempts",
        ruleType: RuleType.FREQUENCY,
        activityTypes: [ActivityType.ACCOUNT_RECOVERY],
        severityLevel: SeverityLevel.MEDIUM,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED],
        conditions: { minCount: 2 },
        threshold: 2,
        timeWindowMinutes: 60,
        riskScoreMultiplier: 1.5,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
      // Bulk operations rule
      {
        name: "Suspicious Bulk Operations",
        description: "Detects suspicious bulk operations",
        ruleType: RuleType.THRESHOLD,
        activityTypes: [ActivityType.BULK_OPERATION],
        severityLevel: SeverityLevel.HIGH,
        actions: [ActionTaken.LOGGED, ActionTaken.ALERTED, ActionTaken.ADMIN_NOTIFIED],
        conditions: { minItems: 100 },
        threshold: 1,
        timeWindowMinutes: 60,
        riskScoreMultiplier: 2.0,
        status: RuleStatus.ACTIVE,
        isSystem: true,
      },
    ]

    for (const rule of defaultRules) {
      await this.activityRuleRepository.save(this.activityRuleRepository.create(rule))
    }

    this.logger.log(`Created ${defaultRules.length} default rules`)
  }

  async trackActivity(event: ActivityEvent): Promise<ActivityAnalysisResult> {
    try {
      this.logger.debug(`Tracking activity: ${event.activityType} for user ${event.userId || "anonymous"}`)

      // Update user activity counts
      this.updateUserActivityCount(event)

      // Analyze the activity for suspicious patterns
      const analysisResult = await this.analyzeActivity(event)

      // If suspicious, log it and take appropriate actions
      if (analysisResult.isSuspicious) {
        await this.handleSuspiciousActivity(event, analysisResult)
      }

      // Update user risk profile
      if (event.userId) {
        this.updateUserRiskProfile(event.userId, analysisResult)
      }

      return analysisResult
    } catch (error) {
      this.logger.error(`Error tracking activity: ${error.message}`)
      throw error
    }
  }

  private updateUserActivityCount(event: ActivityEvent): void {
    if (!event.userId) return

    const userId = event.userId
    const activityType = event.activityType

    if (!this.userActivityCounts.has(userId)) {
      this.userActivityCounts.set(userId, new Map())
    }

    const userCounts = this.userActivityCounts.get(userId)
    userCounts.set(activityType, (userCounts.get(activityType) || 0) + 1)

    // Track login times for time-based analysis
    if (activityType === ActivityType.LOGIN_ATTEMPT) {
      if (!this.userLoginTimes.has(userId)) {
        this.userLoginTimes.set(userId, [])
      }
      this.userLoginTimes.get(userId).push(event.timestamp || new Date())

      // Keep only the last 100 login times
      const loginTimes = this.userLoginTimes.get(userId)
      if (loginTimes.length > 100) {
        this.userLoginTimes.set(userId, loginTimes.slice(-100))
      }
    }

    // Track known locations
    if (event.geolocation && event.userId) {
      if (!this.knownUserLocations.has(userId)) {
        this.knownUserLocations.set(userId, new Set())
      }
      this.knownUserLocations.get(userId).add(event.geolocation)
    }

    // Track known devices
    if (event.deviceFingerprint && event.userId) {
      if (!this.knownUserDevices.has(userId)) {
        this.knownUserDevices.set(userId, new Set())
      }
      this.knownUserDevices.get(userId).add(event.deviceFingerprint)
    }
  }

  private async analyzeActivity(event: ActivityEvent): Promise<ActivityAnalysisResult> {
    // Get all active rules that apply to this activity type
    const rules = await this.activityRuleRepository.find({
      where: {
        activityTypes: [event.activityType],
        status: RuleStatus.ACTIVE,
      },
    })

    const triggeredRules: RuleEvaluationResult[] = []
    let highestSeverity = SeverityLevel.LOW
    let totalRiskScore = 0
    const riskFactors: string[] = []
    const recommendedActions: ActionTaken[] = []

    // Evaluate each rule
    for (const rule of rules) {
      const ruleResult = await this.evaluateRule(rule, event)
      if (ruleResult.triggered) {
        triggeredRules.push(ruleResult)
        totalRiskScore += ruleResult.riskScore || 0

        // Track the highest severity level
        if (this.getSeverityValue(rule.severityLevel) > this.getSeverityValue(highestSeverity)) {
          highestSeverity = rule.severityLevel
        }

        // Collect unique risk factors
        if (ruleResult.riskFactors) {
          for (const factor of ruleResult.riskFactors) {
            if (!riskFactors.includes(factor)) {
              riskFactors.push(factor)
            }
          }
        }

        // Collect unique recommended actions
        if (rule.actions) {
          for (const action of rule.actions) {
            if (!recommendedActions.includes(action)) {
              recommendedActions.push(action)
            }
          }
        }
      }
    }

    // Add additional risk factors based on user history
    if (event.userId) {
      const additionalFactors = this.analyzeUserHistory(event.userId, event)
      for (const factor of additionalFactors) {
        if (!riskFactors.includes(factor)) {
          riskFactors.push(factor)
        }
      }
    }

    // Determine if the activity is suspicious based on triggered rules
    const isSuspicious = triggeredRules.length > 0

    return {
      isSuspicious,
      riskScore: totalRiskScore,
      riskFactors,
      severityLevel: highestSeverity,
      recommendedActions,
      triggeredRules,
    }
  }

  private async evaluateRule(rule: ActivityRule, event: ActivityEvent): Promise<RuleEvaluationResult> {
    try {
      let triggered = false
      const riskFactors: string[] = []

      switch (rule.ruleType) {
        case RuleType.FREQUENCY:
          triggered = await this.evaluateFrequencyRule(rule, event)
          if (triggered) {
            riskFactors.push(`High frequency of ${event.activityType} detected`)
          }
          break

        case RuleType.THRESHOLD:
          triggered = this.evaluateThresholdRule(rule, event)
          if (triggered) {
            riskFactors.push(`${event.activityType} exceeded threshold`)
          }
          break

        case RuleType.LOCATION:
          triggered = this.evaluateLocationRule(rule, event)
          if (triggered) {
            riskFactors.push(`Activity from unusual location: ${event.geolocation || "unknown"}`)
          }
          break

        case RuleType.TIME:
          triggered = this.evaluateTimeRule(rule, event)
          if (triggered) {
            riskFactors.push(`Activity at unusual time`)
          }
          break

        case RuleType.PATTERN:
          triggered = await this.evaluatePatternRule(rule, event)
          if (triggered) {
            riskFactors.push(`Suspicious activity pattern detected`)
          }
          break

        case RuleType.ANOMALY:
          triggered = this.evaluateAnomalyRule(rule, event)
          if (triggered) {
            riskFactors.push(`Anomalous behavior detected`)
          }
          break

        case RuleType.COMBINATION:
          triggered = await this.evaluateCombinationRule(rule, event)
          if (triggered) {
            riskFactors.push(`Combination of suspicious activities detected`)
          }
          break
      }

      return {
        triggered,
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severityLevel: rule.severityLevel,
        actions: rule.actions,
        riskScore: triggered ? rule.riskScoreMultiplier : 0,
        riskFactors: triggered ? riskFactors : [],
      }
    } catch (error) {
      this.logger.error(`Error evaluating rule ${rule.name}: ${error.message}`)
      return {
        triggered: false,
        ruleId: rule.id,
        ruleName: rule.name,
      }
    }
  }

  private async evaluateFrequencyRule(rule: ActivityRule, event: ActivityEvent): Promise<boolean> {
    if (!event.userId) return false

    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - rule.timeWindowMinutes)

    const count = await this.suspiciousActivityRepository.count({
      where: {
        userId: event.userId,
        activityType: event.activityType,
        createdAt: MoreThan(timeWindow),
      },
    })

    // Add 1 to include the current event
    return count + 1 >= rule.threshold
  }

  private evaluateThresholdRule(rule: ActivityRule, event: ActivityEvent): boolean {
    if (!event.metadata) return false

    const { conditions } = rule

    // Check for data size threshold (for data exports)
    if (conditions.minSize && event.metadata.size) {
      return event.metadata.size >= conditions.minSize
    }

    // Check for item count threshold (for bulk operations)
    if (conditions.minItems && event.metadata.itemCount) {
      return event.metadata.itemCount >= conditions.minItems
    }

    // Check for amount threshold (for financial transactions)
    if (conditions.minAmount && event.metadata.amount) {
      return event.metadata.amount >= conditions.minAmount
    }

    return false
  }

  private evaluateLocationRule(rule: ActivityRule, event: ActivityEvent): boolean {
    if (!event.userId || !event.geolocation) return false

    const { conditions } = rule

    // Check if this is a new location for the user
    if (conditions.checkNewLocation) {
      const knownLocations = this.knownUserLocations.get(event.userId) || new Set()
      return knownLocations.size > 0 && !knownLocations.has(event.geolocation)
    }

    // Check if location is in a list of suspicious locations
    if (conditions.suspiciousLocations && Array.isArray(conditions.suspiciousLocations)) {
      return conditions.suspiciousLocations.some((location) => event.geolocation.includes(location))
    }

    return false
  }

  private evaluateTimeRule(rule: ActivityRule, event: ActivityEvent): boolean {
    const { conditions } = rule
    const eventTime = event.timestamp || new Date()
    const hour = eventTime.getHours()

    // Check if the activity occurred during specified hours
    if (conditions.startHour !== undefined && conditions.endHour !== undefined) {
      if (conditions.startHour < conditions.endHour) {
        // Simple range (e.g., 9 AM to 5 PM)
        return hour >= conditions.startHour && hour < conditions.endHour
      } else {
        // Overnight range (e.g., 10 PM to 6 AM)
        return hour >= conditions.startHour || hour < conditions.endHour
      }
    }

    return false
  }

  private async evaluatePatternRule(rule: ActivityRule, event: ActivityEvent): Promise<boolean> {
    if (!event.userId) return false

    const { conditions } = rule
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - rule.timeWindowMinutes)

    // Check for specific sequence of activities
    if (conditions.sequence && Array.isArray(conditions.sequence)) {
      const recentActivities = await this.suspiciousActivityRepository.find({
        where: {
          userId: event.userId,
          createdAt: MoreThan(timeWindow),
        },
        order: {
          createdAt: "DESC",
        },
        take: conditions.sequence.length,
      })

      // Check if the current activity plus recent activities match the sequence
      const fullSequence = [event.activityType, ...recentActivities.map((a) => a.activityType)]
      return this.matchesSequence(fullSequence, conditions.sequence)
    }

    return false
  }

  private evaluateAnomalyRule(rule: ActivityRule, event: ActivityEvent): boolean {
    if (!event.userId) return false

    const { conditions } = rule
    const userProfile = this.userRiskProfiles.get(event.userId)

    if (!userProfile) return false

    // Check for deviation from user's normal behavior
    if (conditions.maxRiskScore && userProfile.riskScore > conditions.maxRiskScore) {
      return true
    }

    return false
  }

  private async evaluateCombinationRule(rule: ActivityRule, event: ActivityEvent): Promise<boolean> {
    if (!event.userId) return false

    const { conditions } = rule
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - rule.timeWindowMinutes)

    // Check for combination of different activity types
    if (conditions.activityTypes && Array.isArray(conditions.activityTypes)) {
      const counts = await Promise.all(
        conditions.activityTypes.map((type) =>
          this.suspiciousActivityRepository.count({
            where: {
              userId: event.userId,
              activityType: type,
              createdAt: MoreThan(timeWindow),
            },
          }),
        ),
      )

      // Check if all required activity types have occurred
      return counts.every((count) => count > 0)
    }

    return false
  }

  private matchesSequence(activities: ActivityType[], sequence: ActivityType[]): boolean {
    if (activities.length < sequence.length) return false

    // Check if the activities end with the sequence
    for (let i = 0; i < sequence.length; i++) {
      if (activities[i] !== sequence[i]) {
        return false
      }
    }

    return true
  }

  private analyzeUserHistory(userId: string, event: ActivityEvent): string[] {
    const riskFactors: string[] = []
    const userProfile = this.userRiskProfiles.get(userId)

    if (!userProfile) return riskFactors

    // Check for new device
    if (
      event.deviceFingerprint &&
      this.knownUserDevices.has(userId) &&
      !this.knownUserDevices.get(userId).has(event.deviceFingerprint)
    ) {
      riskFactors.push("Activity from new device")
    }

    // Check for new location
    if (
      event.geolocation &&
      this.knownUserLocations.has(userId) &&
      !this.knownUserLocations.get(userId).has(event.geolocation)
    ) {
      riskFactors.push("Activity from new location")
    }

    // Check for unusual time pattern
    if (event.activityType === ActivityType.LOGIN_ATTEMPT) {
      const loginTimes = this.userLoginTimes.get(userId) || []
      if (loginTimes.length > 5) {
        const currentHour = (event.timestamp || new Date()).getHours()
        const isUnusualTime = loginTimes.filter((time) => time.getHours() === currentHour).length <= 1
        if (isUnusualTime) {
          riskFactors.push("Login at unusual time")
        }
      }
    }

    // Check for high risk user
    if (userProfile.riskScore > 50) {
      riskFactors.push("User has elevated risk score")
    }

    return riskFactors
  }

  private async handleSuspiciousActivity(
    event: ActivityEvent,
    analysisResult: ActivityAnalysisResult,
  ): Promise<SuspiciousActivity> {
    // Create suspicious activity record
    const suspiciousActivity = this.suspiciousActivityRepository.create({
      activityType: event.activityType,
      description: `Suspicious ${event.activityType} detected`,
      severityLevel: analysisResult.severityLevel,
      metadata: event.metadata,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      deviceFingerprint: event.deviceFingerprint,
      geolocation: event.geolocation,
      riskFactors: analysisResult.riskFactors,
      riskScore: analysisResult.riskScore,
      userId: event.userId,
      actionsTaken: [ActionTaken.LOGGED],
    })

    // Take recommended actions
    for (const action of analysisResult.recommendedActions) {
      if (!suspiciousActivity.actionsTaken.includes(action)) {
        suspiciousActivity.actionsTaken.push(action)
      }

      await this.executeAction(action, suspiciousActivity, event)
    }

    // Save the suspicious activity
    const savedActivity = await this.suspiciousActivityRepository.save(suspiciousActivity)
    this.logger.warn(
      `Suspicious activity detected: ${savedActivity.id} (${savedActivity.activityType}) - Risk score: ${savedActivity.riskScore}`,
    )

    return savedActivity
  }

  private async executeAction(
    action: ActionTaken,
    suspiciousActivity: SuspiciousActivity,
    event: ActivityEvent,
  ): Promise<void> {
    switch (action) {
      case ActionTaken.ALERTED:
        await this.sendAdminAlert(suspiciousActivity)
        break

      case ActionTaken.USER_NOTIFIED:
        if (event.userId) {
          await this.sendUserAlert(suspiciousActivity)
        }
        break

      case ActionTaken.ADMIN_NOTIFIED:
        await this.sendAdminAlert(suspiciousActivity)
        break

      case ActionTaken.ACCOUNT_LOCKED:
        if (event.userId) {
          await this.lockUserAccount(event.userId)
        }
        break

      case ActionTaken.MFA_REQUIRED:
        if (event.userId) {
          await this.requireMFA(event.userId)
        }
        break

      case ActionTaken.BLOCKED:
        // Implement IP blocking logic
        break

      default:
        // ActionTaken.NONE or ActionTaken.LOGGED require no additional action
        break
    }
  }

  private async sendAdminAlert(activity: SuspiciousActivity): Promise<void> {
    try {
      const alert: SuspiciousActivityAlert = {
        id: activity.id,
        userId: activity.userId,
        activityType: activity.activityType,
        description: activity.description,
        severityLevel: activity.severityLevel,
        ipAddress: activity.ipAddress,
        timestamp: activity.createdAt,
        riskScore: activity.riskScore,
        riskFactors: activity.riskFactors,
        actionsTaken: activity.actionsTaken,
        metadata: activity.metadata,
      }

      const subject = `🚨 Security Alert: Suspicious Activity - ${activity.severityLevel.toUpperCase()}`
      const template = "suspicious-activity-alert"
      const context = {
        alert,
        timestamp: activity.createdAt.toISOString(),
        dashboardUrl: `${process.env.DASHBOARD_URL}/security/suspicious-activity`,
      }

      // Get admin emails from environment or database
      const adminEmails = process.env.ADMIN_EMAILS?.split(",") || ["admin@example.com"]

      for (const email of adminEmails) {
        await this.notificationService.sendEmail(email.trim(), subject, template, context)
      }

      this.logger.log(`Admin alert sent for suspicious activity: ${activity.id}`)
    } catch (error) {
      this.logger.error(`Failed to send admin alert: ${error.message}`)
    }
  }

  private async sendUserAlert(activity: SuspiciousActivity): Promise<void> {
    try {
      if (!activity.userId) return

      // In a real application, you would fetch the user's email from the database
      // For now, we'll just log the notification
      this.logger.log(`User alert would be sent for suspicious activity: ${activity.id} to user ${activity.userId}`)

      // Example of how you might send a user alert in a real application:
      // const user = await this.userService.findById(activity.userId);
      // if (user && user.email) {
      //   const subject = `Security Alert: Unusual Activity Detected`;
      //   const template = "user-security-alert";
      //   const context = {
      //     userName: user.name,
      //     activityType: activity.activityType,
      //     timestamp: activity.createdAt.toISOString(),
      //     ipAddress: activity.ipAddress,
      //     location: activity.geolocation || "Unknown location",
      //     securitySettingsUrl: `${process.env.APP_URL}/settings/security`,
      //   };
      //   await this.notificationService.sendEmail(user.email, subject, template, context);
      // }
    } catch (error) {
      this.logger.error(`Failed to send user alert: ${error.message}`)
    }
  }

  private async lockUserAccount(userId: string): Promise<void> {
    try {
      // In a real application, you would update the user's account status in the database
      // For now, we'll just log the action
      this.logger.warn(`Account locked for user ${userId} due to suspicious activity`)

      // Example of how you might lock an account in a real application:
      // await this.userService.updateUserStatus(userId, 'locked');
      // await this.userService.createAuditLog({
      //   userId,
      //   action: 'account_locked',
      //   reason: 'Suspicious activity detected',
      //   performedBy: 'system',
      // });
    } catch (error) {
      this.logger.error(`Failed to lock user account: ${error.message}`)
    }
  }

  private async requireMFA(userId: string): Promise<void> {
    try {
      // In a real application, you would update the user's MFA requirements in the database
      // For now, we'll just log the action
      this.logger.log(`MFA requirement enabled for user ${userId} due to suspicious activity`)

      // Example of how you might require MFA in a real application:
      // await this.userService.updateMFARequirement(userId, true);
    } catch (error) {
      this.logger.error(`Failed to require MFA: ${error.message}`)
    }
  }

  private updateUserRiskProfile(userId: string, analysisResult: ActivityAnalysisResult): void {
    let profile = this.userRiskProfiles.get(userId)

    if (!profile) {
      profile = {
        userId,
        riskScore: 0,
        lastUpdated: new Date(),
        recentActivities: 0,
        suspiciousActivities: 0,
        accountAge: 0, // This would be calculated from user creation date
        knownLocations: [],
        knownDevices: [],
        riskFactors: [],
      }
    }

    // Update profile
    profile.lastUpdated = new Date()
    profile.recentActivities++

    if (analysisResult.isSuspicious) {
      profile.suspiciousActivities++
      profile.riskScore = Math.min(100, profile.riskScore + analysisResult.riskScore)

      // Add new risk factors
      for (const factor of analysisResult.riskFactors) {
        if (!profile.riskFactors.includes(factor)) {
          profile.riskFactors.push(factor)
        }
      }
    } else {
      // Gradually decrease risk score over time for normal activity
      profile.riskScore = Math.max(0, profile.riskScore - 0.5)
    }

    // Update known locations and devices
    const knownLocations = Array.from(this.knownUserLocations.get(userId) || new Set())
    const knownDevices = Array.from(this.knownUserDevices.get(userId) || new Set())

    profile.knownLocations = knownLocations
    profile.knownDevices = knownDevices

    // Save updated profile
    this.userRiskProfiles.set(userId, profile)
  }

  private getSeverityValue(severity: SeverityLevel): number {
    switch (severity) {
      case SeverityLevel.CRITICAL:
        return 4
      case SeverityLevel.HIGH:
        return 3
      case SeverityLevel.MEDIUM:
        return 2
      case SeverityLevel.LOW:
      default:
        return 1
    }
  }

  async getSuspiciousActivities(query: ActivityQueryDto): Promise<{
    activities: SuspiciousActivity[]
    total: number
  }> {
    const queryBuilder = this.suspiciousActivityRepository.createQueryBuilder("activity")

    if (query.activityType) {
      queryBuilder.andWhere("activity.activityType = :activityType", { activityType: query.activityType })
    }

    if (query.severityLevel) {
      queryBuilder.andWhere("activity.severityLevel = :severityLevel", { severityLevel: query.severityLevel })
    }

    if (query.userId) {
      queryBuilder.andWhere("activity.userId = :userId", { userId: query.userId })
    }

    if (query.ipAddress) {
      queryBuilder.andWhere("activity.ipAddress = :ipAddress", { ipAddress: query.ipAddress })
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("activity.createdAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      })
    }

    if (query.resolved !== undefined) {
      queryBuilder.andWhere("activity.isResolved = :resolved", { resolved: query.resolved })
    }

    const [activities, total] = await queryBuilder
      .orderBy("activity.createdAt", "DESC")
      .limit(query.limit)
      .offset(query.offset)
      .getManyAndCount()

    return { activities, total }
  }

  async getSuspiciousActivityById(id: string): Promise<SuspiciousActivity> {
    return this.suspiciousActivityRepository.findOne({ where: { id } })
  }

  async resolveSuspiciousActivity(
    id: string,
    resolutionNotes: string,
    resolvedById: string,
  ): Promise<SuspiciousActivity> {
    const activity = await this.suspiciousActivityRepository.findOne({ where: { id } })

    if (!activity) {
      throw new Error(`Suspicious activity with ID ${id} not found`)
    }

    activity.isResolved = true
    activity.resolutionNotes = resolutionNotes
    activity.resolvedAt = new Date()
    activity.resolvedById = resolvedById

    return this.suspiciousActivityRepository.save(activity)
  }

  async getActivityStats(): Promise<SuspiciousActivityStats> {
    const [
      totalActivities,
      unresolvedActivities,
      criticalActivities,
      highActivities,
      mediumActivities,
      lowActivities,
      topRiskFactors,
      topIpAddresses,
      activityByType,
      recentActivities,
    ] = await Promise.all([
      this.suspiciousActivityRepository.count(),
      this.suspiciousActivityRepository.count({ where: { isResolved: false } }),
      this.suspiciousActivityRepository.count({ where: { severityLevel: SeverityLevel.CRITICAL } }),
      this.suspiciousActivityRepository.count({ where: { severityLevel: SeverityLevel.HIGH } }),
      this.suspiciousActivityRepository.count({ where: { severityLevel: SeverityLevel.MEDIUM } }),
      this.suspiciousActivityRepository.count({ where: { severityLevel: SeverityLevel.LOW } }),
      this.suspiciousActivityRepository
        .createQueryBuilder("activity")
        .select("unnest(activity.riskFactors)", "factor")
        .addSelect("COUNT(*)", "count")
        .groupBy("factor")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany(),
      this.suspiciousActivityRepository
        .createQueryBuilder("activity")
        .select("activity.ipAddress", "ipAddress")
        .addSelect("COUNT(*)", "count")
        .groupBy("activity.ipAddress")
        .orderBy("count", "DESC")
        .limit(10)
        .getRawMany(),
      this.suspiciousActivityRepository
        .createQueryBuilder("activity")
        .select("activity.activityType", "type")
        .addSelect("COUNT(*)", "count")
        .groupBy("activity.activityType")
        .getRawMany()
        .then((results) =>
          results.reduce(
            (acc, item) => {
              acc[item.type] = Number.parseInt(item.count, 10)
              return acc
            },
            {} as Record<ActivityType, number>,
          ),
        ),
      this.suspiciousActivityRepository
        .createQueryBuilder("activity")
        .where("activity.createdAt > :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
        .getCount(),
    ])

    return {
      totalActivities,
      unresolvedActivities,
      criticalActivities,
      highActivities,
      mediumActivities,
      lowActivities,
      topRiskFactors: topRiskFactors.map((item) => ({
        factor: item.factor,
        count: Number.parseInt(item.count, 10),
      })),
      topIpAddresses: topIpAddresses.map((item) => ({
        ipAddress: item.ipAddress,
        count: Number.parseInt(item.count, 10),
      })),
      activityByType,
      recentActivities,
    }
  }

  async getUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
    return this.userRiskProfiles.get(userId) || null
  }

  async getAllRules(): Promise<ActivityRule[]> {
    return this.activityRuleRepository.find({ order: { createdAt: "DESC" } })
  }

  async getRuleById(id: string): Promise<ActivityRule> {
    return this.activityRuleRepository.findOne({ where: { id } })
  }

  async createRule(createRuleDto: CreateRuleDto): Promise<ActivityRule> {
    const rule = this.activityRuleRepository.create(createRuleDto)
    return this.activityRuleRepository.save(rule)
  }

  async updateRule(id: string, updateRuleDto: UpdateRuleDto): Promise<ActivityRule> {
    const rule = await this.activityRuleRepository.findOne({ where: { id } })

    if (!rule) {
      throw new Error(`Rule with ID ${id} not found`)
    }

    // Update rule properties
    Object.assign(rule, updateRuleDto)

    return this.activityRuleRepository.save(rule)
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.activityRuleRepository.findOne({ where: { id } })

    if (!rule) {
      throw new Error(`Rule with ID ${id} not found`)
    }

    if (rule.isSystem) {
      throw new Error("Cannot delete system rules")
    }

    await this.activityRuleRepository.remove(rule)
  }

  async toggleRuleStatus(id: string, status: RuleStatus): Promise<ActivityRule> {
    const rule = await this.activityRuleRepository.findOne({ where: { id } })

    if (!rule) {
      throw new Error(`Rule with ID ${id} not found`)
    }

    rule.status = status
    return this.activityRuleRepository.save(rule)
  }
}
