import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { TokenType } from '../../auth/token-types';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { join } from 'path';

const EXPORTS_DIR =
  process.env.EXPORTS_DIR || join(process.cwd(), 'tmp', 'exports');
const DOWNLOAD_TTL_SECONDS = 900;

interface DownloadTokenPayload {
  typ: TokenType.EXPORT_DOWNLOAD;
  jobId: string;
  filename: string;
}

/**
 * Stores completed export files and issues time-limited download links.
 * This is a local-disk stand-in for an S3 pre-signed URL — swapping in
 * @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner later only requires
 * changing this one service.
 */
@Injectable()
export class ExportStorageService {
  private readonly logger = new Logger(ExportStorageService.name);
  private readonly downloadSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    // Download links use a secret derived from (but distinct from) the access
    // token secret, so a download token can never verify as an access token.
    this.downloadSecret = createHmac('sha256', config.get<string>('jwt.secret') ?? '')
      .update('export-download')
      .digest('hex');
    if (!existsSync(EXPORTS_DIR)) {
      mkdirSync(EXPORTS_DIR, { recursive: true });
    }
  }

  store(
    sourcePath: string,
    jobId: string,
    extension: string,
  ): { downloadUrl: string; expiresAt: Date } {
    const filename = `${jobId}.${extension}`;
    // copy + unlink instead of rename: EXPORTS_DIR may be on another filesystem
    // (Docker volume, tmpfs /tmp), where rename fails with EXDEV.
    copyFileSync(sourcePath, join(EXPORTS_DIR, filename));
    try {
      unlinkSync(sourcePath);
    } catch {
      // The export is already stored; a leftover temp file is harmless.
    }

    const token = this.jwtService.sign(
      { jobId, filename, typ: TokenType.EXPORT_DOWNLOAD } as DownloadTokenPayload,
      { secret: this.downloadSecret, expiresIn: DOWNLOAD_TTL_SECONDS },
    );
    return {
      downloadUrl: `/api/v1/admin/exports/${jobId}/download?token=${token}`,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000),
    };
  }

  resolve(jobId: string, token: string): string {
    let payload: DownloadTokenPayload;
    try {
      payload = this.jwtService.verify<DownloadTokenPayload>(token, {
        secret: this.downloadSecret,
      });
    } catch {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    if (payload.typ !== TokenType.EXPORT_DOWNLOAD || payload.jobId !== jobId) {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    return join(EXPORTS_DIR, payload.filename);
  }

  /** Whether the stored file for a resolved download path still exists. */
  exists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Delete export files older than the download-link lifetime. Returns the
   * number removed. Runs on a schedule so full transaction dumps do not pile
   * up on disk after their links have expired.
   */
  purgeExpired(maxAgeMs: number = DOWNLOAD_TTL_SECONDS * 1000, now: number = Date.now()): number {
    if (!existsSync(EXPORTS_DIR)) return 0;
    let removed = 0;
    for (const name of readdirSync(EXPORTS_DIR)) {
      const path = join(EXPORTS_DIR, name);
      try {
        const stat = statSync(path);
        if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
          unlinkSync(path);
          removed += 1;
        }
      } catch (err) {
        this.logger.warn(`Could not purge ${name}: ${(err as Error).message}`);
      }
    }
    return removed;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  cleanupExpiredExports(): void {
    const removed = this.purgeExpired();
    if (removed > 0) this.logger.log(`Deleted ${removed} expired export file(s)`);
  }
}
