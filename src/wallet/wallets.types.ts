export interface WalletBalance {
  id?: string;
  accountId: string;
  currency: string;
  balance: number;
  createdAt?: Date;
  updatedAt?: Date;
}
