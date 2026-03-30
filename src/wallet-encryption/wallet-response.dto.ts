import { Exclude, Expose } from 'class-transformer';

/**
 * All API responses go through this DTO.
 * The `privateKeyEncrypted` field is NEVER present in any response.
 */
@Exclude()
export class WalletResponseDto {
  @Expose()
  id: string;

  @Expose()
  address: string;

  @Expose()
  network: string;

  @Expose()
  userId: string;

  @Expose()
  isActive: boolean;

  @Expose()
  keyVersion: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  // privateKeyEncrypted is intentionally omitted — no @Expose()
}
