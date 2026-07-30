export interface WalletBalance {
  id?: string;
  accountId: string;
  currency: string;
  balance: number;
  label?: string;
  color?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
