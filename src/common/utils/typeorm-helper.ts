export interface QueryConditionOptions<T> {
  where: Partial<Record<keyof T, unknown>>;
  limit?: number;
  offset?: number;
}

export function buildTypedFindOptions<T>(options: QueryConditionOptions<T>) {
  return {
    where: options.where,
    take: options.limit ?? 20,
    skip: options.offset ?? 0,
  };
}
