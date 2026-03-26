it('should create a payment link', async () => {
  const res = await request(app.getHttpServer())
    .post('/payment-links')
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 5000,
      maxUses: 3,
    })
    .expect(201);

  expect(res.body).toHaveProperty('code');
  expect(res.body).toHaveProperty('url');
});