import { Injectable, Logger } from '@nestjs/common';

/**
 * Evaluates simple JSONPath-style filter conditions against a webhook payload.
 *
 * Filter format:
 *   { "path": "$.currency", "op": "eq", "value": "USD" }
 *   { "path": "$.amount", "op": "gt", "value": 100 }
 *
 * Supported ops: eq, neq, gt, gte, lt, lte, contains, exists
 */
@Injectable()
export class WebhookFilterService {
  private readonly logger = new Logger(WebhookFilterService.name);

  matches(payload: Record<string, any>, filter: Record<string, any>): boolean {
    try {
      const { path, op, value } = filter;
      if (!path || !op) return true;

      const fieldValue = this.resolvePath(payload, path);

      switch (op) {
        case 'eq':
          return fieldValue === value;
        case 'neq':
          return fieldValue !== value;
        case 'gt':
          return typeof fieldValue === 'number' && fieldValue > value;
        case 'gte':
          return typeof fieldValue === 'number' && fieldValue >= value;
        case 'lt':
          return typeof fieldValue === 'number' && fieldValue < value;
        case 'lte':
          return typeof fieldValue === 'number' && fieldValue <= value;
        case 'contains':
          return typeof fieldValue === 'string' && fieldValue.includes(String(value));
        case 'exists':
          return fieldValue !== undefined && fieldValue !== null;
        default:
          this.logger.warn(`Unknown filter op: ${op}`);
          return true;
      }
    } catch (err: any) {
      this.logger.warn(`Filter evaluation error: ${err?.message}`);
      return true;
    }
  }

  private resolvePath(obj: Record<string, any>, path: string): any {
    // Support simple JSONPath: $.field.nested or just field.nested
    const normalized = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : path;
    const parts = normalized.split('.');
    let current: any = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }
}
