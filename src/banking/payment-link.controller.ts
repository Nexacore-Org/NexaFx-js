@Post()
@UseGuards(AuthGuard)
createLink(@Req() req, @Body() dto: CreatePaymentLinkDto) {
  return this.paymentLinkService.createPaymentLink(req.user.id, dto);
}