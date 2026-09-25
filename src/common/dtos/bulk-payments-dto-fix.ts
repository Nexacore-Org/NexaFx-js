export interface BulkPaymentRecipientItem {
  recipientId: string;
  amount: string;
  currency: string;
}

export function mapBulkPaymentPayload(items: BulkPaymentRecipientItem[]) {
  return items.map(item => ({
    ...item,
    processedAt: new Date().toISOString(),
  }));
}
