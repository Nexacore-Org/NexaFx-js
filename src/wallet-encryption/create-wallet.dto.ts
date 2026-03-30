import { IsString, IsNotEmpty, Length, IsUUID } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  network: string;

  /**
   * Plain-text private key supplied by caller (e.g., generated client-side
   * or derived from a seed).  It is encrypted immediately and the plain value
   * is never persisted.
   */
  @IsString()
  @IsNotEmpty()
  @Length(1, 512)
  privateKey: string;

  @IsUUID()
  userId: string;
}

export class UpdateWalletPrivateKeyDto {
  /**
   * New plain-text private key.  Encrypted before storage.
   */
  @IsString()
  @IsNotEmpty()
  @Length(1, 512)
  privateKey: string;
}
