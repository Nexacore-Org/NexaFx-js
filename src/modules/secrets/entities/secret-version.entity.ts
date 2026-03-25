import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import * as crypto from 'crypto';

export type SecretType = 'JWT' | 'WALLET_ENCRYPTION' | 'WEBHOOK';

const DEFAULT_KEY = '0123456789abcdef0123456789abcdef';
const SECRET_IV_LENGTH = 12; // AES-GCM recommended IV size

const getEncryptionKey = () => {
  const raw = process.env.SECRET_ENCRYPTION_KEY || DEFAULT_KEY;
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32));
};

const encryptionTransformer: ValueTransformer = {
  to(value: string | null): string | null {
    if (value === null || value === undefined) return value as null;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(SECRET_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  },
  from(value: string | null): string | null {
    if (!value) return value;

    const raw = Buffer.from(value, 'base64');
    const iv = raw.subarray(0, SECRET_IV_LENGTH);
    const authTag = raw.subarray(SECRET_IV_LENGTH, SECRET_IV_LENGTH + 16);
    const data = raw.subarray(SECRET_IV_LENGTH + 16);

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  },
};

@Entity('secret_versions')
@Index('idx_secret_versions_type_version', ['type', 'version'], { unique: true })
@Index('idx_secret_versions_type_expires_at', ['type', 'expiresAt'])
export class SecretVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: SecretType;

  @Column({ type: 'int' })
  version: number;

  // Encrypted at rest via transformer; never log this value
  @Column({ type: 'text', transformer: encryptionTransformer })
  value: string;

  // Null means active; once set, version is in grace period until expiresAt passes
  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
