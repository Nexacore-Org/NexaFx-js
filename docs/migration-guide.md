# Migration Guide

## Expand/Contract Pattern

All schema changes follow the expand/contract pattern to ensure zero downtime:

1. **Expand** — add new columns/tables (nullable, backward-compatible)
2. **Deploy** — deploy app code that writes to both old and new schema
3. **Backfill** — migrate existing data
4. **Contract** — remove old columns/tables in a subsequent migration

## Commands

```bash
# Run all pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate a new migration from entity changes
npm run migration:generate -- src/database/migrations/MigrationName

# Preview SQL without applying (dry run)
npm run migration:dryrun

# Seed config entities
npm run seed
```

## Rules

- `synchronize: false` is enforced for all environments — never use `synchronize: true` in production
- Every `up()` must have an exact inverse `down()`
- Seed scripts are idempotent (upsert pattern — safe to run multiple times)
- New columns must be nullable or have a default value in the `up()` migration

## Example Migration

```typescript
export class AddUserCountry1700000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // EXPAND: add nullable column
    await queryRunner.addColumn('users', new TableColumn({
      name: 'country',
      type: 'varchar',
      length: '2',
      isNullable: true,
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'country');
  }
}
```
