interface DisputeConfig {
  // SLA Configuration
  sla: {
    initialResponse: number;
    simpleResolution: number;
    complexResolution: number;
    escalatedResolution: number;
  };

  // Priority thresholds
  priority: {
    critical: {
      amountThreshold: number;
      userTierThreshold: number;
    };
    high: {
      amountThreshold: number;
    };
  };

  // File upload limits
  upload: {
    maxFileSize: number;
    maxFiles: number;
    allowedMimeTypes: string[];
  };

  // OCR Configuration
  ocr: {
    supportedMimeTypes: string[];
    confidenceThreshold: number;
    languages: string[];
  };

  // Auto-resolution rules
  autoResolution: {
    enabled: boolean;
    fraudScoreThreshold: number;
    maxAmountForAutoResolution: number;
    duplicateChargeRules: {
      enabled: boolean;
      timeWindow: number;
      similarityThreshold: number;
    };
    technicalErrorRules: {
      enabled: boolean;
      systemConfirmationRequired: boolean;
    };
  };

  // Notification settings
  notifications: {
    email: {
      enabled: boolean;
      from: string;
      templates: {
        disputeCreated: string;
        disputeAssigned: string;
        disputeResolved: string;
        disputeComment: string;
        disputeEscalated: string;
        slaViolation: string;
      };
    };
    sms: {
      enabled: boolean;
      provider: string;
    };
    push: {
      enabled: boolean;
      provider: string;
    };
  };

  // Queue configuration
  queues: {
    dispute: {
      concurrency: number;
      retryAttempts: number;
      retryDelay: number;
    };
    notification: {
      concurrency: number;
      retryAttempts: number;
      retryDelay: number;
    };
    ocr: {
      concurrency: number;
      retryAttempts: number;
      retryDelay: number;
    };
  };

  // Fraud detection
  fraud: {
    enabled: boolean;
    rules: {
      maxDisputesPerUser: number;
      maxDisputesPerTransaction: number;
      suspiciousAmounts: {
        enabled: boolean;
        thresholds: number[];
      };
      duplicateDetection: {
        enabled: boolean;
        timeWindow: number;
        similarityThreshold: number;
      };
    };
    scoring: {
      highRiskThreshold: number;
      mediumRiskThreshold: number;
      lowRiskThreshold: number;
    };
  };

  // Refund configuration
  refund: {
    enabled: boolean;
    maxRefundAmount: number;
    processingTime: number;
    retryAttempts: number;
  };

  // Data retention
  retention: {
    disputeData: number;
    evidenceFiles: number;
    auditLogs: number;
    timelineEntries: number;
  };

  // Business hours for SLA calculations
  businessHours: {
    enabled: boolean;
    timezone: string;
    workingDays: number[];
    workingHours: {
      start: string;
      end: string;
    };
  };

  // Rate limiting
  rateLimit: {
    createDispute: {
      windowMs: number;
      maxRequests: number;
    };
    uploadEvidence: {
      windowMs: number;
      maxRequests: number;
    };
    addComment: {
      windowMs: number;
      maxRequests: number;
    };
  };
}

export const disputeConfig: DisputeConfig = {
  // SLA Configuration
  sla: {
    initialResponse: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    simpleResolution: 24 * 60 * 60 * 1000, // 24 hours
    complexResolution: 72 * 60 * 60 * 1000, // 72 hours
    escalatedResolution: 5 * 24 * 60 * 60 * 1000, // 5 business days
  },

  // Priority thresholds
  priority: {
    critical: {
      amountThreshold: 100000, // ₦100,000
      userTierThreshold: 3,
    },
    high: {
      amountThreshold: 50000, // ₦50,000
    },
  },

  // File upload limits
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ],
  },

  // OCR Configuration
  ocr: {
    supportedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
    ],
    confidenceThreshold: 0.7,
    languages: ['eng'],
  },

  // Auto-resolution rules
  autoResolution: {
    enabled: true,
    fraudScoreThreshold: 20, // Only low-risk disputes (≤20) are auto-resolved
    maxAmountForAutoResolution: 50000, // ₦50,000
    duplicateChargeRules: {
      enabled: true,
      timeWindow: 24 * 60 * 60 * 1000, // 24 hours
      similarityThreshold: 0.9,
    },
    technicalErrorRules: {
      enabled: true,
      systemConfirmationRequired: true,
    },
  },

  // Notification settings
  notifications: {
    email: {
      enabled: true,
      from: 'noreply@nexafx.com',
      templates: {
        disputeCreated: 'dispute-created',
        disputeAssigned: 'dispute-assigned',
        disputeResolved: 'dispute-resolved',
        disputeComment: 'dispute-comment',
        disputeEscalated: 'dispute-escalated',
        slaViolation: 'sla-violation',
      },
    },
    sms: {
      enabled: false,
      provider: 'twilio', // or 'aws-sns'
    },
    push: {
      enabled: false,
      provider: 'firebase',
    },
  },

  // Queue configuration
  queues: {
    dispute: {
      concurrency: 5,
      retryAttempts: 3,
      retryDelay: 60000, // 1 minute
    },
    notification: {
      concurrency: 10,
      retryAttempts: 5,
      retryDelay: 30000, // 30 seconds
    },
    ocr: {
      concurrency: 3,
      retryAttempts: 2,
      retryDelay: 120000, // 2 minutes
    },
  },

  // Fraud detection
  fraud: {
    enabled: true,
    rules: {
      maxDisputesPerUser: 5, // per month
      maxDisputesPerTransaction: 1,
      suspiciousAmounts: {
        enabled: true,
        thresholds: [1000, 5000, 10000, 50000, 100000],
      },
      duplicateDetection: {
        enabled: true,
        timeWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
        similarityThreshold: 0.8,
      },
    },
    scoring: {
      highRiskThreshold: 80,
      mediumRiskThreshold: 50,
      lowRiskThreshold: 20,
    },
  },

  // Refund configuration
  refund: {
    enabled: true,
    maxRefundAmount: 1000000, // ₦1,000,000
    processingTime: 24 * 60 * 60 * 1000, // 24 hours
    retryAttempts: 3,
  },

  // Data retention
  retention: {
    disputeData: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years (NDPR compliant)
    evidenceFiles: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years (NDPR compliant)
    auditLogs: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years (NDPR compliant)
    timelineEntries: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years (NDPR compliant)
  },

  // Business hours for SLA calculations
  businessHours: {
    enabled: true,
    timezone: 'Africa/Lagos',
    workingDays: [1, 2, 3, 4, 5], // Monday to Friday
    workingHours: {
      start: '09:00',
      end: '17:00',
    },
  },

  // Rate limiting
  rateLimit: {
    createDispute: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 5,
    },
    uploadEvidence: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 20,
    },
    addComment: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10,
    },
  },
};
