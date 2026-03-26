it('returns roles with inheritance chain', async () => {
  const res = await request(app.getHttpServer())
    .get('/admin/rbac/roles')
    .expect(200);

  expect(res.body[0]).toHaveProperty('inheritanceChain');
});
async getRolesWithInheritance() {
  const roles = await this.roleRepository.find();

  const roleMap = new Map<string, Role>();
  roles.forEach(role => roleMap.set(role.id, role));

  const resolveChain = (roleId: string, visited = new Set<string>()): string[] => {
    if (visited.has(roleId)) return []; // safety against bad data

    visited.add(roleId);

    const role = roleMap.get(roleId);
    if (!role || !role.parentRoleId) return [];

    return [
      role.parentRoleId,
      ...resolveChain(role.parentRoleId, visited),
    ];
  };

  return roles.map(role => ({
    id: role.id,
    name: role.name,
    description: role.description,
    parentRoleId: role.parentRoleId,
    inheritanceChain: resolveChain(role.id),
  }));
}