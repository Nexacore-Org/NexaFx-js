async createPaymentLink(userId: string, dto: CreatePaymentLinkDto) {
  const code = await this.generateUniqueCode();

  const link = this.repo.create({
    code,
    ownerId: userId,
    amount: dto.amount,
    description: dto.description,
    maxUses: dto.maxUses,
    expiresAt: dto.expiresAt,
  });

  await this.repo.save(link);

  return {
    code,
    url: `${this.configService.get('APP_BASE_URL')}/payment-links/${code}`,
  };
}