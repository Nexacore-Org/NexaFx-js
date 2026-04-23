import { DataSource } from 'typeorm';
import { Role } from '../../hierachial-rbac/role.entity';

export async function seedRoles(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Role);

  const roles: Partial<Role>[] = [
    { name: 'super_admin', description: 'Full system access', priority: 100, isSystem: true, isActive: true },
    { name: 'admin', description: 'Administrative access', priority: 80, isSystem: true, isActive: true },
    { name: 'compliance_officer', description: 'Compliance and AML access', priority: 60, isSystem: false, isActive: true },
    { name: 'support', description: 'Customer support access', priority: 40, isSystem: false, isActive: true },
    { name: 'user', description: 'Standard user', priority: 10, isSystem: true, isActive: true },
  ];

  for (const role of roles) {
    const existing = await repo.findOne({ where: { name: role.name } });
    if (!existing) {
      await repo.save(repo.create(role));
    }
  }

  console.log(`Seeded ${roles.length} RBAC roles`);
}
