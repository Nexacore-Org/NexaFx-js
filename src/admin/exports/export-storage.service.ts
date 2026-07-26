import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';

const EXPORTS_DIR =
  process.env.EXPORTS_DIR || join(process.cwd(), 'tmp', 'exports');
const DOWNLOAD_TTL_SECONDS = 900;

interface DownloadTokenPayload {
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
  constructor(private readonly jwtService: JwtService) {
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
    renameSync(sourcePath, join(EXPORTS_DIR, filename));

    const token = this.jwtService.sign(
      { jobId, filename } as DownloadTokenPayload,
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    );
    return {
      downloadUrl: `/api/v1/admin/exports/${jobId}/download?token=${token}`,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000),
    };
  }

  resolve(jobId: string, token: string): string {
    let payload: DownloadTokenPayload;
    try {
      payload = this.jwtService.verify<DownloadTokenPayload>(token);
    } catch {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    if (payload.jobId !== jobId) {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    return join(EXPORTS_DIR, payload.filename);
  }
}
