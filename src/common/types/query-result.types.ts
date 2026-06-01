import { SelectQueryBuilder } from 'typeorm';

/**
 * Execute a TypeORM query builder and return explicitly typed results.
 * Prevents `any`-typed query results slipping through TypeScript.
 */
export async function executeQuery<T>(qb: SelectQueryBuilder<T>): Promise<T[]> {
  return qb.getMany();
}

/**
 * Transformer for PostgreSQL numeric columns.
 * pg returns NUMERIC/DECIMAL as strings — this converts them to JS numbers.
 */
export const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

/**
 * Use this type for raw query projections instead of `any`.
 * Example: const rows: RawRow<{ total: number }> = await qb.getRawMany();
 */
export type RawRow<T extends Record<string, unknown>> = T;