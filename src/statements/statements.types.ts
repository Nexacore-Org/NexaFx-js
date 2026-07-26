import { User } from '../users/user.entity';

export interface StatementLine {
  date: string;
  description: string;
  amount: number;
  reference: string;
  source: 'transaction' | 'fx';
}

export interface StatementView {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  currency: string;
  period: {
    from: string;
    to: string;
  };
  openingBalance: number;
  closingBalance: number;
  lines: StatementLine[];
  generatedAt: string;
}
