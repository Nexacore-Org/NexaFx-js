import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AnomalyDetectionService {
  constructor(private dataSource: DataSource) {}

  // Haversine formula to calculate distance between two points in KM
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async detectCircularTransfer(startWallet: string, maxHops = 5, timeWindowMinutes = 30): Promise<boolean> {
    const timeLimit = new Date(Date.now() - timeWindowMinutes * 60000);
    
    // Recursive CTE to find cycles (A -> B -> C -> A)
    const query = `
      WITH RECURSIVE transfer_path AS (
        SELECT "recipientAddress", "senderAddress", 1 as depth, ARRAY["senderAddress"] as path
        FROM transactions
        WHERE "senderAddress" = $1 AND "createdAt" >= $2
        
        UNION ALL
        
        SELECT t."recipientAddress", t."senderAddress", tp.depth + 1, tp.path || t."senderAddress"
        FROM transactions t
        INNER JOIN transfer_path tp ON t."senderAddress" = tp."recipientAddress"
        WHERE tp.depth < $3 
          AND t."createdAt" >= $2
          AND NOT (t."senderAddress" = ANY(tp.path)) -- Prevent infinite loops until the end
      )
      SELECT EXISTS (
        SELECT 1 FROM transfer_path WHERE "recipientAddress" = $1 AND depth > 1
      );
    `;
    
    const result = await this.dataSource.query(query, [startWallet, timeLimit, maxHops]);
    return result[0].exists;
  }
}