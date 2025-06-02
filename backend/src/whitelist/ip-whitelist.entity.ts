export interface IpWhitelist {
    id: string;
    ipAddress: string;
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
  }
  
  