// src/modules/incidents/entities/incident.entity.ts
export class Incident {
  id: string;
  type: 'ERROR_SPIKE' | 'THRESHOLD_EXCEEDED' | 'LATENCY_HIGH';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  timestamp: number;
  resolved: boolean = false;
}